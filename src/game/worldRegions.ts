import { emptyInventory } from './content';
import { coastDistance, coastEdges, createCoastGeometry } from './coastGeometry';
import { isDryLandPoint, planLandRoute } from './landNavigation';
import { captureRegion } from './worldRuntime';
import type { GameState, MapEntity, MapGeneration, Sector } from './types';
import type { RegionState } from './worldTypes';

export const worldRegionId = (x: number, y: number) => `${x}:${y}`;
export const validWorldRegion = (x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 4 && y >= 0 && y < 4;

function stream(seed: number, x: number, y: number) {
  let value = (seed ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77)) >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function generation(seed: number, x: number, y: number): MapGeneration {
  return { mode: 'random', seed, version: 1, landNavigation: 1, worldSize: 1000,
    regionalCultures: 1, biomeRules: 1, coastalRules: 1, maritimeRules: 1,
    worldRules: 1, worldSeed: seed, regionX: x, regionY: y };
}
const sectorId = (x: number, y: number) =>
  `sector-${Math.min(9, Math.floor(x / 100))}-${Math.min(9, Math.floor(y / 100))}`;

/** New physical nodes use their region's private generator, never the evolving simulation RNG. */
function addFisheries(state: GameState, prefix: string, random: () => number) {
  const coast = createCoastGeometry(state);
  if (!coast) return;
  for (const { a, b, inward } of coastEdges(coast)) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < 16) continue;
    const count = Math.max(1, Math.floor(length / 85));
    for (let index = 0; index < count; index++) {
      const t = (index + 0.5) / count;
      const x = a.x + dx * t - dy * inward * 10 / length;
      const y = a.y + dy * t + dx * inward * 10 / length;
      if (x < 2 || x > 998 || y < 2 || y > 998 || !isDryLandPoint(state, { x, y })) continue;
      if (state.entities.some((entity) => entity.kind === 'fishery' && Math.hypot(entity.x - x, entity.y - y) < 35)) continue;
      const amount = 40 + Math.floor(random() * 21);
      state.entities.push({ id: `${prefix}-fishery-${state.entities.length}`, kind: 'fishery', x, y,
        originX: x, originY: y, amount, maxAmount: amount, hp: 1, maxHp: 1, sectorId: sectorId(x, y) });
    }
  }
}
function classifySectors(state: GameState) {
  for (const sector of state.sectors) {
    const inland = coastDistance(state, { x: sector.x * 100 + 50, y: sector.y * 100 + 50 });
    if (sector.biome !== 'river') {
      if (inland <= 0.25) sector.biome = 'sea';
      else if (inland < 75) sector.biome = 'coast';
      else if (sector.biome === 'sea' || sector.biome === 'coast') sector.biome = 'plain';
    }
  }
}

/** The active opening remains the original seven identities and eight paid societies. */
export function initializeWorld(state: GameState): GameState {
  if (state.mapGeneration?.mode !== 'random' || state.mapGeneration.worldSize !== 1000) return state;
  const seed = state.mapGeneration.seed;
  state.mapGeneration = generation(seed, 0, 0);
  const prefix = 'r0-0';
  const names = new Map<string, string>();
  for (const item of [...state.units, ...state.entities, ...state.cities, ...state.factions])
    names.set(item.id, `${prefix}-${item.id}`);
  const renamed = (id: string) => names.get(id) ?? id;
  for (const unit of state.units) unit.id = renamed(unit.id);
  for (const word of Object.values(state.words)) word.custodians = word.custodians.map(renamed);
  for (const faction of state.factions) { faction.id = renamed(faction.id); faction.cityId = renamed(faction.cityId); }
  for (const sector of state.sectors) if (sector.cityId) sector.cityId = renamed(sector.cityId);
  for (const city of state.cities) { city.id = renamed(city.id); city.factionId = renamed(city.factionId); }
  for (const entity of state.entities) { entity.id = renamed(entity.id); if (entity.factionId) entity.factionId = renamed(entity.factionId); }
  classifySectors(state);
  // A different world outline must never leave a town or opening resource in water.
  // Retain every finite amount; relocation is generation, not a gameplay grant.
  const random = stream(seed, 0, 0);
  const occupied: { x: number; y: number }[] = [];
  for (const city of state.cities) {
    const viable = (p: { x: number; y: number }) => isDryLandPoint(state, p) &&
      coastDistance(state, p) >= 24 && Math.hypot(p.x - state.home.x, p.y - state.home.y) >= 150 &&
      occupied.every((other) => Math.hypot(p.x - other.x, p.y - other.y) >= 145) &&
      !!planLandRoute(state, state.home, p);
    let site: { x: number; y: number } | undefined = viable(city) ? city : undefined;
    for (let attempt = 0; !site && attempt < 4000; attempt++) {
      const candidate = { x: 110 + random() * 780, y: 110 + random() * 780 };
      if (viable(candidate)) site = candidate;
    }
    if (!site) throw new Error('Il continente iniziale non offre otto sedi asciutte e raggiungibili.');
    city.x = site.x; city.y = site.y;
    city.sectorX = Math.floor(city.x / 100); city.sectorY = Math.floor(city.y / 100);
    occupied.push({ x: city.x, y: city.y });
  }
  for (const sector of state.sectors) delete sector.cityId;
  for (const city of state.cities) state.sectors.find((sector) => sector.x === city.sectorX && sector.y === city.sectorY)!.cityId = city.id;
  state.entities = state.entities.filter((entity) => entity.kind !== 'fishery');
  for (const entity of state.entities) {
    if (isDryLandPoint(state, entity)) continue;
    for (let attempt = 0; attempt < 3000; attempt++) {
      const point = { x: 16 + random() * 968, y: 16 + random() * 968 };
      if (!isDryLandPoint(state, point) || coastDistance(state, point) < 10 || Math.hypot(point.x - state.home.x, point.y - state.home.y) < 90) continue;
      entity.x = entity.originX = point.x; entity.y = entity.originY = point.y;
      entity.sectorId = sectorId(point.x, point.y); break;
    }
  }
  addFisheries(state, prefix, random);
  state.world = { version: 1, seed, width: 4, height: 4, activeRegionId: '0:0', homeRegionId: '0:0',
    regions: { '0:0': { id: '0:0', x: 0, y: 0, discovered: true } }, transfers: [] };
  return state;
}

