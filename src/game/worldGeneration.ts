import { emptyInventory, HOME } from './content';
import type { City, Faction, MapEntity, Sector } from './types';

type Point = { x: number; y: number };
export type RiverSegment = [Point, Point];
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const sectorId = (x: number, y: number) => `sector-${Math.floor(x / 100)}-${Math.floor(y / 100)}`;

/** Generation owns its random stream: creating scenery never advances the simulation. */
function generator(seed: number) {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** The river sectors form a simple orthogonal chain; renderer and placement share its banks. */
export function riverSegments(sectors: Sector[]): RiverSegment[] {
  const river = sectors.filter((sector) => sector.biome === 'river');
  if (!river.length) return [];
  const adjacent = (a: Sector, b: Sector) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  let current =
    river.find((sector) => river.filter((other) => adjacent(sector, other)).length === 1) ??
    river[0];
  const visited = new Set<string>();
  const points: Point[] = [];
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    points.push({ x: current.x * 100 + 50, y: current.y * 100 + 50 });
    const next = river.find((sector) => !visited.has(sector.id) && adjacent(current, sector));
    if (!next) break;
    current = next;
  }
  if (points.length < 2) return [];
  const edge = (point: Point, inward: Point): Point => ({
    x: point.x === inward.x ? point.x : point.x < inward.x ? 0 : 500,
    y: point.y === inward.y ? point.y : point.y < inward.y ? 0 : 500,
  });
  points.unshift(edge(points[0], points[1]));
  points.push(edge(points.at(-1)!, points.at(-2)!));
  return points.slice(1).map((point, index) => [points[index], point]);
}

function segmentDistance(point: Point, [a, b]: RiverSegment) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const fraction = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return distance(point, { x: a.x + fraction * dx, y: a.y + fraction * dy });
}

