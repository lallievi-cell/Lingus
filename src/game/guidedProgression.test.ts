import { describe, expect, it } from 'vitest';
import {
  createGame,
  prepareCampfireCouncil,
  teachWord,
  dismissCampfire,
  issueCommand,
  tick,
  solveSpark,
  rehearseWord,
} from './engine';
import { killUnit, evaluateDiscoveries, seasonalCore } from './simulation';
import { WORDS } from './content';
import { guidedBirthMultiplier } from './guidedProgression';
import type { BuildingKind, GameState } from './types';

function addBuilding(state: GameState, kind: BuildingKind) {
  const building = {
    id: `${kind}-${state.buildings.length}`,
    kind,
    x: 250,
    y: 250,
    hp: 100,
    active: true,
    completed: true,
  };
  state.buildings.push(building);
  return building;
}

describe('explicit Guided progression calibration', () => {
  it('earns fertility through real completed owned infrastructure and preserves Classic', () => {
    const state = createGame(6842, 'guided');
    expect(guidedBirthMultiplier(state)).toBe(1);
    state.words.V_07 = { retention: 50, custodians: [state.units[0].id], uses: 0 };
    expect(guidedBirthMultiplier(state)).toBe(1.5);
    const farm = addBuilding(state, 'farm');
    const house = addBuilding(state, 'house');
    expect(guidedBirthMultiplier(state)).toBe(3.375);
    farm.completed = false;
    house.active = false;
    expect(guidedBirthMultiplier(state)).toBe(1.5);
    farm.completed = true;
    Object.assign(farm, { cityId: state.cities[0].id });
    expect(guidedBirthMultiplier(state)).toBe(1.5);
    state.playMode = 'classic';
    expect(guidedBirthMultiplier(state)).toBe(1);
  });

  it('preserves legacy fuel and lesson costs, adds a real pupil, and never carries credited fuel to another council', () => {
    let state = createGame(6842, 'guided');
    // The new profile has its own first-transmission and council-budget tests.
    delete state.openingBalanceVersion;
    delete state.openingCouncilsCompleted;
    addBuilding(state, 'campfire');
    state.campfirePending = true;
    state.attention = 0;
    state.burntWood = 0;
    state.resources.wood = 6;
    state.words.O_05 = { retention: 30, custodians: [state.units[0].id], uses: 0 };
    state = prepareCampfireCouncil(state);
    expect(state.resources.wood).toBe(4);
    expect(state.attention).toBe(10);
    expect(state.burntWood).toBe(0);
    state = teachWord(state, 'O_05');
    expect(state.attention).toBe(0);
    expect(state.words.O_05.retention).toBe(50);
    expect(state.words.O_05.custodians).toHaveLength(2);
    expect(
      state.units.some((unit) => unit.id !== state.units[0].id && unit.knows.includes('O_05')),
    ).toBe(true);
    state = dismissCampfire(state);
    const before = structuredClone(state);
    expect(prepareCampfireCouncil(state)).toEqual(before);
  });

  it('rejects stoking without active fire, sufficient wood, attention headroom or Guided mode', () => {
    const state = createGame(6842, 'guided');
    state.campfirePending = true;
    state.resources.wood = 6;
    expect(prepareCampfireCouncil(state)).toBe(state);
    const fire = addBuilding(state, 'campfire');
    fire.active = false;
    expect(prepareCampfireCouncil(state)).toBe(state);
    fire.active = true;
    state.resources.wood = 1;
    expect(prepareCampfireCouncil(state)).toBe(state);
    state.resources.wood = 6;
    state.attention = 100;
    expect(prepareCampfireCouncil(state)).toBe(state);
    state.attention = 0;
    state.playMode = 'classic';
    expect(prepareCampfireCouncil(state)).toBe(state);
  });

  it('reduces only ordinary natural loss in Guided while keeping danger and dogmatic consequences', () => {
    const guided = createGame(6842, 'guided');
    const classic = createGame(6842, 'classic');
    killUnit(guided, guided.units[0], 'oldAge');
    killUnit(classic, classic.units[0], 'oldAge');
    expect(guided.cohesion).toBe(95);
    expect(classic.cohesion).toBe(82);
    const danger = createGame(6842, 'guided');
    killUnit(danger, danger.units[0], 'ENV_COLD');
    expect(danger.cohesion).toBe(82);
    expect(guided.stats.deaths).toBe(1);
  });

  it('reinforces sustained real deliveries, caps group credit and preserves Classic command accounting', () => {
    for (const mode of ['guided', 'classic'] as const) {
      let state = createGame(6842, mode);
      Object.assign(state, { started: true, time: 10, tier: 1 });
      for (const unit of state.units) Object.assign(unit, { x: 250, y: 250, hunger: 0, temp: 100 });
      for (const id of ['V_04', 'O_03', 'O_01'])
        state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
      const tree = state.entities.find((entity) => entity.kind === 'tree')!;
      Object.assign(tree, { x: 252, y: 250, amount: 100 });
      state = issueCommand(state, ['S_01', 'V_04', 'O_03'], {
        type: 'entity',
        id: tree.id,
        x: tree.x,
        y: tree.y,
      });
      const spoken = state.words.O_03.uses;
      state = tick(state, 5);
      expect(state.resources.wood).toBeGreaterThan(0);
      expect(state.words.O_03.uses).toBe(spoken + (mode === 'guided' ? 1 : 0));
      state = tick(state, 12);
      expect(state.words.O_03.uses).toBeLessThanOrEqual(spoken + (mode === 'guided' ? 2 : 0));
      expect(state.words.O_03.uses).toBeGreaterThanOrEqual(spoken + (mode === 'guided' ? 1 : 0));
    }
  });

  it.each(['S_02', 'C_02', 'M_03'])(
    'does not lock authority when %s is understood last',
    (last) => {
      let state = createGame(6842, 'guided');
      const unit = state.units.find((entry) => entry.intelligence >= 7)!;
      for (const id of ['S_02', 'C_02', 'M_03'].filter((id) => id !== last))
        state.words[id] = { retention: 100, custodians: [unit.id], uses: 0 };
      state.sparks.push({
        id: 'last-prerequisite',
        wordId: last,
        unitId: unit.id,
        expiresAt: 45,
        recipe: WORDS[last].recipe,
        hint: '',
        eventLabel: '',
      });
      state = solveSpark(state, 'last-prerequisite', WORDS[last].recipe);
      evaluateDiscoveries(state, state.units.find((entry) => entry.id === unit.id)!);
      expect(state.sparks.some((spark) => spark.wordId === 'S_07')).toBe(true);
      expect(state.kingId).toBeNull();
    },
  );

  it('permits a paid Guided rehearsal only when no new pupil can learn, without inventing custodians or RNG draws', () => {
    let state = createGame(6842, 'guided');
    addBuilding(state, 'campfire');
    state.campfirePending = true;
    state.attention = 20;
    state.words.O_05 = { retention: 30, custodians: [state.units[0].id], uses: 0 };
    expect(rehearseWord(state, 'O_05')).toBe(state);
    state.words.O_05.custodians = state.units.map((unit) => unit.id);
    const seed = state.seed;
    const custodians = [...state.words.O_05.custodians];
    const taught = state.stats.taught;
    state = rehearseWord(state, 'O_05');
    expect(state.words.O_05.retention).toBe(50);
    expect(state.words.O_05.custodians).toEqual(custodians);
    expect(state.attention).toBe(10);
    expect(state.seed).toBe(seed);
    expect(state.stats.taught).toBe(taught);
    state.playMode = 'classic';
    expect(rehearseWord(state, 'O_05')).toBe(state);
    state.playMode = 'guided';
    state.campfirePending = false;
    expect(rehearseWord(state, 'O_05')).toBe(state);
  });

  it('lets a real completed Guided funeral name a shared ritual without requiring an artificial predator wound', () => {
    for (const mode of ['guided', 'classic'] as const) {
      const state = createGame(6842, mode);
      state.time = 90;
      // This funeral fixture closes an ordinary 90-second legacy shift.
      delete state.openingBalanceVersion;
      delete state.openingCouncilsCompleted;
      state.units = state.units.slice(0, 1);
      const witness = state.units[0];
      Object.assign(witness, { ...state.home, age: 8, intelligence: 9 });
      for (const id of ['O_06', 'O_01'])
        state.words[id] = { retention: 100, custodians: [witness.id], uses: 0 };
      const grave = addBuilding(state, 'grave');
      Object.assign(grave, {
        workerIds: [witness.id],
        seasonWork: { 0: { efficiencySeconds: 60, workerSeconds: { [witness.id]: 60 } } },
      });
      state.resources.stone = 2;
      state.entities = [
        { id: 'actual-remains', kind: 'corpse', ...state.home, hp: 0, maxHp: 1, amount: 1 },
      ];
      seasonalCore(state);
      expect(state.entities[0].amount).toBe(0);
      evaluateDiscoveries(state, witness);
      const spark = state.sparks.find((entry) => entry.wordId === 'M_03');
      if (mode === 'guided') expect(spark?.recipe).toEqual(['O_06', 'O_01']);
      else expect(spark).toBeUndefined();
      expect(state.words.M_01).toBeUndefined();
    }
  });

  it('reopens an explicitly targeted Guided pen with actual feed once and produces only future work', () => {
    for (const mode of ['guided', 'classic'] as const) {
      let state = createGame(6842, mode);
      Object.assign(state, { started: true, tier: 2, time: 365 });
      // Bucket4 and the preserved paid reopening belong to the legacy clock.
      delete state.openingBalanceVersion;
      delete state.openingCouncilsCompleted;
      for (const id of ['V_10', 'O_04', 'O_01'])
        state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
      const pen = addBuilding(state, 'pen');
      Object.assign(pen, { active: false, livestock: 1, workerIds: [] });
      state.resources.food = 4;
      const target = { type: 'building' as const, id: pen.id, ...state.home };
      const order = ['S_01', 'V_10', 'O_04', 'O_01'];
      const refused = issueCommand(state, order, target);
      expect(refused.resources.food).toBe(4);
      expect(refused.voice).toBe(mode === 'guided' ? state.voice : state.voice - 1);
      expect(refused.buildings[0].active).toBe(false);
      state.resources.food = 5;
      state = issueCommand(state, order, target);
      expect(state.buildings[0].active).toBe(mode === 'guided');
      expect(state.resources.food).toBe(mode === 'guided' ? 0 : 5);
      expect(state.resources.meat).toBe(0);
      if (mode === 'guided') {
        expect(state.buildings[0].workerIds).toHaveLength(2);
        state = issueCommand(state, order, target);
        expect(state.resources.food).toBe(0);
        state = tick(state, 5);
        expect(state.resources.meat).toBe(0);
        expect(state.buildings[0].seasonWork?.[4]?.efficiencySeconds).toBeGreaterThan(0);
      }
    }
  });
});
