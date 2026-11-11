import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from './engine';
import { WORD_ORDER } from './content';
import { getOrderPreview } from './orderPreview';
import { getRiverFords, isLandPoint } from './landNavigation';
import { createRiverArtGeometry } from './riverGeometry';
import { targetPresentation } from '../components/targetPresentation';
import { getVisibleWorldTargets } from '../components/visibleWorldTargets';

function scene() {
  const state = createGame(42, 'classic', 'random');
  state.started = true;
  state.tier = 3;
  state.units = [state.units[0]];
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  state.units[0].knows = [...WORD_ORDER];
  const ford = getRiverFords(state)[0];
  Object.assign(state.units[0], ford.bankA, {
    action: 'returning',
    carry: { resource: 'wood', amount: 2 },
  });
  const water = createRiverArtGeometry(state).points.find(
    (point) =>
      point.x > 10 && point.x < 490 && point.y > 10 && point.y < 490 && !isLandPoint(state, point),
  )!;
  return { state, ford, water: { type: 'point' as const, x: water.x, y: water.y } };
}

describe('land orders and visible river crossings', () => {
  it('rejects a deep-water destination without charging Voice or interrupting real cargo', () => {
    const { state, water } = scene();
    const before = structuredClone(state);
    const next = issueCommand(state, ['S_02', 'V_01'], water, state.units[0].id);
    expect(next.voice).toBe(state.voice);
    expect(next.stats.commands).toBe(state.stats.commands);
    expect(next.units).toEqual(state.units);
    expect(next.resources).toEqual(state.resources);
    expect(next.logs[0].text).toContain('guado');
    const preview = getOrderPreview(state, ['S_02', 'V_01'], water, state.units[0].id);
    expect(preview.accepted).toBe(false);
    expect(preview.voice).toBe(0);
    expect(preview.costs).toEqual([]);
    expect(state).toEqual(before);
  });

  it('accepts a destination across the river while refusing construction in deep water', () => {
    const { state, ford, water } = scene();
    Object.assign(state.resources, { wood: 100, stone: 100 });
    const across = issueCommand(
      state,
      ['S_02', 'V_01'],
      { type: 'point', ...ford.bankB },
      state.units[0].id,
    );
    expect(across.voice).toBe(state.voice - 1);
    expect(across.units[0].action).toBe('moving');
    expect(across.units[0].tx).toBe(ford.bankB.x);
    const building = issueCommand(state, ['S_01', 'V_05', 'O_02'], water);
    expect(building.voice).toBe(state.voice);
    expect(building.resources).toEqual(state.resources);
    expect(building.units).toEqual(state.units);
    const onFord = issueCommand(
      state,
      ['S_02', 'V_05', 'O_02'],
      { type: 'point', ...ford },
      state.units[0].id,
    );
    expect(onFord.voice).toBe(state.voice);
    expect(onFord.resources).toEqual(state.resources);
    expect(onFord.units).toEqual(state.units);
    expect(onFord.logs[0].text).toContain('terreno asciutto');
    const fireOnFord = issueCommand(
      state,
      ['S_02', 'V_05', 'O_05'],
      { type: 'point', ...ford },
      state.units[0].id,
    );
    expect(fireOnFord.voice).toBe(state.voice);
    expect(fireOnFord.resources).toEqual(state.resources);
    expect(fireOnFord.units).toEqual(state.units);
    expect(fireOnFord.logs[0].text).toContain('terreno asciutto');
  });

  it('exposes a crossing as a physical place only after exploration', () => {
    const { state, ford, water } = scene();
    state.sectors.forEach((sector) => {
      sector.explored = false;
    });
    const view = { minX: 0, minY: 0, maxX: 500, maxY: 500 };
    expect(
      getVisibleWorldTargets(state, view).filter((entry) => entry.target.id === ford.id),
    ).toEqual([]);
    expect(targetPresentation(state, { type: 'point', ...ford })).toBeNull();
    state.sectors.find(
      (sector) => sector.x === Math.floor(ford.x / 100) && sector.y === Math.floor(ford.y / 100),
    )!.explored = true;
    expect(getVisibleWorldTargets(state, view).some((entry) => entry.target.id === ford.id)).toBe(
      true,
    );
    expect(targetPresentation(state, { type: 'point', ...ford })?.label).toBe('Guado del fiume');
    state.tier = 4;
    expect(targetPresentation(state, water)?.stage).toBe('Passaggio impraticabile a piedi');
  });
});
