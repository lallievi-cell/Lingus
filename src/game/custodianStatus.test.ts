import { describe, expect, it } from 'vitest';
import { createGame, teachWord } from './engine';
import { canTransmitWord, getCustodianStatuses } from './custodianStatus';
import { killUnit } from './simulation';

function oralMemory() {
  const state = createGame(6842);
  const custodian = state.units.find((unit) => unit.name === 'Uma')!;
  state.words.O_05 = { retention: 50, custodians: [custodian.id], uses: 0 };
  custodian.knows.push('O_05');
  return { state, custodian };
}

describe('last living oral custodians', () => {
  it('groups only living non-innate words by their sole living owned custodian', () => {
    const { state, custodian } = oralMemory();
    const dead = state.units.find((unit) => unit.id !== custodian.id)!;
    dead.hp = 0;
    const foreign = state.units.find((unit) => unit.id !== dead.id && unit.id !== custodian.id)!;
    foreign.factionId = 'foreign';
    state.words.O_05.custodians.push(dead.id, foreign.id, custodian.id);
    state.words.V_06 = { retention: 40, custodians: [custodian.id], uses: 0 };
    state.words.O_03 = { retention: 0, custodians: [custodian.id], uses: 0 };
    state.words.O_02 = { retention: 40, custodians: [dead.id, foreign.id], uses: 0 };
    state.words.S_01.custodians = [custodian.id];
    const snapshot = structuredClone(state);
    expect(getCustodianStatuses(state)).toEqual([
      {
        unitId: custodian.id,
        wordIds: ['O_05', 'V_06'],
        risk: 'ageing',
        reasons: ['elder'],
        displayName: 'Un compagno',
      },
    ]);
    expect(state).toEqual(snapshot);
  });

  it('stops warning when another living companion carries the same word', () => {
    const { state } = oralMemory();
    state.words.O_05.custodians.push(state.units[0].id);
    expect(getCustodianStatuses(state)).toEqual([]);
  });

  it('reveals a name only while Io is alive in the shared vocabulary', () => {
    const { state, custodian } = oralMemory();
    state.words.S_02 = { retention: 50, custodians: [custodian.id], uses: 0 };
    expect(getCustodianStatuses(state)[0].displayName).toBe('Uma');
    state.words.S_02.retention = 0;
    expect(getCustodianStatuses(state)[0].displayName).toBe('Un compagno');
  });

  it('prioritizes immediate danger over old age and does not treat safe custody as an alarm', () => {
    const { state, custodian } = oralMemory();
    const wounded = state.units[0];
    wounded.hp = 30;
    state.words.O_02 = { retention: 50, custodians: [wounded.id], uses: 0 };
    const safe = state.units[1];
    state.words.O_03 = { retention: 50, custodians: [safe.id], uses: 0 };
    const statuses = getCustodianStatuses(state);
    expect(statuses.map(({ unitId, risk }) => ({ unitId, risk }))).toEqual([
      { unitId: wounded.id, risk: 'critical' },
      { unitId: custodian.id, risk: 'ageing' },
      { unitId: safe.id, risk: 'safe' },
    ]);
  });

  it('identifies starvation, exposure and live dangerous hunts without alarming for deer or carcasses', () => {
    const { state, custodian } = oralMemory();
    custodian.age = 8;
    custodian.hunger = 95;
    custodian.temp = 20;
    custodian.action = 'hunting';
    state.entities = [
      { id: 'quarry', kind: 'mammoth', x: 250, y: 250, amount: 1, hp: 100, maxHp: 100 },
    ];
    custodian.targetId = 'quarry';
    expect(getCustodianStatuses(state)[0].reasons).toEqual(['hunger', 'cold', 'danger']);
    custodian.hunger = 20;
    custodian.temp = 100;
    state.entities[0].kind = 'deer';
    expect(getCustodianStatuses(state)[0].risk).toBe('safe');
    state.entities[0].kind = 'mammoth';
    state.entities[0].hp = 0;
    expect(getCustodianStatuses(state)[0].risk).toBe('safe');
    custodian.action = 'combat';
    expect(getCustodianStatuses(state)[0].reasons).toEqual(['danger']);
  });

  it('keeps the warning for written support because an archive does not save sole-custodian death', () => {
    const { state, custodian } = oralMemory();
    state.words.O_05.support = 100;
    state.buildings.push({ id: 'archive', kind: 'archive', ...state.home, hp: 350, active: true });
    expect(getCustodianStatuses(state)[0].wordIds).toContain('O_05');
    killUnit(state, custodian);
    expect(state.words.O_05.retention).toBe(0);
    expect(getCustodianStatuses(state)).toEqual([]);
  });
});

describe('existing campfire lesson availability', () => {
  it('requires an owned, completed, healthy and active fire plus actual attention and a pupil', () => {
    const { state } = oralMemory();
    state.attention = 30;
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    const fire = {
      id: 'fire',
      kind: 'campfire' as const,
      ...state.home,
      hp: 100,
      active: true,
      completed: false,
    };
    state.buildings.push(fire);
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    fire.completed = true;
    expect(canTransmitWord(state, 'O_05')).toBe(true);
    fire.hp = 0;
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    fire.hp = 100;
    fire.active = false;
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    fire.active = true;
    state.buildings[0].cityId = 'not-owned';
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    state.buildings[0].cityId = undefined;
    state.attention = 9;
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    state.attention = 10;
    state.units.forEach((unit) => {
      unit.age = 14;
    });
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    state.units[0].age = 2;
    state.units[0].caste = 'slave';
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    state.units[0].caste = undefined;
    state.units[0].factionId = 'foreign';
    expect(canTransmitWord(state, 'O_05')).toBe(false);
    state.units[0].factionId = 'player';
    expect(canTransmitWord(state, 'O_05')).toBe(true);
  });

  it('pays the existing lesson cost and removes the sole-custodian warning even at full retention', () => {
    const { state } = oralMemory();
    state.attention = 20;
    state.words.O_05.retention = 100;
    state.buildings.push({ id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true });
    expect(canTransmitWord(state, 'S_01')).toBe(false);
    expect(canTransmitWord(state, 'missing')).toBe(false);
    expect(canTransmitWord(state, 'O_05')).toBe(true);
    const taught = teachWord(state, 'O_05');
    expect(taught.attention).toBe(10);
    expect(taught.words.O_05.custodians).toHaveLength(2);
    expect(getCustodianStatuses(taught)).toEqual([]);
    expect(state.campfirePending).toBe(false);
    expect(taught.campfirePending).toBe(false);
  });
});
