import { describe, expect, it } from 'vitest';
import { createGame, issueCommand, tick } from '../game/engine';
import { GameWorldAudioEvents, soundscapeFrame } from './worldAudio';

function scene() {
  const state = createGame(6842);
  state.started = true;
  state.paused = false;
  state.time = 20;
  state.entities = [];
  state.buildings = [];
  state.units = state.units.slice(0, 3);
  state.units.forEach((unit, i) =>
    Object.assign(unit, {
      x: 250 + i,
      y: 250,
      age: 6,
      action: 'gathering',
      hp: 100,
      lastEventAt: {},
    }),
  );
  return state;
}

describe('real world sound observation', () => {
  it('does not invent working or walking sounds for a stationary task label', () => {
    const state = scene();
    const events = new GameWorldAudioEvents();
    expect(events.observe(state, true)).toEqual([]);
    state.time += 0.25;
    expect(events.observe(state, true)).toEqual([]);
    state.units[0].x += 0.6;
    state.time += 0.25;
    expect(events.observe(state, true).map((cue) => cue.kind)).toEqual(['step']);
    state.time += 0.25;
    expect(events.observe(state, true)).toEqual([]);
  });

  it('hears actual engine work on a tree and leaves the simulated state untouched', () => {
    let state = createGame(6842);
    state.started = true;
    state.paused = false;
    state.words.O_03 = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    state.units.forEach((unit) => unit.knows.push('O_03'));
    const tree = state.entities.find((entity) => entity.kind === 'tree')!;
    state = issueCommand(state, ['S_01', 'V_03'], {
      type: 'entity',
      id: tree.id,
      x: tree.x,
      y: tree.y,
    });
    const events = new GameWorldAudioEvents();
    events.observe(state, true);
    let heardWood = false;
    for (let frame = 0; frame < 180 && !heardWood; frame++) {
      state = tick(state, 0.25);
      const before = JSON.stringify(state);
      heardWood = events.observe(state, true).some((cue) => cue.kind === 'wood');
      expect(JSON.stringify(state)).toBe(before);
    }
    expect(heardWood).toBe(true);
    expect(
      state.entities.some(
        (entity) => entity.kind === 'ground' && entity.resource === 'wood' && entity.amount > 0,
      ),
    ).toBe(true);
  });

  it('coalesces a working group, hears a final stroke after target reset and separates deliveries', () => {
    const state = scene();
    state.entities = [
      { id: 'tree', kind: 'tree', x: 251, y: 250, amount: 10, hp: 100, maxHp: 100 },
    ];
    state.units.forEach((unit) => (unit.targetId = 'tree'));
    const events = new GameWorldAudioEvents();
    events.observe(state, true);
    state.time += 0.25;
    state.units.forEach((unit) => {
      unit.lastEventAt!['WORK:V_04'] = state.time;
      unit.targetId = undefined;
    });
    const sounds = events.observe(state, true);
    expect(sounds.map((cue) => cue.kind)).toEqual(['wood']);
    expect(sounds[0].volume).toBeGreaterThan(0);
    state.time++;
    state.units[0].lastEventAt!.DELIVERY = state.time;
    state.units[1].lastEventAt!.MEAL = state.time;
    state.units[2].x++;
    expect(events.observe(state, true).map((cue) => cue.kind)).toEqual(['delivery', 'meal']);
  });

  it('does not replay hidden work, imported history, long gaps, rewinds or paused footsteps', () => {
    const state = scene();
    const events = new GameWorldAudioEvents();
    events.observe(state, true);
    state.time += 0.25;
    state.units[0].lastEventAt!.MEAL = state.time;
    expect(events.observe(state, false)).toEqual([]);
    expect(events.observe(state, true)).toEqual([]);
    state.time += 0.25;
    state.units[0].lastEventAt!.DELIVERY = state.time;
    expect(events.observe(state, true, 'import')).toEqual([]);
    state.time += 20;
    expect(events.observe(state, true, 'import')).toEqual([]);
    state.time = 1;
    expect(events.observe(state, true, 'import')).toEqual([]);
    state.paused = true;
    state.units[0].x += 5;
    expect(events.observe(state, true, 'import')).toEqual([]);
  });

  it('attenuates distant sounds and never exposes work outside explored ground', () => {
    const state = scene();
    const events = new GameWorldAudioEvents();
    events.observe(state, true);
    state.time += 0.25;
    state.units[0].lastEventAt!.DELIVERY = state.time;
    const local = events.observe(state, true)[0];
    expect(local.volume).toBe(1);
    state.time++;
    state.units[0].x += 45;
    state.units[0].lastEventAt!.DELIVERY = state.time;
    expect(events.observe(state, true).find((cue) => cue.kind === 'delivery')!.volume).toBeLessThan(
      local.volume,
    );
    state.sectors.forEach((sector) => (sector.explored = false));
    state.time++;
    state.units[0].lastEventAt!.DELIVERY = state.time;
    expect(events.observe(state, true)).toEqual([]);
    state.sectors.forEach((sector) => (sector.explored = true));
    expect(events.observe(state, true)).toEqual([]);
  });

  it('uses an actual animal wound rather than a permanent attacked flag', () => {
    const state = scene();
    const wolf = {
      id: 'wolf',
      kind: 'wolf' as const,
      x: 251,
      y: 250,
      hp: 100,
      maxHp: 100,
      amount: 1,
      attacked: true,
    };
    state.entities = [wolf];
    const events = new GameWorldAudioEvents();
    events.observe(state, true);
    state.time += 0.25;
    expect(events.observe(state, true)).toEqual([]);
    wolf.hp = 0;
    state.time += 0.25;
    expect(events.observe(state, true).map((cue) => cue.kind)).toEqual(['animal']);
    state.time += 6;
    expect(events.observe(state, true)).toEqual([]);
  });
});

describe('the real camp soundscape', () => {
  it('keeps empty, distant, unfinished and extinguished hearths silent', () => {
    const state = scene();
    expect(soundscapeFrame(state).fire).toBe(0);
    state.buildings = [{ id: 'fire', kind: 'campfire', x: 250, y: 250, hp: 100, active: true }];
    expect(soundscapeFrame(state).fire).toBe(1);
    state.buildings[0].active = false;
    expect(soundscapeFrame(state).fire).toBe(0);
    state.buildings[0].active = true;
    state.buildings[0].completed = false;
    expect(soundscapeFrame(state).fire).toBe(0);
    state.buildings[0].completed = true;
    state.buildings[0].x = 300;
    expect(soundscapeFrame(state).fire).toBe(0);
  });

  it('follows the actual extended calendar, weather and nearby visible distress', () => {
    const state = createGame(6842, 'guided');
    state.time = 80;
    expect(soundscapeFrame(state).night).toBe(false);
    state.time = 110;
    expect(soundscapeFrame(state).night).toBe(true);
    state.disasters.blizzard = true;
    state.units[0].temp = 10;
    expect(soundscapeFrame(state)).toMatchObject({ weather: 'blizzard', tense: true });
    state.units[0].x = 499;
    state.units[0].y = 499;
    expect(soundscapeFrame(state).tense).toBe(false);
  });
});
