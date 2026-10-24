import { describe, expect, it } from 'vitest';
import { HOME } from './content';
import {
  createGame,
  createReadyBuilding,
  dismissCampfire,
  issueCommand,
  parseGame,
  serializeGame,
  tick,
} from './engine';
import type { GameState } from './types';

/** Local job/weather fixtures; full ordinary winters use their separate replay. */
function camp(time = 170) {
  const s = createGame(6842);
  Object.assign(s, { started: true, tier: 3, time, entities: [], cities: [], factions: [] });
  s.units = s.units.slice(0, 1);
  Object.assign(s.units[0], {
    ...HOME,
    age: 6,
    hunger: 0,
    temp: 100,
    hp: 100,
    action: 'idle',
    progress: 0,
  });
  for (const id of ['S_02', 'V_05', 'O_05', 'C_01', 'C_02']) {
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
    if (!s.units[0].knows.includes(id)) s.units[0].knows.push(id);
  }
  createReadyBuilding(s, 'campfire');
  s.resources.wood = 20;
  return s;
}
function fire(s: GameState) {
  return s.buildings.find((b) => b.kind === 'campfire')!;
}
function guard(s: GameState) {
  return issueCommand(s, ['S_01', 'V_05', 'O_05']);
}
function advance(s: GameState, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 0.25) {
    if (s.campfirePending) s = dismissCampfire(s);
    s = tick(s, Math.min(0.25, left));
  }
  return s;
}

describe('fire caretakers remain real guards through work interruptions', () => {
  it('keeps a direct caretaker present overnight and protects the actual seasonal storm', () => {
    let s = advance(guard(camp()), 9.75);
    expect(s.units[0].action).toBe('guarding');
    expect(s.units[0].jobBuildingId).toBe(fire(s).id);
    expect(s.units[0].suspendedJob).toBeUndefined();
    // One adult aging roll, then this seed's real storm roll below twenty percent.
    s.seed = 8;
    const unguarded = issueCommand(s, ['S_01', 'V_01'], { type: 'point', ...HOME });
    s = tick(s, 0.25);
    const control = tick(unguarded, 0.25);
    expect(s.disasters.storm).toBe(true);
    expect(control.disasters.storm).toBe(true);
    expect(fire(s).active).toBe(true);
    expect(fire(control).active).toBe(false);
    expect(s.resources.wood).toBeCloseTo(18 * 0.95);
  });

  it('pauses for a real meal, resumes guarding at night and spends real fuel to rekindle', () => {
    let s = advance(guard(camp()), 1);
    s.units[0].hunger = 74.9;
    s = advance(s, 0.25);
    expect(s.units[0].suspendedJob?.buildingId).toBe(fire(s).id);
    expect(s.units[0].jobBuildingId).toBeUndefined();
    expect(['resting', 'sleeping']).toContain(s.units[0].action);
    fire(s).active = false;
    s.resources.cooked = 2;
    s = advance(s, 3);
    expect(s.units[0].action).toBe('guarding');
    expect(s.units[0].suspendedJob).toBeUndefined();
    expect(fire(s).active).toBe(true);
    expect(s.resources.wood).toBe(19);
    expect(s.resources.cooked).toBe(1);
  });

  it('keeps the normal daytime and nighttime limits for conditional traditions', () => {
    let day = camp(55);
    day = issueCommand(day, ['C_02', 'S_01', 'V_05', 'O_05']);
    day = advance(day, 4);
    expect(day.units[0].action).toBe('guarding');
    day = advance(day, 2);
    expect(day.units[0].action).toBe('sleeping');
    expect(day.units[0].suspendedJob?.buildingId).toBe(fire(day).id);
    day = advance(day, 30);
    expect(day.units[0].action).toBe('guarding');

    let night = camp(65);
    night = issueCommand(night, ['C_01', 'S_01', 'V_05', 'O_05']);
    night = advance(night, 1);
    expect(night.units[0].action).toBe('guarding');
    night = advance(night, 25);
    expect(night.units[0].action).not.toBe('guarding');
    expect(night.units[0].jobBuildingId).toBeUndefined();
  });

  it('still obeys the night taboo and a replacement direct order', () => {
    let taboo = advance(guard(camp()), 1);
    taboo.dogmas.push({
      id: 'night-taboo',
      targetId: 'C_01',
      vectorId: 'M_01',
      name: 'Tabù',
      description: '',
      age: 0,
      weight: 10,
    });
    taboo = advance(taboo, 2);
    expect(taboo.units[0].action).toBe('sleeping');
    expect(taboo.units[0].suspendedJob?.buildingId).toBe(fire(taboo).id);
    expect(fire(taboo).workerIds).not.toContain(taboo.units[0].id);

    let replaced = advance(guard(camp()), 1);
    replaced = issueCommand(replaced, ['S_01', 'V_01'], { type: 'point', ...HOME });
    replaced = advance(replaced, 1);
    expect(replaced.units[0].action).not.toBe('guarding');
    expect(replaced.units[0].jobBuildingId).toBeUndefined();
    expect(replaced.units[0].suspendedJob).toBeUndefined();
  });

  it('recovers a saved fire caretaker resumed as a generic worker without granting free fuel', () => {
    let s = advance(guard(camp()), 1);
    s.units[0].action = 'working';
    fire(s).active = false;
    s = parseGame(serializeGame(s))!;
    expect(s).not.toBeNull();
    s.paused = false;
    s = advance(s, 0.25);
    expect(s.units[0].action).toBe('guarding');
    expect(fire(s).active).toBe(true);
    expect(s.resources.wood).toBe(19);
  });

  it('enforces a new prohibition before a rested caretaker can resume', () => {
    let s = advance(guard(camp()), 1);
    s.units[0].hunger = 74.9;
    s = advance(s, 0.25);
    s.resources.cooked = 1;
    s = advance(s, 0.25);
    createReadyBuilding(s, 'court');
    s.laws.push({
      id: 'fire-prohibition',
      name: 'Divieto',
      tokens: ['S_01', 'V_05', 'O_05', 'M_01', 'C_03', 'V_03'],
      subjectId: 'S_01',
      verbId: 'V_05',
      objectId: 'O_05',
      modifierId: 'M_01',
      sanctionId: 'V_03',
      prohibitive: true,
      age: 0,
    });
    s = advance(s, 0.25);
    expect(s.units[0].action).not.toBe('guarding');
    expect(s.units[0].jobBuildingId).toBeUndefined();
    expect(s.units[0].suspendedJob).toBeUndefined();
    expect(s.units[0].hp).toBe(60);
  });
});
