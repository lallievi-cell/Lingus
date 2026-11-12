import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { biomePresentation, targetBiomePresentation } from './biomePresentation';
import { targetPresentation } from './targetPresentation';
import { getRiverFords, isLandPoint } from '../game/landNavigation';
import { createRiverArtGeometry } from '../game/riverGeometry';

function scene() {
  const state = createGame(42, 'guided', 'random', 1000);
  const home = state.sectors.find((sector) => sector.x === 5 && sector.y === 5)!;
  home.biome = 'wetland';
  return state;
}

describe('visible biome information', () => {
  it('shows observed ground without revealing agriculture or numerical effects early', () => {
    const state = scene();
    const before = JSON.stringify(state);
    const result = biomePresentation(state, state.home)!;
    expect(result.label).toBe('Zona umida');
    expect(result.movement).toContain('rallenta');
    expect(result.movement).not.toMatch(/\d/);
    expect(result.farming).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('reveals exact effects only after the corresponding concepts are learned', () => {
    const state = scene();
    state.words.V_09 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    expect(biomePresentation(state, state.home)?.farming).toContain('più che in prateria');
    state.words.O_08 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    const result = biomePresentation(state, state.home)!;
    expect(result.movement).toContain('20%');
    expect(result.farming).toContain('125%');
  });

  it('describes visible terrain without naming materials that are still unknown', () => {
    const state = scene();
    const home = state.sectors.find((sector) => sector.x === 5 && sector.y === 5)!;
    for (const biome of ['plain', 'forest', 'mountain', 'wetland', 'dryland'] as const) {
      home.biome = biome;
      const result = biomePresentation(state, state.home)!;
      expect(result.description).not.toMatch(/legno|pietra|minerali|minerari|selce/i);
      expect(result.farming).toBeNull();
    }
  });

  it('keeps unexplored ground, out-of-bounds points and earlier saves private', () => {
    const state = scene();
    expect(biomePresentation(state, { x: 50, y: 50 })).toBeNull();
    expect(biomePresentation(state, { x: -1, y: 550 })).toBeNull();
    expect(targetPresentation(state, { type: 'point', x: 50, y: 50 })).toBeNull();
    delete state.mapGeneration!.biomeRules;
    expect(biomePresentation(state, state.home)).toBeNull();
    expect(targetPresentation(state, { type: 'point', ...state.home })).toBeNull();
  });

  it('uses a moving person’s live location instead of stale selection coordinates', () => {
    const state = scene();
    const person = state.units[0];
    const target = { type: 'unit' as const, id: person.id, ...state.home };
    Object.assign(person, { x: 50, y: 50 });
    expect(targetBiomePresentation(state, target)).toBeNull();
    Object.assign(person, state.home);
    expect(targetBiomePresentation(state, target)?.label).toBe('Zona umida');
  });

  it('does not advertise farming on a ford or a walking speed in deep water', () => {
    const state = scene();
    for (const sector of state.sectors) sector.explored = true;
    state.words.V_09 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    const ford = getRiverFords(state)[0];
    expect(ford).toBeDefined();
    expect(biomePresentation(state, ford)?.farming).toBeNull();
    const water = createRiverArtGeometry(state).points.find((point) => !isLandPoint(state, point));
    expect(water).toBeDefined();
    expect(biomePresentation(state, water)).toBeNull();
  });
});
