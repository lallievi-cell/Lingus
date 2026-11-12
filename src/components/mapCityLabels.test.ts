import { describe, expect, it } from 'vitest';
import { planCityLabels, type CityLabelCandidate } from './mapCityLabels';

const bounds = { minX: 8, minY: 8, maxX: 312, maxY: 208 };
const candidate = (id: string, x = 160, baseline = 110): CityLabelCandidate => ({
  id,
  x,
  baseline,
  width: 130,
  ascent: 12,
  descent: 14,
  priority: 0,
  selected: false,
});

describe('readable city labels at regional scale', () => {
  it('moves neighbouring names into non-overlapping rows without changing map anchors', () => {
    const labels = Array.from({ length: 8 }, (_, index) =>
      candidate(`city-${index}`, index % 2 ? 300 : 20, 75 + Math.floor(index / 2) * 18),
    );
    const before = structuredClone(labels);
    const planned = planCityLabels(labels, bounds);
    expect(planned.size).toBe(8);
    expect(labels).toEqual(before);
    const positions = [...planned.values()];
    for (const [index, label] of positions.entries()) {
      expect(label.left).toBeGreaterThanOrEqual(bounds.minX);
      expect(label.right).toBeLessThanOrEqual(bounds.maxX);
      expect(label.top).toBeGreaterThanOrEqual(bounds.minY);
      expect(label.bottom).toBeLessThanOrEqual(bounds.maxY);
      for (const other of positions.slice(index + 1))
        expect(
          label.left >= other.right ||
            label.right <= other.left ||
            label.top >= other.bottom ||
            label.bottom <= other.top,
        ).toBe(true);
    }
    expect(positions.some((position) => position.displaced)).toBe(true);
    expect(planCityLabels([...labels].reverse(), bounds)).toEqual(planned);
  });

  it('keeps the selected settlement readable when a dense city cluster must lose secondary names', () => {
    const labels = Array.from({ length: 40 }, (_, index) => candidate(`city-${index}`));
    labels[0].priority = 100;
    labels[39].selected = true;
    const planned = planCityLabels(labels, { ...bounds, maxX: 180, maxY: 110 });
    expect(planned.has('city-39')).toBe(true);
    expect(planned.size).toBeLessThan(labels.length);
    expect(planned.get('city-39')?.width).toBeLessThanOrEqual(172);
    expect(planCityLabels(labels, { ...bounds, maxX: 180, maxY: 110 })).toEqual(planned);
  });
});
