import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { generateWorld, riverSegments, type RiverSegment } from './worldGeneration';
import type { MapEntity } from './types';

const factions = createInitialState().factions;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const home = { x: 550, y: 550 };
const distanceToRiver = (point: { x: number; y: number }, [a, b]: RiverSegment) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
  );
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
};

describe('the larger playable regional geography', () => {
  it('preserves exact pre-expansion valley generation for representative saved seeds', () => {
    // Captured from the 0.4.0 generator, before dimensions were parameterized.
    const footprints = [
      [0, '7268d02c5d4e61d5c787e006a159d7161ee420410830d28103ad95ef9d4994ca'],
      [1, 'b4806dcb5d502775f406096f6affd3517b274c596879e4a9c0b1017aaf7b470d'],
      [42, 'c1660868cec913914c982bed0352feb3b94877287d5e26fdc3116fa6ff246454'],
      [6842, 'de1da0b57a528df673e8e838024f1f997d208cbaf9502cfce9090652496c5d3f'],
      [4294967295, 'f364f6128ef1e4482c6fa2d0f761e34b22892498fabf3035dfd9a485bc744bff'],
    ] as const;
    for (const [seed, expected] of footprints) {
      const world = generateWorld(seed, factions);
      expect(createHash('sha256').update(JSON.stringify(world)).digest('hex')).toBe(expected);
      expect(generateWorld(seed, factions, 500)).toEqual(world);
    }
  });

  it('generates deterministic distant provinces without changing factions or simulation randomness', () => {
    const before = structuredClone(factions);
    const first = generateWorld(42, factions, 1000);
    expect(first).toEqual(generateWorld(42, factions, 1000));
    expect(factions).toEqual(before);
    expect(first).not.toEqual(generateWorld(1, factions, 1000));
    first.entities[0].amount = 0;
    expect(generateWorld(42, factions, 1000).entities[0].amount).toBeGreaterThan(0);
    const state = createInitialState(42, 'guided', 'random', 1000);
    expect(state.seed).toBe(42);
    expect(state.mapGeneration).toMatchObject({ worldSize: 1000, landNavigation: 1 });
    expect(state.units).toHaveLength(7);
    expect(state.home).toEqual(home);
    expect(state.explored).toEqual([home]);
    expect(Object.keys(state.words)).toHaveLength(4);
    expect(state.units.every((unit) => distance(unit, home) <= 4.0001)).toBe(true);
    expect(state.entities.some((entity) => entity.id === `entity-${state.revision}`)).toBe(false);
    expect(state.revision).toBeGreaterThan(state.entities.length);
    const canonical = createInitialState(42, 'guided', 'seed-zero', 1000);
    expect(canonical.home).toEqual({ x: 250, y: 250 });
    expect(canonical.mapGeneration?.worldSize).toBeUndefined();
  });

  it('keeps local work distances while opening one hundred dry, connected provinces', () => {
    const seeds = [
      0,
      1,
      42,
      6842,
      4294967295,
      ...Array.from({ length: 20 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0),
    ];
    for (const seed of seeds) {
      const world = generateWorld(seed, factions, 1000);
      const { entities, sectors, cities } = world;
      expect(sectors).toHaveLength(100);
      expect(sectors.filter((sector) => sector.explored)).toEqual([
        expect.objectContaining({ x: 5, y: 5, biome: 'plain' }),
      ]);
      expect(new Set(sectors.map((sector) => sector.id)).size).toBe(100);
      expect(entities.some((entity) => entity.x > 800 && entity.y > 800)).toBe(true);
      const nearby = (kind: MapEntity['kind'], radius: number) =>
        entities.filter((entity) => entity.kind === kind && distance(entity, home) <= radius);
      expect(
        nearby('berries', 25).reduce((sum, entity) => sum + entity.amount, 0),
      ).toBeGreaterThanOrEqual(80);
      expect(
        nearby('tree', 60).reduce((sum, entity) => sum + entity.amount, 0),
      ).toBeGreaterThanOrEqual(240);
      expect(
        nearby('stone', 50).filter((entity) => entity.amount >= 100).length,
      ).toBeGreaterThanOrEqual(2);
      expect(nearby('ore', 65).some((entity) => entity.amount === 500)).toBe(true);
      expect(nearby('deer', 65).length).toBeGreaterThanOrEqual(6);
      const firstTree = nearby('tree', 60).sort((a, b) => distance(a, home) - distance(b, home))[0];
      const firstRock = nearby('stone', 50).sort(
        (a, b) => distance(a, home) - distance(b, home),
      )[0];
      expect(distance(firstTree, home)).toBeLessThanOrEqual(28.01);
      expect(distance(firstTree, firstRock)).toBeLessThanOrEqual(10.02);
      const river = riverSegments(sectors);
      expect(river).toHaveLength(12);
      for (const endpoint of [river[0][0], river.at(-1)![1]])
        expect(
          [endpoint.x, endpoint.y].some((coordinate) => coordinate === 0 || coordinate === 1000),
        ).toBe(true);
      expect(cities).toHaveLength(4);
      expect(new Set(cities.map((city) => `${city.sectorX}:${city.sectorY}`)).size).toBe(4);
      for (const city of cities) {
        expect(distance(city, home)).toBeGreaterThanOrEqual(160);
        expect(river.every((segment) => distanceToRiver(city, segment) >= 20)).toBe(true);
        expect(
          sectors.find((sector) => sector.x === city.sectorX && sector.y === city.sectorY)?.cityId,
        ).toBe(city.id);
      }
      const buckets = new Map<string, MapEntity[]>();
      for (const entity of entities) {
        expect(entity.x >= 2 && entity.x <= 998 && entity.y >= 2 && entity.y <= 998).toBe(true);
        expect(entity.sectorId).toBe(
          `sector-${Math.floor(entity.x / 100)}-${Math.floor(entity.y / 100)}`,
        );
        expect(river.every((segment) => distanceToRiver(entity, segment) >= 11.99)).toBe(true);
        if (['wolf', 'alpha', 'mammoth'].includes(entity.kind))
          expect(distance(entity, home)).toBeGreaterThanOrEqual(109.99);
        const bx = Math.floor(entity.x / 4),
          by = Math.floor(entity.y / 4);
        for (let y = by - 1; y <= by + 1; y++)
          for (let x = bx - 1; x <= bx + 1; x++)
            expect(
              (buckets.get(`${x}:${y}`) ?? []).every((other) => distance(entity, other) >= 3.98),
            ).toBe(true);
        const key = `${bx}:${by}`;
        buckets.set(key, [...(buckets.get(key) ?? []), entity]);
      }
    }
  }, 20_000);
});