/** Unvisited kilometres are lazy: no settlers, free supplies or duplicated founders. */
export function generateWorldRegion(state: GameState, x: number, y: number): RegionState {
  if (!state.world || !validWorldRegion(x, y)) throw new Error('Regione del mondo non valida.');
  const id = worldRegionId(x, y);
  if (id === state.world.activeRegionId) return captureRegion(state);
  const existing = state.world.regions[id]?.snapshot;
  if (existing) return existing;
  const random = stream(state.world.seed, x, y), prefix = `r${x}-${y}`;
  const biomes: Sector['biome'][] = ['plain', 'plain', 'forest', 'forest', 'mountain', 'wetland', 'dryland'];
  const sectors: Sector[] = Array.from({ length: 100 }, (_, index) => ({
    id: `sector-${index % 10}-${Math.floor(index / 10)}`, x: index % 10, y: Math.floor(index / 10),
    explored: false, faunaCapacity: 20, initialFauna: 0, biome: biomes[Math.floor(random() * biomes.length)],
  }));
  const local: RegionState = { mapGeneration: generation(state.world.seed, x, y), home: { x: 550, y: 550 },
    resources: emptyInventory(), units: [], entities: [], buildings: [], boats: [], sectors, explored: [],
    cities: [], factions: [], battalions: [], caravans: [], regionalRoutes: [],
    foreignPolicy: { raids: [], ultimata: [], relations: [] },
    disasters: { storm: false, drought: false, blizzard: false, lightning: false,
      lastSummerYear: state.disasters.lastSummerYear, lastWinterYear: state.disasters.lastWinterYear },
    burntWood: 0, nightSleeping: 0 };
  const view = { ...state, ...local };
  classifySectors(view);
  const kinds: MapEntity['kind'][] = ['tree', 'tree', 'berries', 'stone', 'deer', 'ore'];
  for (let attempt = 0; view.entities.length < 240 && attempt < 6000; attempt++) {
    const point = { x: 8 + random() * 984, y: 8 + random() * 984 };
    if (!isDryLandPoint(view, point) || coastDistance(view, point) < 12 || view.entities.some((node) => Math.hypot(node.x - point.x, node.y - point.y) < 7)) continue;
    const kind = kinds[Math.floor(random() * kinds.length)];
    const amount = kind === 'ore' ? 80 : kind === 'stone' ? 40 : kind === 'deer' ? 2 : 12 + Math.floor(random() * 13);
    const hp = kind === 'deer' ? 30 : kind === 'berries' ? 1 : 100;
    view.entities.push({ id: `${prefix}-entity-${view.entities.length}`, kind, ...point, originX: point.x,
      originY: point.y, amount, maxAmount: amount, hp, maxHp: hp, sectorId: sectorId(point.x, point.y) });
  }
  addFisheries(view, prefix, random);
  const payload = captureRegion(view);
  state.world.regions[id] = { id, x, y, discovered: false, snapshot: payload };
  return payload;
}
