import type { Building, GameState } from '../game/types';
import { freeCapacity } from '../game/runtime';
import { CITY_FOUNDRY_CHIMNEY } from './regionalLayout';

export interface AtmosphereOptions {
  reducedMotion?: boolean;
  pixelRatio?: number;
  screenWidth?: number;
  screenHeight?: number;
}
export interface AtmosphereViewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type AtmosphereSource = {
  id: string;
  kind: 'campfire' | 'foundry' | 'corpse' | 'plague' | 'burning-tree';
  x: number;
  y: number;
  phase: number;
  urbanFoundry?: boolean;
};
export interface AtmosphereFrame {
  weather: 'clear' | 'blizzard' | 'storm' | 'drought';
  particles: { x: number; y: number; size: number; alpha: number }[];
  sources: AtmosphereSource[];
  lightning?: { x: number; y: number; strength: number };
  time: number;
}

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const fract = (n: number) => n - Math.floor(n);
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
function idPhase(id: string) {
  let result = 0;
  for (let i = 0; i < id.length; i++) result = (result * 31 + id.charCodeAt(i)) | 0;
  return hash(result);
}

function revealed(state: GameState, x: number, y: number) {
  return (
    state.tier >= 4 ||
    state.sectors.some(
      (s) =>
        s.explored &&
        s.x === Math.min(4, Math.floor(x / 100)) &&
        s.y === Math.min(4, Math.floor(y / 100)),
    )
  );
}
function visible(state: GameState, point: { x: number; y: number }, view?: AtmosphereViewport) {
  return (
    revealed(state, point.x, point.y) &&
    (!view ||
      (point.x >= view.minX - 16 &&
        point.x <= view.maxX + 16 &&
        point.y >= view.minY - 24 &&
        point.y <= view.maxY + 24))
  );
}

/** Active upkeep alone does not mean a cold, unstaffed furnace is smelting. */
export function isFoundryProducing(state: GameState, building: Building) {
  if (
    building.kind !== 'foundry' ||
    !building.active ||
    building.hp <= 0 ||
    building.completed === false
  )
    return false;
  if (building.cityId) {
    const city = state.cities.find((c) => c.id === building.cityId);
    if (!city) return false;
    const inventory =
      city.capital && city.factionId === 'player' ? state.resources : city.resources;
    if ((building.lastEfficiency ?? 0) <= 0) return false;
    // Foreign military forges spend their work during the season, so the last
    // ingot may already be consumed while the furnace is still visibly hot.
    const lastForgeWork = state.eventTimes[`foreignForgeLastWork:${building.id}`];
    if (
      city.factionId !== 'player' &&
      lastForgeWork !== undefined &&
      state.time >= lastForgeWork &&
      state.time - lastForgeWork <= 1
    )
      return true;
    // Urban production settles fractional output at the season boundary.
    return building.productionMode && building.productionMode !== 'ingot'
      ? inventory.ingot > 0
      : inventory.ore > 0 && inventory.wood > 0;
  }
  return (building.workerIds ?? []).some((id) => {
    const unit = state.units.find((u) => u.id === id);
    if (
      !unit ||
      unit.hp <= 0 ||
      unit.age < 4 ||
      unit.hunger >= 75 ||
      unit.temp <= 30 ||
      unit.jobBuildingId !== building.id ||
      !['working', 'smelting'].includes(unit.action) ||
      Math.hypot(unit.x - building.x, unit.y - building.y) > 3
    )
      return false;
    const coin = unit.command?.includes('O_08');
    const metalWork = coin || unit.command?.includes('V_03') || unit.command?.includes('S_08');
    return (
      freeCapacity(state, coin ? 'coin' : metalWork ? 'metalArms' : 'ingot') > 0 &&
      (metalWork
        ? state.resources.ingot >= 1
        : state.resources.ore >= 1 && state.resources.wood >= 2)
    );
  });
}

