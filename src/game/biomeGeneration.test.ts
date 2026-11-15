import { describe, expect, it } from 'vitest';
import { isDryLandPoint, isLandSegment, planLandRoute } from './landNavigation';
import { createInitialState } from './state';
import type { MapEntity, Sector } from './types';
import { generateWorld } from './worldGeneration';

const seeds = [
  0,
  1,
  42,
  6842,
  4294967295,
  ...Array.from({ length: 27 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0),
];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('the ecological geography of new regions', () => {
  it('requires an explicit regional opt-in and keeps older generated valleys unchanged', () => {
    const factions = createInitialState().factions;
    for (const seed of seeds.slice(0, 5)) {
      expect(generateWorld(seed, factions, 1000, false)).toEqual(
        generateWorld(seed, factions, 1000),
      );
      expect(generateWorld(seed, factions, 500, true)).toEqual(generateWorld(seed, factions, 500));
      expect(
        generateWorld(seed, factions, 1000).sectors.some((sector) =>
          ['wetland', 'dryland'].includes(sector.biome),
        ),
      ).toBe(false);
    }
  });

  it('reproducibly places six habitats near suitable water and preserves the starter clearing', () => {
    const factions = createInitialState(42, 'guided', 'random', 1000).factions;
    for (const seed of seeds) {
      const world = generateWorld(seed, factions, 1000, true);
      expect(world).toEqual(generateWorld(seed, factions, 1000, true));
      expect([...new Set(world.sectors.map((sector) => sector.biome))].sort()).toEqual(
        ['plain', 'forest', 'mountain', 'river', 'wetland', 'dryland'].sort(),
      );
      const rivers = world.sectors.filter((sector) => sector.biome === 'river');
      const bankDistance = (sector: Sector) =>
        Math.min(
          ...rivers.map((river) => Math.abs(river.x - sector.x) + Math.abs(river.y - sector.y)),
        );
      const wetlands = world.sectors.filter((sector) => sector.biome === 'wetland');
      const drylands = world.sectors.filter((sector) => sector.biome === 'dryland');
      expect(wetlands.length).toBeGreaterThanOrEqual(3);
      expect(wetlands.every((sector) => bankDistance(sector) <= 2)).toBe(true);
      expect(drylands.length).toBeGreaterThanOrEqual(7);
      expect(drylands.every((sector) => bankDistance(sector) >= 3)).toBe(true);
      expect(world.sectors.filter((sector) => sector.biome === 'plain').length).toBeGreaterThan(5);
      expect(world.sectors.find((sector) => sector.id === 'sector-5-5')?.biome).toBe('plain');
      expect(
        [...wetlands, ...drylands].every(
          (sector) => Math.max(Math.abs(sector.x - 5), Math.abs(sector.y - 5)) > 1,
        ),
      ).toBe(true);
      const home = { x: 550, y: 550 };
      const nearby = (kind: MapEntity['kind'], radius: number) =>
        world.entities.filter((entity) => entity.kind === kind && distance(entity, home) <= radius);
      expect(
        nearby('berries', 25).reduce((sum, node) => sum + node.amount, 0),
      ).toBeGreaterThanOrEqual(80);
      expect(nearby('tree', 60).reduce((sum, node) => sum + node.amount, 0)).toBeGreaterThanOrEqual(
        240,
      );
      expect(
        nearby('stone', 50).filter((node) => node.amount >= 100).length,
      ).toBeGreaterThanOrEqual(2);
      expect(nearby('ore', 65).some((node) => node.amount === 500)).toBe(true);
      expect(nearby('deer', 65).length).toBeGreaterThanOrEqual(6);
      expect(
        world.entities
          .filter((entity) => ['wolf', 'alpha', 'mammoth'].includes(entity.kind))
          .every((animal) => distance(animal, home) >= 109.99),
      ).toBe(true);
    }
  }, 20_000);

  it('makes wetlands rich in edible plants and drylands sparse in wood and food', () => {
    const factions = createInitialState(42, 'guided', 'random', 1000).factions;
    for (const seed of seeds.slice(0, 12)) {
      const { sectors, entities } = generateWorld(seed, factions, 1000, true);
      for (const sector of sectors.filter((sector) =>
        ['wetland', 'dryland'].includes(sector.biome),
      )) {
        const count = (kind: MapEntity['kind']) =>
          entities.filter((entity) => entity.sectorId === sector.id && entity.kind === kind).length;
        if (sector.biome === 'wetland') {
          expect(count('berries')).toBeGreaterThanOrEqual(5);
          expect(count('tree')).toBeGreaterThanOrEqual(4);
          expect(count('stone')).toBe(1);
          expect(sector.faunaCapacity).toBe(20);
        } else {
          expect(count('berries')).toBeLessThanOrEqual(2);
          expect(count('tree')).toBeLessThanOrEqual(3);
          expect(count('stone')).toBeGreaterThanOrEqual(2);
          expect(sector.faunaCapacity).toBe(12);
        }
        expect(count('ore')).toBe(0);
        const actualFauna = entities.filter(
          (entity) =>
            entity.sectorId === sector.id &&
            ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind),
        ).length;
        expect(sector.initialFauna).toBe(actualFauna);
      }
    }
  });

  it('keeps all eight cities on dry land and physically reachable across new habitats', () => {
    for (const seed of seeds.slice(0, 3)) {
      const state = createInitialState(seed, 'guided', 'random', 1000);
      delete state.mapGeneration!.coastalRules;
      Object.assign(state, generateWorld(seed, state.factions, 1000, true));
      expect(state.cities).toHaveLength(8);
      for (const city of state.cities) {
        expect(isDryLandPoint(state, city)).toBe(true);
        const route = planLandRoute(state, state.home, city);
        expect(route).not.toBeNull();
        let previous = state.home;
        for (const waypoint of route!) {
          expect(isLandSegment(state, previous, waypoint)).toBe(true);
          previous = waypoint;
        }
        expect(previous).toMatchObject({ x: city.x, y: city.y });
      }
    }
  }, 30_000);
});
