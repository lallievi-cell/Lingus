import { describe, expect, it } from 'vitest';
import { HOME } from './content';
import { createGame } from './engine';
import { generateWorld, riverSegments, type RiverSegment } from './worldGeneration';
import type { MapEntity, Sector } from './types';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const factions = createGame().factions;
const seeds = [
  0,
  1,
  42,
  6842,
  4294967295,
  ...Array.from({ length: 96 }, (_, i) => Math.imul(i + 1, 2654435761) >>> 0),
];
const segmentDistance = (point: { x: number; y: number }, [a, b]: RiverSegment) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const fraction = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return distance(point, { x: a.x + fraction * dx, y: a.y + fraction * dy });
};

describe('seeded random worlds', () => {
  it('reproduces the complete geography without mutating factions or sharing returned objects', () => {
    const original = structuredClone(factions);
    const first = generateWorld(0, factions);
    const second = generateWorld(0, factions);
    expect(first).toEqual(second);
    expect(factions).toEqual(original);
    first.entities[0].amount = 0;
    first.cities[0].resources.food = 0;
    first.cities[0].words.push('test-only');
    first.sectors[0].explored = true;
    expect(generateWorld(0, factions)).toEqual(second);
    expect(factions).toEqual(original);
    expect(first.cities[0].resources).not.toBe(first.cities[1].resources);
    expect(first.cities[0].resources).not.toBe(first.cities[0].production);
  });

  it('changes biome shapes, settlement locations, node quantities and actual coordinates across seeds', () => {
    const worlds = seeds.slice(0, 24).map((seed) => generateWorld(seed, factions));
    expect(
      new Set(worlds.map((world) => JSON.stringify(world.sectors.map((sector) => sector.biome))))
        .size,
    ).toBeGreaterThan(16);
    expect(
      new Set(
        worlds.map((world) =>
          JSON.stringify(world.cities.map((city) => [city.sectorX, city.sectorY, city.x, city.y])),
        ),
      ).size,
    ).toBe(worlds.length);
    expect(new Set(worlds.map((world) => world.entities.length)).size).toBeGreaterThan(8);
    expect(
      new Set(
        worlds.map((world) =>
          JSON.stringify(
            world.entities.map((entity) => [entity.kind, entity.x, entity.y, entity.amount]),
          ),
        ),
      ).size,
    ).toBe(worlds.length);
    expect(
      new Set(worlds.map((world) => distance(world.entities[0], HOME).toFixed(2))).size,
    ).toBeGreaterThan(16);
  });

  it('keeps the opening resources physically reachable on more than one hundred different worlds', () => {
    for (const seed of seeds) {
      const { entities } = generateWorld(seed, factions);
      const nearby = (kind: MapEntity['kind'], radius: number) =>
        entities.filter((entity) => entity.kind === kind && distance(entity, HOME) <= radius);
      expect(
        nearby('berries', 25).reduce((sum, entity) => sum + entity.amount, 0),
        `berries seed ${seed}`,
      ).toBeGreaterThanOrEqual(80);
      expect(
        nearby('berries', 70).filter((entity) => distance(entity, HOME) >= 40).length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        nearby('tree', 60).reduce((sum, entity) => sum + entity.amount, 0),
      ).toBeGreaterThanOrEqual(240);
      expect(
        nearby('stone', 50).filter((entity) => entity.amount >= 100).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        nearby('ore', 65).some((entity) => entity.amount === 500 && distance(entity, HOME) >= 40),
      ).toBe(true);
      expect(
        nearby('deer', 65).filter((entity) => distance(entity, HOME) >= 30).length,
      ).toBeGreaterThanOrEqual(6);
      const tree = nearby('tree', 60).sort((a, b) => distance(a, HOME) - distance(b, HOME))[0];
      const rock = nearby('stone', 50).sort((a, b) => distance(a, HOME) - distance(b, HOME))[0];
      expect(distance(tree, HOME)).toBeLessThanOrEqual(28.01);
      expect(distance(tree, rock)).toBeLessThanOrEqual(10.02);
      expect(distance(tree, rock)).toBeGreaterThanOrEqual(5.98);
    }
  });

  it('keeps nodes, animal territories and foreign links valid and away from the initial camp', () => {
    for (const seed of seeds) {
      const { entities, sectors, cities } = generateWorld(seed, factions);
      expect(sectors).toHaveLength(25);
      expect(sectors.find((sector) => sector.x === 2 && sector.y === 2)).toMatchObject({
        biome: 'plain',
        explored: true,
      });
      expect(new Set(sectors.map((sector) => sector.id)).size).toBe(25);
      expect(new Set(entities.map((entity) => entity.id)).size).toBe(entities.length);
      expect(cities).toHaveLength(4);
      expect(new Set(cities.map((city) => `${city.sectorX}:${city.sectorY}`)).size).toBe(4);
      for (const entity of entities) {
        expect(
          [entity.x, entity.y, entity.amount, entity.hp, entity.maxHp].every(Number.isFinite),
        ).toBe(true);
        expect(entity.x).toBeGreaterThanOrEqual(2);
        expect(entity.x).toBeLessThanOrEqual(498);
        expect(entity.y).toBeGreaterThanOrEqual(2);
        expect(entity.y).toBeLessThanOrEqual(498);
        expect(entity.sectorId).toBe(
          `sector-${Math.floor(entity.x / 100)}-${Math.floor(entity.y / 100)}`,
        );
        expect([entity.originX, entity.originY]).toEqual([entity.x, entity.y]);
        expect(entity.amount).toBeGreaterThan(0);
        expect(entity.maxAmount).toBe(entity.amount);
        expect(distance(entity, HOME)).toBeGreaterThanOrEqual(8.99);
        expect(cities.every((city) => distance(entity, city) >= 19.99)).toBe(true);
        if (['wolf', 'alpha', 'mammoth'].includes(entity.kind)) {
          expect(distance(entity, HOME)).toBeGreaterThanOrEqual(109.99);
          expect(cities.every((city) => distance(entity, city) >= 59.99)).toBe(true);
        }
      }
      expect(
        entities.some((entity) => entity.kind === 'mammoth'),
        `mammoth seed ${seed}`,
      ).toBe(true);
      for (const [index, city] of cities.entries()) {
        expect(city).toMatchObject({
          id: factions[index].cityId,
          factionId: factions[index].id,
          words: factions[index].words,
          dogmas: factions[index].dogmas,
        });
        expect(city.resources).toMatchObject({ food: 20, wood: 20, stone: 10 });
        const sector = sectors.find(
          (sector) => sector.id === `sector-${city.sectorX}-${city.sectorY}`,
        )!;
        expect(sector.cityId).toBe(city.id);
        expect(sector.biome).not.toBe('river');
        expect(distance(city, HOME)).toBeGreaterThanOrEqual(160);
      }
      for (const sector of sectors)
        expect(sector.initialFauna).toBe(
          entities.filter(
            (entity) =>
              entity.sectorId === sector.id &&
              ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind),
          ).length,
        );
    }
  }, 20_000);

  it('uses a connected bank geometry shared with the renderer and places no node or city in water', () => {
    for (const seed of seeds.slice(0, 40)) {
      const world = generateWorld(seed, factions);
      const segments = riverSegments(world.sectors);
      expect(segments.length).toBe(7);
      const first = segments[0][0],
        last = segments.at(-1)![1];
      expect([first.x, first.y].some((value) => value === 0 || value === 500)).toBe(true);
      expect([last.x, last.y].some((value) => value === 0 || value === 500)).toBe(true);
      for (const [index, segment] of segments.entries()) {
        expect(segment[0].x === segment[1].x || segment[0].y === segment[1].y).toBe(true);
        if (index) expect(segment[0]).toEqual(segments[index - 1][1]);
      }
      for (const sector of world.sectors.filter((sector) => sector.biome === 'river'))
        expect(
          segments.some(
            (segment) =>
              segmentDistance({ x: sector.x * 100 + 50, y: sector.y * 100 + 50 }, segment) === 0,
          ),
        ).toBe(true);
      for (const entity of world.entities)
        expect(segments.every((segment) => segmentDistance(entity, segment) >= 11.99)).toBe(true);
      for (const city of world.cities)
        expect(segments.every((segment) => segmentDistance(city, segment) >= 20)).toBe(true);
      // Rounding actual world coordinates may reduce the four-metre gap by at most a centimetre.
      for (let index = 0; index < world.entities.length; index++)
        expect(
          world.entities
            .slice(index + 1)
            .every((other) => distance(world.entities[index], other) >= 3.98),
        ).toBe(true);
    }
  });

  it('handles incomplete or disconnected imported river data without loops or invalid segments', () => {
    expect(riverSegments([])).toEqual([]);
    const sector = (x: number, y: number): Sector => ({
      id: `${x}-${y}`,
      x,
      y,
      explored: false,
      faunaCapacity: 20,
      biome: 'river',
    });
    expect(riverSegments([sector(1, 1)])).toEqual([]);
    expect(riverSegments([sector(0, 0), sector(4, 4)])).toEqual([]);
    const result = riverSegments([sector(0, 0), sector(0, 1), sector(4, 4)]);
    expect(result.length).toBe(3);
    expect(
      result.every((segment) =>
        segment.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
      ),
    ).toBe(true);
  });
});