/** Pure visual sampling: no new randomness, timers, entities or save fields. */
export function getAtmosphereFrame(
  state: GameState,
  renderTime: number,
  viewport?: AtmosphereViewport,
  options: AtmosphereOptions = {},
): AtmosphereFrame {
  const width = clamp(options.screenWidth ?? 1000, 1, 4096);
  const height = clamp(options.screenHeight ?? 700, 1, 4096);
  const time = options.reducedMotion ? 0 : state.paused ? state.time : renderTime;
  const weather = state.disasters.blizzard
    ? 'blizzard'
    : state.disasters.storm
      ? 'storm'
      : state.disasters.drought
        ? 'drought'
        : 'clear';
  const particles: AtmosphereFrame['particles'] = [];
  if (!options.reducedMotion && weather !== 'clear') {
    const limit = weather === 'storm' ? 180 : weather === 'blizzard' ? 130 : 28;
    const count = Math.min(
      limit,
      Math.ceil((width * height) / (weather === 'drought' ? 30000 : 6500)),
    );
    for (let i = 0; i < count; i++) {
      const speed = 0.6 + hash(i + 51) * 0.8;
      const travel = weather === 'storm' ? time * 390 * speed : time * 42 * speed;
      particles.push({
        x:
          fract(hash(i + 3) + (time * (weather === 'storm' ? -100 : 19)) / (width + 60)) *
            (width + 60) -
          30,
        y: fract(hash(i + 709) + travel / (height + 40)) * (height + 40) - 20,
        size: weather === 'storm' ? 6 + hash(i + 59) * 8 : 0.7 + hash(i + 59) * 1.6,
        alpha: 0.18 + hash(i + 13) * 0.28,
      });
    }
  }
  const sources: AtmosphereSource[] = [];
  const add = (id: string, kind: AtmosphereSource['kind'], point: { x: number; y: number }) => {
    if (sources.length < 32 && visible(state, point, viewport))
      sources.push({ id, kind, x: point.x, y: point.y, phase: idPhase(id) });
  };
  // Illness and unburied remains retain their warning even in a densely built city.
  for (const unit of state.units) {
    if (
      unit.hp > 0 &&
      (unit.plagueUntil ?? 0) > state.time &&
      (!state.urbanized ||
        unit.isKing ||
        ['delegating', 'frontline', 'frontline-returning'].includes(unit.action))
    )
      add(unit.id, 'plague', unit);
  }
  for (const entity of state.entities) {
    if (entity.amount <= 0) continue;
    if (entity.kind === 'corpse') add(entity.id, 'corpse', entity);
    if (entity.kind === 'tree' && entity.burning) add(entity.id, 'burning-tree', entity);
  }
  for (const building of state.buildings) {
    if (building.hp <= 0 || !building.active || building.completed === false) continue;
    if (building.kind === 'campfire' && !state.urbanized) add(building.id, 'campfire', building);
    if (isFoundryProducing(state, building)) {
      const city = state.urbanized ? state.cities.find((c) => c.id === building.cityId) : undefined;
      // City institutions are aggregated around the settlement rather than drawn at village anchors.
      const point = city ?? building;
      if (!sources.some((s) => s.kind === 'foundry' && s.x === point.x && s.y === point.y)) {
        add(building.id, 'foundry', point);
        const source = sources.find((entry) => entry.id === building.id);
        if (source && city) source.urbanFoundry = true;
      }
    }
  }
  const frame: AtmosphereFrame = { weather, particles, sources, time };
  const age = state.time % 90;
  // lightning is a season-long outcome flag, not a licence to flash repeatedly.
  // The actual summer strike ignites the nearest living tree once, on the boundary.
  if (
    !options.reducedMotion &&
    state.disasters.lightning &&
    state.seasonIndex % 4 === 1 &&
    age < 0.8
  ) {
    const tree = state.entities
      .filter((e) => e.kind === 'tree' && e.amount > 0)
      .reduce<
        GameState['entities'][number] | undefined
      >((near, e) => (!near || Math.hypot(e.x - state.home.x, e.y - state.home.y) < Math.hypot(near.x - state.home.x, near.y - state.home.y) ? e : near), undefined);
    if (tree?.burning && visible(state, tree, viewport)) {
      const phase = state.paused ? age : clamp(renderTime % 90, 0, 0.8);
      frame.lightning = {
        x: tree.x,
        y: tree.y,
        strength: Math.max(0, Math.sin((phase / 0.8) * Math.PI)),
      };
    }
  }
  return frame;
}

