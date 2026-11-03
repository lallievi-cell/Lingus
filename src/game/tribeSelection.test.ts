import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from './engine';
import { customGroupAnchor, customGroupMembers, idleTribeAdults } from './tribeSelection';

function village() {
  const state = createGame(6842, 'guided');
  Object.assign(state, { started: true, paused: true, tier: 1 });
  state.units = state.units.slice(0, 4);
  for (const [index, unit] of state.units.entries())
    Object.assign(unit, {
      age: 6,
      hp: 100,
      hunger: 20,
      temp: 100,
      action: 'idle',
      x: 240 + index * 20,
      y: 250,
    });
  state.words.S_02 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
  return state;
}

describe('explicit work-team selection', () => {
  it('resolves a roster subset without changing the game, even when people are dispersed', () => {
    const state = village();
    const before = structuredClone(state);
    const anchor = customGroupAnchor(state, [
      state.units[2].id,
      state.units[0].id,
      state.units[0].id,
      'missing',
    ]);
    expect(anchor).toMatchObject({
      id: 'selection:custom',
      x: 260,
      y: 250,
      unitIds: [state.units[0].id, state.units[2].id],
    });
    expect(customGroupMembers(state, anchor).map((unit) => unit.id)).toEqual(anchor.unitIds);
    expect(state).toEqual(before);
  });
  it('never fills a lost or ineligible member’s place with a nearby unselected person', () => {
    const state = village();
    const anchor = customGroupAnchor(state, [state.units[0].id, state.units[2].id]);
    state.units[0].hp = 0;
    state.units[2].action = 'delegating';
    expect(customGroupMembers(state, anchor)).toEqual([]);
    state.words.S_02.retention = 0;
    expect(
      customGroupAnchor(
        state,
        state.units.map((unit) => unit.id),
      ).unitIds,
    ).toEqual([]);
  });
  it('the free-person preset preserves jobs, suspended work and recovery', () => {
    const state = village();
    state.units[1].command = ['S_01', 'V_03'];
    state.units[2].suspendedJob = { buildingId: 'farm', command: ['S_01', 'V_09', 'O_04'] };
    state.units[3].action = 'resting';
    expect(idleTribeAdults(state).map((unit) => unit.id)).toEqual([state.units[0].id]);
  });
  it('one real Group order charges once and changes only explicitly selected workers', () => {
    const state = village();
    Object.assign(state.units[1], {
      action: 'returning',
      command: ['S_01', 'V_04', 'O_03'],
      carry: { resource: 'wood', amount: 2 },
    });
    const anchor = customGroupAnchor(state, [state.units[0].id, state.units[2].id]);
    const next = issueCommand(
      state,
      ['S_01', 'V_01'],
      { type: 'point', x: 252, y: 260 },
      undefined,
      anchor,
    );
    expect(next.voice).toBe(state.voice - 1);
    expect(next.stats.commands).toBe(state.stats.commands + 1);
    expect(
      next.units.filter((unit) => unit.command?.join('|') === 'S_01|V_01').map((unit) => unit.id),
    ).toEqual(anchor.unitIds);
    expect(next.units[1]).toEqual(state.units[1]);
    expect(next.units[3]).toEqual(state.units[3]);
    expect(next.resources).toEqual(state.resources);
  });
});
