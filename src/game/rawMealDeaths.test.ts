import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { createGame, issueCommand, tick } from './engine';
import { consume, processWork, updateUnits } from './simulation';
import { validSave } from './saveValidation';
import { tribeEventText } from '../components/TribeEvents';

/** Seed 1972's first real draw is below the catalogued 10% raw-meat risk. */
function meal(mode: 'classic' | 'guided' = 'classic') {
  const state = createGame(1972, mode);
  Object.assign(state, { started: true, time: 10, tier: 1, entities: [], buildings: [] });
  state.units = state.units.slice(0, 1);
  const person = state.units[0];
  Object.assign(person, { ...state.home, age: 6, hp: 10, hunger: 20, action: 'idle' });
  state.words = Object.fromEntries(
    ['S_01', 'V_01', 'V_02', 'V_03', 'O_02', 'O_04'].map((id) => [
      id,
      { retention: 80, custodians: [person.id], uses: 0 },
    ]),
  );
  state.resources = { ...emptyInventory(), meat: 1 };
  return state;
}

describe('raw-meat damage settles a real death immediately', () => {
  it.each(['classic', 'guided'] as const)(
    'records the %s death, corpse and lost custodian without negative HP or duplicate events',
    (mode) => {
      let state = meal(mode);
      const person = state.units[0];
      expect(consume(state, person)).toBe(true);
      expect(person.hp).toBe(0);
      expect(person.action).toBe('dead');
      expect(state.resources.meat).toBe(0);
      expect(state.stats.deaths).toBe(1);
      expect(state.entities.filter((entity) => entity.kind === 'corpse')).toHaveLength(1);
      expect(state.words.O_02.retention).toBe(0);
      expect(state.words.O_02.custodians).toEqual([]);
      const death = state.tribeEvents!.find((event) => event.kind === 'death')!;
      expect(death.cause).toBe('STAT_PARASITES');
      expect(death.lostWordIds).toContain('O_02');
      expect(tribeEventText(state, death).text).toContain('dopo un pasto di carne cruda');
      expect(validSave(state)).toBe(true);
      state = tick(state, 0.25);
      expect(state.stats.deaths).toBe(1);
      expect(state.units[0].action).toBe('dead');
      expect(state.entities.filter((entity) => entity.kind === 'corpse')).toHaveLength(1);
    },
  );

  it.each([false, true])(
    'does not reset a dead eater after a stored or ground meal, ground=%s',
    (ground) => {
      let state = meal();
      if (ground) {
        state.resources.meat = 0;
        state.entities.push({
          id: 'meat',
          kind: 'ground',
          resource: 'meat',
          ...state.home,
          hp: 1,
          maxHp: 1,
          amount: 1,
        });
      }
      state = issueCommand(state, ['S_01', 'V_02', 'O_04']);
      const person = state.units[0];
      for (let step = 0; step < 16 && person.hp > 0; step++) {
        state.time += 0.25;
        processWork(state, person, 0.25);
      }
      expect(person.hunger).toBe(0);
      expect(person.action).toBe('dead');
      expect(person.hp).toBe(0);
      expect(state.stats.deaths).toBe(1);
    },
  );

  it('stops the privileged meal before instincts can move or reassign the dead person', () => {
    const state = meal('guided');
    state.units[0].hunger = 70;
    state.foodPriority = { subjectId: 'S_01' };
    updateUnits(state, 0.25);
    expect(state.units[0].action).toBe('dead');
    expect(state.units[0].x).toBe(state.home.x);
    expect(state.units[0].y).toBe(state.home.y);
    expect(state.stats.deaths).toBe(1);
  });

  it('deducts an urban resident cohort once at the actual meal', () => {
    const state = meal();
    const city = state.cities[0];
    Object.assign(city, {
      factionId: 'player',
      capital: true,
      cohorts: { workers: 1, warriors: 0, sages: 0, slaves: 0 },
      resources: state.resources,
    });
    Object.assign(state.units[0], { cityId: city.id, caste: 'citizen', x: city.x, y: city.y });
    state.urbanized = true;
    expect(consume(state, state.units[0])).toBe(true);
    expect(city.cohorts.workers).toBe(0);
    updateUnits(state, 1);
    expect(city.cohorts.workers).toBe(0);
    expect(state.stats.deaths).toBe(1);
  });

  it('detaches a foreign visitor without counting a player death or mourning', () => {
    const state = meal();
    const city = state.cities[0];
    city.cohorts.warriors = 1;
    city.garrisonHp = 80;
    Object.assign(state.units[0], { factionId: city.factionId, cityId: city.id, caste: 'warrior' });
    expect(consume(state, state.units[0])).toBe(true);
    expect(state.units[0].action).toBe('dead');
    expect(state.units[0].hp).toBe(0);
    expect(state.units[0].cityId).toBeUndefined();
    expect(city.cohorts.warriors).toBe(0);
    expect(city.garrisonHp).toBe(0);
    expect(state.stats.deaths).toBe(0);
    expect(state.cohesion).toBe(100);
    expect(state.tribeEvents ?? []).toEqual([]);
  });

  it('preserves the exact nonfatal damage and the protection law for slaves', () => {
    const state = meal();
    state.units[0].caste = 'slave';
    const tokens = ['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12'];
    state.laws = [
      {
        id: 'protection',
        name: 'Protezione',
        tokens,
        subjectId: tokens[0],
        verbId: tokens[1],
        objectId: tokens[2],
        modifierId: tokens[3],
        sanctionId: tokens[5],
        prohibitive: true,
        age: 0,
      },
    ];
    expect(consume(state, state.units[0])).toBe(true);
    expect(state.units[0].hp).toBe(2.5);
    expect(state.units[0].parasiteUntil).toBe(state.time + 45);
    expect(state.stats.deaths).toBe(0);
  });
});