/** A seeded map changes geography and placement, keeping the seven people and all game rules. */
export function generateWorld(
  seed: number,
  factions: Faction[],
): {
  sectors: Sector[];
  entities: MapEntity[];
  cities: City[];
} {
  const random = generator(seed);
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const shuffle = <T>(values: T[]) => {
    for (let index = values.length - 1; index > 0; index--) {
      const other = integer(0, index);
      [values[index], values[other]] = [values[other], values[index]];
    }
    return values;
  };
  const sectors: Sector[] = Array.from({ length: 25 }, (_, index) => ({
    id: `sector-${index % 5}-${Math.floor(index / 5)}`,
    x: index % 5,
    y: Math.floor(index / 5),
    explored: index === 12,
    faunaCapacity: 20,
    initialFauna: 0,
    biome: 'plain',
  }));
  const riverCells: Point[] = [];
  let column = random() < 0.5 ? 0 : 4;
  const bend = integer(1, 3),
    rotate = random() < 0.5;
  for (let row = 0; row < 5; row++) {
    riverCells.push({ x: column, y: row });
    if (row === bend) {
      column += column === 0 ? 1 : -1;
      riverCells.push({ x: column, y: row });
    }
  }
  for (const cell of riverCells) {
    const x = rotate ? cell.y : cell.x,
      y = rotate ? cell.x : cell.y;
    sectors[y * 5 + x].biome = 'river';
  }
  const outerLand = shuffle(
    sectors.filter(
      (sector) =>
        sector.biome !== 'river' &&
        (sector.x === 0 || sector.y === 0 || sector.x === 4 || sector.y === 4),
    ),
  );
  const mountainStart = outerLand[0];
  const mountains = [mountainStart];
  mountainStart.biome = 'mountain';
  const mountainCount = integer(3, 5);
  while (mountains.length < mountainCount) {
    const candidates = shuffle(
      sectors.filter(
        (sector) =>
          sector.biome === 'plain' &&
          Math.hypot(sector.x - 2, sector.y - 2) >= 1.5 &&
          mountains.some(
            (other) => Math.abs(other.x - sector.x) + Math.abs(other.y - sector.y) === 1,
          ),
      ),
    );
    if (!candidates.length) break;
    candidates[0].biome = 'mountain';
    mountains.push(candidates[0]);
  }
  const forestCenters = shuffle(
    sectors.filter((sector) => sector.biome === 'plain' && sector.id !== 'sector-2-2'),
  ).slice(0, 2);
  const forest = sectors
    .filter((sector) => sector.biome === 'plain' && sector.id !== 'sector-2-2')
    .map((sector) => ({
      sector,
      score: Math.min(...forestCenters.map((center) => distance(center, sector))) + random() * 1.8,
    }))
    .sort((a, b) => a.score - b.score);
  for (const { sector } of forest.slice(0, integer(6, 9))) sector.biome = 'forest';

  const river = riverSegments(sectors);
  const dry = (point: Point, margin = 12) =>
    river.every((segment) => segmentDistance(point, segment) >= margin);
  const cityCandidates = outerLand
    .map((sector) => ({
      sector,
      x: sector.x * 100 + integer(30, 70),
      y: sector.y * 100 + integer(30, 70),
    }))
    .filter((point) => dry(point, 20) && distance(point, HOME) >= 160);
  const chooseCities = (
    spacing: number,
    selected: typeof cityCandidates = [],
    start = 0,
  ): typeof cityCandidates | undefined => {
    if (selected.length === factions.length) return selected;
    for (let index = start; index < cityCandidates.length; index++) {
      const point = cityCandidates[index];
      if (selected.every((other) => distance(other, point) >= spacing)) {
        const result = chooseCities(spacing, [...selected, point], index + 1);
        if (result) return result;
      }
    }
    return undefined;
  };
  const citySites = chooseCities(130) ?? chooseCities(90);
  if (!citySites) throw new Error('The generated land cannot hold the foreign settlements.');
  const cities: City[] = factions.map((faction, index) => {
    const site = citySites[index];
    site.sector.cityId = faction.cityId;
    const resources = emptyInventory();
    Object.assign(resources, { food: 20, wood: 20, stone: 10 });
    return {
      id: faction.cityId,
      name: faction.name,
      x: site.x,
      y: site.y,
      sectorX: site.sector.x,
      sectorY: site.sector.y,
      factionId: faction.id,
      cohorts: { workers: 8, warriors: 2, sages: 2, slaves: 0 },
      resources,
      words: [...faction.words],
      dogmas: structuredClone(faction.dogmas),
      revoltTension: 0,
      housing: 20,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      garrisonHp: 200,
      occupation: 0,
      foundedAt: 0,
      lawfulSeasons: 0,
      corruption: 0,
    };
  });
  const entities: MapEntity[] = [];
  const free = (point: Point, spacing = 4, predator = false) =>
    point.x >= 2 &&
    point.x <= 498 &&
    point.y >= 2 &&
    point.y <= 498 &&
    distance(point, HOME) >= (predator ? 110 : 9) &&
    dry(point) &&
    cities.every((city) => distance(city, point) >= (predator ? 60 : 20)) &&
    entities.every((entity) => distance(entity, point) >= spacing);
  const add = (kind: MapEntity['kind'], point: Point, amount: number, hp: number) => {
    const x = Math.round(point.x * 100) / 100,
      y = Math.round(point.y * 100) / 100;
    entities.push({
      id: `entity-${entities.length}`,
      kind,
      x,
      y,
      amount,
      maxAmount: amount,
      hp,
      maxHp: hp,
      originX: x,
      originY: y,
      sectorId: sectorId(x, y),
    });
  };
  const radial = (radius: number, angle: number): Point => ({
    x: HOME.x + Math.cos(angle) * radius,
    y: HOME.y + Math.sin(angle) * radius,
  });
  const ring = (min: number, max: number, angle?: number): Point => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const point = radial(
        min + random() * (max - min),
        angle === undefined ? random() * Math.PI * 2 : angle + (random() - 0.5) * 0.35,
      );
      if (free(point)) return point;
    }
    throw new Error('The starter clearing ran out of placement space.');
  };
  const startAngle = random() * Math.PI * 2;
  const tree = radial(20 + random() * 8, startAngle);
  add('tree', tree, 20, 100);
  const rockAngle = startAngle + Math.PI / 2 + (random() - 0.5) * 0.5;
  const rockDistance = 6 + random() * 4;
  add(
    'stone',
    {
      x: tree.x + Math.cos(rockAngle) * rockDistance,
      y: tree.y + Math.sin(rockAngle) * rockDistance,
    },
    100,
    100,
  );
  for (let index = 0; index < 4; index++)
    add('berries', ring(10, 23, startAngle + (index * Math.PI) / 2), 20, 1);
  for (let index = 0; index < 11; index++) add('tree', ring(31, 48), integer(20, 28), 100);
  add('stone', ring(43, 48), 100, 100);
  add('ore', ring(50, 65), 500, 100);
  for (let index = 0; index < 3; index++)
    add('berries', ring(52, 68, startAngle + (index * Math.PI * 2) / 3), integer(20, 25), 1);
  for (let index = 0; index < 6; index++) add('deer', ring(38, 65), 2, 30);

  for (const sector of sectors.filter((sector) => sector.id !== 'sector-2-2')) {
    const point = (predator = false): Point | undefined => {
      for (let attempt = 0; attempt < 160; attempt++) {
        const candidate = {
          x: sector.x * 100 + integer(12, 88),
          y: sector.y * 100 + integer(12, 88),
        };
        if (free(candidate, 4, predator)) return candidate;
      }
      return undefined;
    };
    const populate = (
      kind: MapEntity['kind'],
      count: number,
      amount: () => number,
      hp: number,
      predator = false,
    ) => {
      for (let index = 0; index < count; index++) {
        const location = point(predator);
        if (location) add(kind, location, amount(), hp);
      }
    };
    const biome = sector.biome;
    populate(
      'tree',
      biome === 'forest' ? integer(11, 15) : biome === 'mountain' ? integer(3, 6) : integer(5, 9),
      () => integer(18, 28),
      100,
    );
    populate(
      'berries',
      biome === 'mountain' ? integer(1, 2) : integer(3, 5),
      () => integer(18, 26),
      1,
    );
    populate(
      'stone',
      biome === 'mountain' ? integer(2, 4) : integer(1, 2),
      () => integer(80, 130),
      100,
    );
    populate('deer', biome === 'mountain' ? integer(1, 2) : integer(3, 5), () => 2, 30);
    if (biome === 'mountain') populate('ore', integer(1, 2), () => integer(350, 650), 100);
    if (random() < 0.5) populate('wolf', integer(1, 2), () => 1, 45, true);
    if (biome === 'forest' && random() < 0.35) populate('alpha', 1, () => 3, 120, true);
  }
  // A settlement can occupy a tiny mountain pocket. Keep the large-game
  // encounter reachable by using another dry pasture if every mountain is occupied.
  const mammothHabitat = [
    ...shuffle([...mountains]),
    ...shuffle(sectors.filter((sector) => sector.biome !== 'river' && !mountains.includes(sector))),
  ];
  for (const mammothSector of mammothHabitat) {
    const before = entities.length;
    for (let attempt = 0; attempt < 200; attempt++) {
      const point = {
        x: mammothSector.x * 100 + integer(12, 88),
        y: mammothSector.y * 100 + integer(12, 88),
      };
      if (free(point, 4, true)) {
        add('mammoth', point, 10, 300);
        break;
      }
    }
    if (entities.length > before) break;
  }
  for (const sector of sectors) {
    sector.initialFauna = entities.filter(
      (entity) =>
        entity.sectorId === sector.id && ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind),
    ).length;
    sector.faunaCapacity = sector.biome === 'forest' ? 24 : sector.biome === 'mountain' ? 12 : 20;
  }
  return { sectors, entities, cities };
}
