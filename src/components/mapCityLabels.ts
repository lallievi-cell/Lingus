export interface CityLabelCandidate {
  id: string;
  x: number;
  baseline: number;
  width: number;
  ascent: number;
  descent: number;
  priority: number;
  selected: boolean;
}

export interface CityLabelPlacement {
  x: number;
  baseline: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  displaced: boolean;
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Pack only names, never settlements: all map positions and pick targets stay
 * authoritative. Screen-space rows keep the result readable at every zoom. */
export function planCityLabels(candidates: readonly CityLabelCandidate[], bounds: Bounds) {
  const placements = new Map<string, CityLabelPlacement>();
  const ordered = [...candidates].sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) ||
      b.priority - a.priority ||
      a.baseline - b.baseline ||
      a.id.localeCompare(b.id),
  );
  const availableWidth = Math.max(1, bounds.maxX - bounds.minX);
  for (const candidate of ordered) {
    const width = Math.min(candidate.width, availableWidth);
    const baseX = clamp(candidate.x, bounds.minX + width / 2, bounds.maxX - width / 2);
    const baseY = clamp(
      candidate.baseline,
      bounds.minY + candidate.ascent,
      bounds.maxY - candidate.descent,
    );
    const row = candidate.ascent + candidate.descent + 4;
    let chosen: CityLabelPlacement | undefined;
    for (const dy of [0, -row, row, -row * 2, row * 2, -row * 3, row * 3]) {
      for (const dx of [0, -16, 16]) {
        const x = clamp(baseX + dx, bounds.minX + width / 2, bounds.maxX - width / 2);
        const baseline = clamp(
          baseY + dy,
          bounds.minY + candidate.ascent,
          bounds.maxY - candidate.descent,
        );
        const placement = {
          x,
          baseline,
          left: x - width / 2,
          right: x + width / 2,
          top: baseline - candidate.ascent,
          bottom: baseline + candidate.descent,
          width,
          displaced: Math.abs(x - candidate.x) > 2 || Math.abs(baseline - candidate.baseline) > 2,
        };
        let overlaps = false;
        for (const other of placements.values())
          if (
            placement.left < other.right + 4 &&
            placement.right > other.left - 4 &&
            placement.top < other.bottom + 4 &&
            placement.bottom > other.top - 4
          ) {
            overlaps = true;
            break;
          }
        if (!overlaps || (candidate.selected && placements.size === 0)) {
          chosen = placement;
          break;
        }
      }
      if (chosen) break;
    }
    if (chosen) placements.set(candidate.id, chosen);
  }
  return placements;
}
