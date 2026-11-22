import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame } from './engine';
import { isDryLandPoint, planLandRoute } from './landNavigation';
import { getWorldRiverSegments } from './worldGeography';
import { generateWorldRegion } from './worldRegions';
import { regionProjection } from './worldRuntime';
import { validSave } from './saveValidation';
import type { GameState } from './types';

describe('lazy physical world region generation', () => {
  it.each([0, 1, 42, 6842, 4294967295, 2654435761])(
    'retains eight distinct reachable societies and a safe supplied opening for seed %i',
    (seed) => {
      const state = createGame(seed, 'classic', 'random', 1000, true);
      expect(state.units).toHaveLength(7);
      expect(state.cities).toHaveLength(8);
      expect(new Set(state.cities.map((city) => city.id)).size).toBe(8);
      for (const city of state.cities) {
        expect(isDryLandPoint(state, city), `city ${city.id} seed ${seed}`).toBe(true);
        expect(planLandRoute(state, state.home, city)).not.toBeNull();
        expect(
          state.cities
            .filter((other) => other !== city)
            .every((other) => Math.hypot(other.x - city.x, other.y - city.y) >= 145),
        ).toBe(true);
      }
      expect(state.entities.every((node) => isDryLandPoint(state, node))).toBe(true);
      const near = (kind: string, radius: number) =>
        state.entities.filter(
          (entity) =>
            entity.kind === kind &&
            Math.hypot(entity.x - state.home.x, entity.y - state.home.y) <= radius,
        );
      expect(
        near('berries', 25).reduce((sum, node) => sum + node.amount, 0),
      ).toBeGreaterThanOrEqual(80);
      expect(near('tree', 60).reduce((sum, node) => sum + node.amount, 0)).toBeGreaterThanOrEqual(
        240,
      );
      expect(near('stone', 50).filter((node) => node.amount >= 100).length).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        state.entities
          .filter((entity) => ['wolf', 'alpha', 'mammoth'].includes(entity.kind))
          .every((entity) => Math.hypot(entity.x - state.home.x, entity.y - state.home.y) >= 110),
      ).toBe(true);
      expect(validSave(state)).toBe(true);
    },
  );

  it('labels the actual shared river cells instead of retaining the previous local river', () => {
    const state = createGame(42, 'classic', 'random', 1000, true);
    generateWorldRegion(state, 0, 1);
    for (const id of ['0:0', '0:1']) {
      const local = regionProjection(state, id)!;
      const river = getWorldRiverSegments({
        seed: 42,
        regionX: local.mapGeneration!.regionX!,
        regionY: local.mapGeneration!.regionY!,
      });
      expect(local.sectors.some((sector) => sector.biome === 'river')).toBe(true);
      for (const [a, b] of river)
        for (let i = 0; i <= 20; i++) {
          const x = a.x + ((b.x - a.x) * i) / 20,
            y = a.y + ((b.y - a.y) * i) / 20;
          const sector = local.sectors.find(
            (candidate) =>
              candidate.x === Math.min(9, Math.floor(x / 100)) &&
              candidate.y === Math.min(9, Math.floor(y / 100)),
          )!;
          expect(['river', 'sea']).toContain(sector.biome);
        }
      expect(
        local.sectors
          .filter((sector) => sector.biome === 'river')
          .every((sector) => sector.x === 8),
      ).toBe(true);
    }
  });

  it('uses private reproducible generation, finite ecological nodes and no free settlers or stores', () => {
    const first = createGame(42, 'classic', 'random', 1000, true);
    const second = structuredClone(first);
    second.seed = 987654;
    const rngBefore = first.seed;
    const generated = generateWorldRegion(first, 1, 0);
    expect(generateWorldRegion(second, 1, 0)).toEqual(generated);
    expect(first.seed).toBe(rngBefore);
    expect(generated.resources).toEqual(emptyInventory());
    for (const key of [
      'units',
      'buildings',
      'boats',
      'cities',
      'factions',
      'battalions',
      'caravans',
    ] as const)
      expect(generated[key]).toEqual([]);
    const local = { ...first, ...generated } as GameState;
    expect(generated.entities.length).toBeGreaterThan(0);
    expect(new Set(generated.entities.map((entity) => entity.id)).size).toBe(
      generated.entities.length,
    );
    for (const entity of generated.entities) {
      expect(isDryLandPoint(local, entity)).toBe(true);
      expect(Number.isFinite(entity.amount) && entity.amount > 0).toBe(true);
      expect(entity.maxAmount).toBe(entity.amount);
      const sector = generated.sectors.find((candidate) => candidate.id === entity.sectorId)!;
      if (entity.kind === 'ore') expect(sector.biome).toBe('mountain');
      if (entity.kind === 'fishery') expect(entity.amount).toBeGreaterThanOrEqual(40);
    }
    for (const sector of generated.sectors)
      expect(sector.initialFauna).toBe(
        generated.entities.filter(
          (entity) => entity.sectorId === sector.id && entity.kind === 'deer',
        ).length,
      );
    const node = generated.entities[0];
    node.amount--;
    expect(generateWorldRegion(first, 1, 0)).toBe(generated);
    expect(generateWorldRegion(first, 1, 0).entities[0].amount).toBe(node.amount);
    expect(validSave(first)).toBe(true);
  });
});
