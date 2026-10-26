import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, HOME, WORD_ORDER } from './content';
import { createGame, issueCommand } from './engine';
import { getOrderPreview } from './orderPreview';
import type { GameState, Target } from './types';

function fixture() {
  const state = createGame(6842, 'guided');
  state.started = true;
  state.tier = 5;
  state.time = 15;
  state.cities = [];
  state.factions = [];
  state.entities = [];
  state.buildings = [];
  state.resources = { ...emptyInventory(), wood: 20, stone: 20, food: 10 };
  state.buildings.push({
    id: 'depot',
    kind: 'depot',
    ...HOME,
    active: true,
    completed: true,
    hp: 150,
  });
  for (const unit of state.units)
    Object.assign(unit, { ...HOME, age: 6, action: 'idle', hunger: 0, temp: 100 });
  for (const id of WORD_ORDER)
    state.words[id] = { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 };
  return state;
}
const point: Target = { type: 'point', x: 260, y: 250 };
const preview = (s: GameState, words: string[]) => getOrderPreview(s, words, point);

describe('command preview uses the real handler without advancing the world', () => {
  it('does not mutate resources, RNG, jobs, voice or knowledge even when the command builds', () => {
    const s = fixture(),
      before = structuredClone(s);
    const result = preview(s, ['S_01', 'V_08', 'O_02', 'O_01']);
    expect(result.accepted).toBe(true);
    expect(result.unitIds).toEqual([s.units[0].id]);
    expect(result.costs).toEqual(
      expect.arrayContaining([
        { resource: 'stone', amount: 20 },
        { resource: 'wood', amount: 10 },
      ]),
    );
    expect(result.voice).toBe(1);
    expect(s).toEqual(before);
  });
  it('traces one actual artisan rather than announcing every group member', () => {
    const s = fixture();
    const result = preview(s, ['S_01', 'V_06', 'O_02']);
    const actual = issueCommand(s, ['S_01', 'V_06', 'O_02'], point);
    expect(result.unitIds).toEqual(
      actual.units.filter((u) => u.action === 'crafting').map((u) => u.id),
    );
    expect(result.unitIds).toHaveLength(1);
  });
  it('excludes children, foreign visitors and adults outside the real call radius', () => {
    const s = fixture();
    s.units[1].age = 1;
    s.units[2].factionId = 'other';
    s.units[3].x = 300;
    const result = preview(s, ['S_01', 'V_01']);
    expect(result.unitIds).toEqual(
      s.units.filter((u) => u.age >= 4 && u.factionId === 'player' && u.x === 250).map((u) => u.id),
    );
  });
  it('preserves actual executor selection for Io', () => {
    const s = fixture(),
      person = s.units[2];
    expect(getOrderPreview(s, ['S_02', 'V_01'], point, person.id).unitIds).toEqual([person.id]);
    expect(getOrderPreview(s, ['S_02', 'V_01'], point).accepted).toBe(false);
  });
  it('reports job interruption and dropped cargo before they happen', () => {
    const s = fixture();
    s.units[0].carry = { resource: 'wood', amount: 3 };
    s.units[0].action = 'returning';
    s.units[0].command = ['S_01', 'V_04', 'O_03'];
    s.units[1].suspendedJob = { buildingId: 'old', command: ['S_01', 'V_09', 'O_04', 'O_01'] };
    const result = preview(s, ['S_01', 'V_01']);
    expect(result.cargoDrops).toEqual([s.units[0].id]);
    expect(result.interruptions).toEqual([s.units[0].id, s.units[1].id]);
    expect(s.units[0].carry?.amount).toBe(3);
  });
  it('counts a construction payment in full even when that order also drops a load', () => {
    const s = fixture();
    s.units[0].carry = { resource: 'wood', amount: 3 };
    const result = preview(s, ['S_01', 'V_08', 'O_02', 'O_01']);
    expect(result.costs).toContainEqual({ resource: 'wood', amount: 10 });
  });
  it('returns the real resource rejection and leaves the state intact', () => {
    const s = fixture();
    s.resources.stone = 0;
    const result = preview(s, ['S_01', 'V_06', 'O_02']);
    expect(result.accepted).toBe(false);
    expect(result.message).toContain('Materiali insufficienti');
    expect(result.unitIds).toEqual([]);
    s.voice = 0;
    expect(preview(s, ['S_01', 'V_01']).message).toContain('voce');
  });
  it('does not confuse a registered tradition with immediate individual work', () => {
    const s = fixture();
    s.attention = 100;
    const result = preview(s, ['C_02', 'S_01', 'V_04', 'O_03']);
    expect(result.accepted).toBe(true);
    expect(result.institutional).toBe(true);
    expect(result.unitIds).toEqual([]);
    expect(s.traditions).toEqual([]);
  });
  it('can trace a repeated assignment whose resulting FSM is identical', () => {
    const s = fixture();
    const farm = {
      id: 'farm',
      kind: 'farm' as const,
      ...HOME,
      active: true,
      completed: true,
      hp: BUILDING_SPECS.farm.maxHp,
      workerIds: [],
    };
    s.buildings.push(farm);
    const target: Target = { type: 'building', id: farm.id, ...HOME };
    const words = ['S_01', 'V_09', 'O_04', 'O_01'];
    const assigned = issueCommand(s, words, target);
    expect(getOrderPreview(assigned, words, target).unitIds).toHaveLength(3);
    const trace = { assignedUnitIds: [] as string[] };
    expect(issueCommand(assigned, words, target, undefined, undefined, trace)).toEqual(
      issueCommand(assigned, words, target),
    );
  });
  it('labels actual Guided and Classic task lifecycles separately', () => {
    const s = fixture();
    expect(preview(s, ['S_01', 'V_04', 'O_03']).behaviour).toContain('ripete i viaggi');
    s.playMode = 'classic';
    expect(preview(s, ['S_01', 'V_04', 'O_03']).behaviour).toContain('un viaggio');
    expect(preview(s, ['S_01', 'V_06', 'O_02']).behaviour).toContain('poi termina');
  });
});
