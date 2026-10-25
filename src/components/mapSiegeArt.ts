import { BUILDING_SPECS } from '../game/content';
import type { Battalion, Building, City, GameState } from '../game/types';
import { getBattalionDisplayPoint } from './regionalLayout';

type Point = { x: number; y: number };
export interface SiegeViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface SiegeOptions {
  reducedMotion?: boolean;
  viewport?: SiegeViewport;
  pixelRatio?: number;
}
export interface SiegePresentation {
  battalionId: string;
  cityId: string;
  city: City;
  phase: 'walls' | 'garrison' | 'occupation' | 'sacking';
  wall?: Building;
  wallRatio: number;
  occupationSeconds: number;
  occupationRatio: number;
}
export interface SiegeProjectile {
  from: Point;
  to: Point;
  position: Point;
  progress: number;
  impact: number;
  reducedMotion: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const worldPoint = (point: Point) => ({ x: point.x * 2.4, y: point.y * 1.6 });
const revealed = (state: GameState, point: Point) =>
  state.tier >= 4 ||
  state.sectors.some(
    (sector) =>
      sector.explored &&
      sector.x === Math.min(4, Math.floor(point.x / 100)) &&
      sector.y === Math.min(4, Math.floor(point.y / 100)),
  );
const inView = (point: Point, view?: SiegeViewport) =>
  !view ||
  (point.x >= view.minX - 40 &&
    point.x <= view.maxX + 40 &&
    point.y >= view.minY - 45 &&
    point.y <= view.maxY + 45);

/** Mirrors the actual attack phases, without making a stale city counter an occupation. */
export function deriveSiegePresentation(
  state: GameState,
  battalion: Battalion,
): SiegePresentation | undefined {
  if (
    state.tier < 4 ||
    battalion.hp <= 0 ||
    !['attacking', 'conquering'].includes(battalion.action)
  )
    return undefined;
  const city = state.cities.find((candidate) => candidate.id === battalion.targetId);
  if (
    !city ||
    city.factionId === 'ruins' ||
    city.factionId === battalion.factionId ||
    Math.hypot(battalion.x - city.x, battalion.y - city.y) > 3 ||
    !revealed(state, city) ||
    !revealed(state, battalion)
  )
    return undefined;
  // Inactive but extant walls still defend in the engine; unfinished ones do not.
  const wall = state.buildings.find(
    (building) =>
      building.cityId === city.id &&
      building.kind === 'walls' &&
      building.completed !== false &&
      building.hp > 0,
  );
  const phase = wall
    ? 'walls'
    : (city.garrisonHp ?? 0) > 0
      ? 'garrison'
      : battalion.action === 'conquering'
        ? 'occupation'
        : 'sacking';
  const occupationSeconds = phase === 'occupation' ? clamp(battalion.occupation, 0, 30) : 0;
  return {
    battalionId: battalion.id,
    cityId: city.id,
    city,
    phase,
    wall,
    wallRatio: wall ? clamp(wall.hp / BUILDING_SPECS.walls.maxHp, 0, 1) : 0,
    occupationSeconds,
    occupationRatio: occupationSeconds / 30,
  };
}

/** A short visual replay of a confirmed wall hit; the renderer never schedules damage. */
export function getSiegeProjectile(
  state: GameState,
  battalion: Battalion,
  renderTime: number,
  options: SiegeOptions = {},
): SiegeProjectile | undefined {
  const shot = battalion.lastSiegeShot;
  if (state.tier < 4 || !shot || shot.damage <= 0 || !battalion.catapult) return undefined;
  const city = state.cities.find((candidate) => candidate.id === shot.cityId);
  const wall = state.buildings.find(
    (building) =>
      building.id === shot.wallId && building.cityId === city?.id && building.kind === 'walls',
  );
  const actualOrigin = { x: shot.fromX, y: shot.fromY };
  if (
    !city ||
    !wall ||
    city.factionId === 'ruins' ||
    city.factionId === battalion.factionId ||
    !revealed(state, city) ||
    !revealed(state, actualOrigin) ||
    (!inView(city, options.viewport) && !inView(actualOrigin, options.viewport))
  )
    return undefined;
  const age = (state.paused ? state.time : renderTime) - shot.time;
  if (age < 0 || age >= 0.8) return undefined;
  const displayed = getBattalionDisplayPoint(state, {
    ...battalion,
    ...actualOrigin,
    hp: Math.max(1, battalion.hp),
    targetId: shot.cityId,
    action: 'attacking',
  });
  const displayPoint = worldPoint(displayed),
    cityPoint = worldPoint(city);
  const dx = displayPoint.x - cityPoint.x,
    dy = displayPoint.y - cityPoint.y,
    distance = Math.hypot(dx, dy) || 1;
  const from = { x: displayPoint.x + 11, y: displayPoint.y - 10 };
  const to = { x: cityPoint.x + (dx / distance) * 34, y: cityPoint.y + (dy / distance) * 23 - 4 };
  const progress = options.reducedMotion ? 1 : clamp(age / 0.65, 0, 1);
  return {
    from,
    to,
    position: {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 22,
    },
    progress,
    impact: progress === 1 ? clamp(1 - (age - 0.65) / 0.15, 0, 1) : 0,
    reducedMotion: !!options.reducedMotion,
  };
}

/** Strategic symbols use a small pixel floor so labels remain legible at regional zoom. */
export function drawRegionalSieges(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  renderTime: number,
  options: SiegeOptions = {},
) {
  if (state.tier < 4) return;
  const scale = Math.max(
    0.05,
    Math.hypot(ctx.getTransform().a, ctx.getTransform().b) / (options.pixelRatio ?? 1),
  );
  const numbered = (state.words.O_08?.retention ?? 0) > 0;
  ctx.save();
  const statusByCity = new Map<string, SiegePresentation>();
  let projectiles = 0;
  for (const battalion of state.battalions) {
    const presentation = deriveSiegePresentation(state, battalion);
    if (presentation && inView(presentation.city, options.viewport)) {
      const previous = statusByCity.get(presentation.cityId);
      // Multiple real contenders share one city bar. Never add their occupation counters.
      if (!previous || presentation.occupationSeconds > previous.occupationSeconds)
        statusByCity.set(presentation.cityId, presentation);
    }
    if (projectiles >= 64) continue;
    const projectile = getSiegeProjectile(state, battalion, renderTime, options);
    if (!projectile) continue;
    projectiles++;
    if (projectile.progress < 1 && !projectile.reducedMotion) {
      ctx.strokeStyle = '#9a805d66';
      ctx.lineWidth = 0.9 / scale;
      ctx.beginPath();
      ctx.moveTo(projectile.position.x - 2.5, projectile.position.y - 0.8);
      ctx.lineTo(projectile.position.x, projectile.position.y);
      ctx.stroke();
      ctx.fillStyle = '#655f4d';
      ctx.beginPath();
      const radius = clamp(1.8, 0.9 / scale, 2.5 / scale);
      ctx.ellipse(
        projectile.position.x,
        projectile.position.y,
        radius,
        radius * 0.82,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      const alpha = projectile.reducedMotion ? 0.45 : projectile.impact * 0.65;
      ctx.strokeStyle = `rgba(145,111,76,${alpha})`;
      ctx.lineWidth = 1.1 / scale;
      // A few restrained chips mark the real breach without a flash or particle system.
      for (let i = 0; i < 4; i++) {
        const angle = -Math.PI + i * 0.85;
        ctx.beginPath();
        ctx.moveTo(projectile.to.x + Math.cos(angle) * 2, projectile.to.y + Math.sin(angle) * 2);
        ctx.lineTo(projectile.to.x + Math.cos(angle) * 5, projectile.to.y + Math.sin(angle) * 5);
        ctx.stroke();
      }
    }
  }
  for (const presentation of statusByCity.values()) {
    const center = worldPoint(presentation.city);
    const width = clamp(64, 60 / scale, 120 / scale);
    const height = clamp(4.5, 4 / scale, 6 / scale);
    const x = center.x - width / 2,
      y = center.y + 49;
    const own =
      state.battalions.find((b) => b.id === presentation.battalionId)?.factionId === 'player';
    const color = own ? '#6c7b45' : '#a1684c';
    if (presentation.phase === 'walls' || presentation.phase === 'occupation') {
      ctx.fillStyle = '#f5efdae8';
      ctx.strokeStyle = '#6f765d99';
      ctx.lineWidth = 0.75 / scale;
      ctx.fillRect(x - 1 / scale, y - 1 / scale, width + 2 / scale, height + 2 / scale);
      ctx.strokeRect(x - 1 / scale, y - 1 / scale, width + 2 / scale, height + 2 / scale);
      ctx.fillStyle = '#6d755137';
      ctx.fillRect(x, y, width, height);
      const ratio =
        presentation.phase === 'walls' ? presentation.wallRatio : presentation.occupationRatio;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, width * ratio, height);
    } else {
      // No saved maximum exists for a garrison: use a status rule, not a fabricated HP bar.
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / scale;
      ctx.setLineDash([2 / scale, 3 / scale]);
      ctx.beginPath();
      ctx.moveTo(x, y + height / 2);
      ctx.lineTo(x + width, y + height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const label =
      presentation.phase === 'walls'
        ? numbered
          ? `Mura · ${Math.ceil(presentation.wall!.hp)}/${BUILDING_SPECS.walls.maxHp}`
          : 'Assedio · Mura'
        : presentation.phase === 'occupation'
          ? numbered
            ? `Occupazione · ${presentation.occupationSeconds}/30 s`
            : 'Occupazione in corso'
          : presentation.phase === 'garrison'
            ? 'Assedio · Guarnigione'
            : 'Saccheggio';
    ctx.font = `600 ${clamp(8, 8 / scale, 11 / scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 2.8 / scale;
    ctx.strokeStyle = '#f5f0dbe8';
    ctx.strokeText(label, center.x, center.y + 62);
    ctx.fillStyle = own ? '#40543d' : '#80503e';
    ctx.fillText(label, center.x, center.y + 62);
  }
  ctx.restore();
}
