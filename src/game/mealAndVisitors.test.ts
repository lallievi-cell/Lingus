import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from './engine';
import { processWork, simulationStep } from './simulation';

describe('physical meals and represented foreign visitors', () => {
  it('eats delivered food to satiety on a real order before leaving for a remote berry bush', () => {
    let state = createGame(6842, 'classic');
    Object.assign(state, { started: true, tier: 1 });
    state.units = state.units.slice(0, 1);
    Object.assign(state.units[0], { ...state.home, hunger: 70 });
    state.words.O_04 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.resources.food = 3;
    const berry = state.entities.find((entity) => entity.kind === 'berries')!;
    const berryAmount = berry.amount;
    state = issueCommand(state, ['S_01', 'V_02', 'O_04']);
    const unit = state.units[0];
    for (let step = 0; step < 18; step++) {
      state.time += 0.25;
      processWork(state, unit, 0.25);
    }
    expect(unit.hunger).toBe(0);
    expect(unit.action).toBe('idle');
    expect(unit.x).toBe(state.home.x);
    expect(unit.y).toBe(state.home.y);
    expect(state.resources.food).toBe(0);
    expect(state.entities.find((entity) => entity.id === berry.id)!.amount).toBe(berryAmount);
  });

  it.each([false, true])(
    'deducts the real foreign city resident once on capture=%s without player mourning',
    (capture) => {
      let state = createGame(6842);
      Object.assign(state, { started: true, tier: 2 });
      const city = state.cities[0];
      city.cohorts.warriors = 2;
      city.garrisonHp = 140;
      state.units = state.units.slice(0, 1);
      Object.assign(state.units[0], { x: city.x, y: city.y, hunger: 0 });
      for (const id of ['S_05', 'V_05'])
        state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
      simulationStep(state, 0);
      const visitor = state.units.find((unit) => unit.id === `envoy-${city.id}`)!;
      expect(visitor.hp).toBe(70);
      const faction = state.factions.find((entry) => entry.id === city.factionId)!;
      faction.peaceUntil = state.time + 270;
      visitor.hp = 1;
      const tokens = ['S_01', 'V_03', 'S_05', ...(capture ? ['V_05'] : [])];
      state = issueCommand(
        state,
        tokens,
        { type: 'unit', id: visitor.id, x: visitor.x, y: visitor.y },
        undefined,
        { type: 'point', x: city.x, y: city.y },
      );
      expect(state.stats.commands).toBe(1);
      const attacker = state.units[0];
      for (let step = 0; step < 16; step++) {
        state.time += 0.25;
        processWork(state, attacker, 0.25);
      }
      const origin = state.cities.find((entry) => entry.id === city.id)!;
      const person = state.units.find((unit) => unit.id === visitor.id)!;
      expect(origin.cohorts.warriors).toBe(1);
      expect(origin.garrisonHp).toBe(70);
      expect(person.cityId).toBeUndefined();
      expect(person.factionId === 'player').toBe(capture);
      expect(person.hp > 0).toBe(capture);
      expect(state.stats.deaths).toBe(0);
      expect(state.cohesion).toBe(100);
      const offended = state.factions.find((entry) => entry.id === city.factionId)!;
      expect(offended.hostile).toBe(true);
      expect(offended.relation).toBe(-100);
      expect(offended.peaceUntil).toBeUndefined();
    },
  );
});