/** Weather is screen-sized; emissions stay attached to their real world source. */
export function drawMapAtmosphere(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  time: number,
  viewport?: AtmosphereViewport,
  options: AtmosphereOptions = {},
) {
  const dpr = options.pixelRatio ?? 1;
  const width = options.screenWidth ?? ctx.canvas.width / dpr;
  const height = options.screenHeight ?? ctx.canvas.height / dpr;
  const frame = getAtmosphereFrame(state, time, viewport, {
    ...options,
    screenWidth: width,
    screenHeight: height,
  });
  if (frame.weather === 'clear' && !frame.sources.length && !frame.lightning) return;
  const matrix = ctx.getTransform();
  const project = (x: number, y: number) => ({
    x: (matrix.a * x * 2.4 + matrix.c * y * 1.6 + matrix.e) / dpr,
    y: (matrix.b * x * 2.4 + matrix.d * y * 1.6 + matrix.f) / dpr,
  });
  const spriteScale = (Math.hypot(matrix.a, matrix.b) / dpr) * 0.2;
  ctx.save();
  // Clip before switching to screen coordinates, including local plumes at fog edges.
  ctx.beginPath();
  for (const sector of state.sectors) {
    if (sector.explored || state.tier >= 4) ctx.rect(sector.x * 240, sector.y * 160, 240, 160);
  }
  ctx.clip();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (frame.weather !== 'clear') {
    ctx.fillStyle =
      frame.weather === 'blizzard'
        ? '#c5dce31f'
        : frame.weather === 'storm'
          ? '#4156661d'
          : '#bd86351c';
    ctx.fillRect(0, 0, width, height);
  }
  for (const particle of frame.particles) {
    ctx.globalAlpha = particle.alpha;
    if (frame.weather === 'storm') {
      ctx.strokeStyle = '#c8d8dc';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.size * 0.3, particle.y + particle.size);
      ctx.stroke();
    } else {
      ctx.fillStyle = frame.weather === 'blizzard' ? '#f4f6ed' : '#ba9b66';
      ctx.beginPath();
      ctx.ellipse(
        particle.x,
        particle.y,
        particle.size,
        particle.size * 0.75,
        -0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const source of frame.sources) {
    const p = project(source.x, source.y);
    const foundry = source.kind === 'foundry';
    const sick = source.kind === 'plague';
    const decay = sick || source.kind === 'corpse';
    const tree = source.kind === 'burning-tree';
    const count = foundry ? 6 : decay ? 3 : 5;
    const plumeScale = source.urbanFoundry ? spriteScale / 0.2 : spriteScale;
    const baseY = source.urbanFoundry
      ? CITY_FOUNDRY_CHIMNEY.y
      : foundry
        ? -69
        : sick
          ? -26
          : tree
            ? -66
            : decay
              ? -3
              : -24;
    const baseX = source.urbanFoundry ? CITY_FOUNDRY_CHIMNEY.x : foundry ? 13 : 0;
    for (let i = 0; i < count; i++) {
      const phase = fract(frame.time * (decay ? 0.16 : 0.13) + i / count + source.phase);
      const drift = Math.sin(frame.time * 0.6 + source.phase * 6 + i) * phase * (decay ? 9 : 12);
      const rise = phase * (source.urbanFoundry ? 18 : decay ? 14 : foundry ? 42 : 48);
      const radius = source.urbanFoundry
        ? 1.2 + phase * 3.5
        : (decay ? 2 : 2.6) + phase * (decay ? 4 : 9);
      const alpha = Math.sin(phase * Math.PI) * (decay ? 0.19 : foundry ? 0.2 : 0.14);
      const sx = p.x + (baseX + drift * (source.urbanFoundry ? 0.35 : 1)) * plumeScale;
      const sy = p.y + (baseY - rise) * plumeScale;
      const r = Math.max(0.4, radius * plumeScale);
      const cloud = ctx.createRadialGradient(sx, sy, r * 0.12, sx, sy, r);
      const color = decay ? '110,116,73' : foundry ? '73,82,78' : '112,116,101';
      cloud.addColorStop(0, `rgba(${color},${alpha})`);
      cloud.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * (decay ? 0.6 : 0.85), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (sick) {
      // A restrained, static cross remains identifiable when motion is reduced.
      const r = Math.max(2, spriteScale * 3);
      ctx.strokeStyle = '#737544c9';
      ctx.lineWidth = Math.max(1, spriteScale * 1.2);
      ctx.beginPath();
      ctx.moveTo(p.x + 10 * spriteScale - r, p.y - 30 * spriteScale);
      ctx.lineTo(p.x + 10 * spriteScale + r, p.y - 30 * spriteScale);
      ctx.moveTo(p.x + 10 * spriteScale, p.y - 30 * spriteScale - r);
      ctx.lineTo(p.x + 10 * spriteScale, p.y - 30 * spriteScale + r);
      ctx.stroke();
    }
  }
  if (frame.lightning && frame.lightning.strength > 0) {
    const p = project(frame.lightning.x, frame.lightning.y);
    // One local bolt, never a full-screen white flash or a repeated strobe.
    ctx.strokeStyle = `rgba(242,225,164,${frame.lightning.strength * 0.65})`;
    ctx.lineWidth = 1.6;
    const length = clamp(90 * spriteScale, 20, 110);
    ctx.beginPath();
    ctx.moveTo(p.x - 10, p.y - length - 24 * spriteScale);
    ctx.lineTo(p.x + 5, p.y - length * 0.55 - 24 * spriteScale);
    ctx.lineTo(p.x - 4, p.y - length * 0.58 - 24 * spriteScale);
    ctx.lineTo(p.x, p.y - 24 * spriteScale);
    ctx.stroke();
  }
  ctx.restore();
}
