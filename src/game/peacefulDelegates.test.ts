import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, WORD_ORDER } from './content';
import { createGame } from './engine';
import {
  cityPopulation,
  handleImperialCommand,
  playerPopulation,
  seasonalImperial,
  updateImperial,
} from './imperial';
import { validSave } from './saveValidation';

/** Prepared urban societies isolate real travel, teaching and counted births.
 * These are not a campaign from the seven-person starting community. */
function fixture() {
  const state = createGame(1);
  Object.assign(state, { started: true, paused: false, tier: 5, urbanized: true, time: 20 });
  const foreign = state.cities[0];
  Object.assign(foreign, {
    x: 270,
    y: 250,
    sectorX: 2,
    sectorY: 2,
    capital: false,
    cohorts: { workers: 4, warriors: 0, sages: 1, slaves: 0 },
    housing: 5,
    words: ['S_01', 'V_01', 'V_02', 'V_03'],
    resources: { ...emptyInventory(), food: 5000 },
  });
  const faction = state.factions.find((entry) => entry.id === foreign.factionId)!;
  faction.words = [...foreign.words];
  faction.relation = 50;
  faction.hostile = false;
  const capital = {
    ...structuredClone(foreign),
    id: 'capital',
    name: 'La Capitale',
    x: 250,
    factionId: 'player',
    capital: true,
    cohorts: { workers: 2, warriors: 0, sages: 5, slaves: 0 },
    housing: 7,
    words: [...WORD_ORDER],
    resources: { ...emptyInventory(), food: 5000, coin: 1000 },
  };
  state.cities = [capital, foreign];
  state.factions = [faction];
  state.units = [];
  state.entities = [];
  state.buildings = [];
  state.caravans = [];
  state.resources = capital.resources;
  state.home = { x: capital.x, y: capital.y };
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [id, { retention: 100, custodians: [], uses: 0 }]),
  );
  return { state, capital, foreign, faction };
}
const delegate = (scene: ReturnType<typeof fixture>) =>
  handleImperialCommand(scene.state, ['S_04', 'V_04', 'O_09', 'S_09'], {
    type: 'city',
    id: scene.foreign.id,
    x: scene.foreign.x,
    y: scene.foreign.y,
  });
function travel(state: ReturnType<typeof fixture>['state'], seconds: number) {
  for (let i = 0; i < seconds * 4; i++) {
    state.time += 0.25;
    updateImperial(state, 0.25);
  }
}
function season(state: ReturnType<typeof fixture>['state']) {
  state.time = (Math.floor(state.time / 90) + 1) * 90;
  state.seasonIndex = Math.floor(state.time / 90);
  seasonalImperial(state);
}

describe('peaceful cultural delegations', () => {
  it('requires welcoming diplomacy and a real sage, then transfers one person only after actual travel', () => {
    const scene = fixture();
    scene.faction.relation = 29;
    expect(delegate(scene).valid).toBe(false);
    expect(scene.capital.cohorts.sages).toBe(5);
    scene.faction.relation = 50;
    scene.faction.hostile = true;
    expect(delegate(scene).valid).toBe(false);
    scene.faction.hostile = false;
    const total = cityPopulation(scene.capital) + cityPopulation(scene.foreign);
    const playerBefore = playerPopulation(scene.state);
    expect(delegate(scene).valid).toBe(true);
    expect(scene.capital.cohorts.sages).toBe(4);
    expect(scene.foreign.assimilation.active).toBe(false);
    expect(playerPopulation(scene.state)).toBe(playerBefore);
    expect(delegate(scene).valid).toBe(false);
    travel(scene.state, 4);
    expect(scene.state.caravans[0].arrived).toBe(true);
    expect(scene.foreign.cohorts.sages).toBe(2);
    expect(scene.foreign.assimilation).toEqual({ delegateCount: 1, active: true });
    expect(cityPopulation(scene.capital) + cityPopulation(scene.foreign)).toBe(total);
    expect(validSave(scene.state)).toBe(true);
  });

  it('returns a refused mission physically and never refunds it twice', () => {
    const scene = fixture();
    delegate(scene);
    travel(scene.state, 1);
    scene.faction.hostile = true;
    travel(scene.state, 3);
    const car = scene.state.caravans[0];
    expect(car.returning).toBe(true);
    expect(car.arrived).not.toBe(true);
    expect(scene.capital.cohorts.sages).toBe(4);
    travel(scene.state, 4);
    expect(car.arrived).toBe(true);
    expect(scene.capital.cohorts.sages).toBe(5);
    expect(scene.foreign.cohorts.sages).toBe(1);
    travel(scene.state, 4);
    expect(scene.capital.cohorts.sages).toBe(5);
  });

  it.each(['source', 'host'] as const)(
    'returns physically when the %s bans writing during travel',
    (side) => {
      const scene = fixture();
      expect(delegate(scene).valid).toBe(true);
      travel(scene.state, 1);
      const taboo = {
        id: 'new-writing-taboo',
        targetId: 'O_09',
        vectorId: 'M_01',
        age: 0,
        weight: 10,
        name: 'Tabù della scrittura',
        description: 'La scrittura diventa pericolosa.',
      };
      if (side === 'source') scene.state.dogmas.push(taboo);
      else scene.foreign.dogmas.push(taboo);
      travel(scene.state, 3);
      const caravan = scene.state.caravans[0];
      expect(caravan.returning).toBe(true);
      expect(caravan.arrived).not.toBe(true);
      expect(scene.foreign.assimilation.active).toBe(false);
      expect(scene.capital.cohorts.sages).toBe(4);
      travel(scene.state, 4);
      expect(caravan.arrived).toBe(true);
      expect(scene.capital.cohorts.sages).toBe(5);
      expect(scene.foreign.cohorts.sages).toBe(1);
    },
  );

  it('teaches two currently known words per season, pauses during hostility and never changes foreign dogmas', () => {
    const scene = fixture();
    delegate(scene);
    travel(scene.state, 4);
    const dogma = {
      id: 'host-belief',
      targetId: 'V_03',
      vectorId: 'M_01',
      age: 0,
      weight: 10,
      name: 'Un credo ospite',
      description: 'Fixture',
    };
    scene.foreign.dogmas = [dogma];
    scene.faction.dogmas = [structuredClone(dogma)];
    const before = scene.foreign.words.length;
    season(scene.state);
    expect(scene.foreign.words.length).toBe(before + 2);
    expect(scene.foreign.dogmas).toEqual([dogma]);
    expect(scene.faction.dogmas).toEqual([dogma]);
    scene.faction.hostile = true;
    const paused = [...scene.foreign.words];
    season(scene.state);
    expect(scene.foreign.words).toEqual(paused);
    scene.faction.hostile = false;
    scene.faction.relation = 50;
    scene.state.words.O_02.retention = 0;
    season(scene.state);
    expect(scene.foreign.words).not.toContain('O_02');
    expect(scene.foreign.words.length).toBe(paused.length + 2);
  });

  it('can reach the real cultural condition through a staffed archive and peaceful lessons, without conquest', () => {
    const scene = fixture();
    delegate(scene);
    travel(scene.state, 4);
    scene.state.buildings = [
      {
        id: 'real-archive',
        kind: 'archive',
        cityId: scene.capital.id,
        x: scene.capital.x,
        y: scene.capital.y,
        hp: BUILDING_SPECS.archive.maxHp,
        active: true,
        completed: true,
        lastEfficiency: 1,
      },
    ];
    for (let i = 0; i < 16 && !scene.state.victory; i++) season(scene.state);
    expect(scene.foreign.factionId).toBe(scene.faction.id);
    expect(scene.state.stats.conquests ?? 0).toBe(0);
    expect(scene.faction.words.length).toBeGreaterThanOrEqual(36);
    expect(scene.state.victory).toBe('cultural');
  });
});

describe('real urban births retain future people', () => {
  function parents(playMode: 'guided' | 'classic' = 'classic') {
    const scene = fixture();
    const original = createGame(1).units;
    scene.state.playMode = playMode;
    scene.state.factions = [];
    scene.state.cities = [scene.capital];
    scene.state.units = original.slice(0, 2).map((unit) => ({
      ...unit,
      cityId: scene.capital.id,
      x: scene.capital.x,
      y: scene.capital.y,
      age: 6,
      hunger: 0,
    }));
    scene.capital.cohorts = { workers: 2, warriors: 0, sages: 0, slaves: 0 };
    scene.capital.housing = 100;
    scene.state.time = 90;
    scene.state.seed = 1;
    scene.state.words = Object.fromEntries(
      WORD_ORDER.map((id) => [
        id,
        { retention: 100, custodians: scene.state.units.map((unit) => unit.id), uses: 0 },
      ]),
    );
    return scene;
  }
  it('creates a genuine newborn from a counted cohort birth, with real parents and no extra birth RNG draws', () => {
    const scene = parents();
    const before = cityPopulation(scene.capital);
    seasonalImperial(scene.state);
    const babies = scene.state.units.filter((unit) => unit.age === 0);
    expect(babies).toHaveLength(1);
    expect(babies[0].parentIds).toEqual(['unit-0', 'unit-1']);
    expect(babies[0].knows).toEqual(['S_01', 'V_01', 'V_02', 'V_03']);
    expect(cityPopulation(scene.capital)).toBe(before + 1);
    expect(playerPopulation(scene.state)).toBe(before + 1);
    expect(scene.state.stats.births).toBe(1);
    expect(scene.state.seed).toBe((Math.imul(1, 1664525) + 1013904223) >>> 0);
    expect(validSave(scene.state)).toBe(true);
  });
  it('applies earned Guided milestones to player city birth rolls while Classic keeps the literal chance', () => {
    const classic = parents(),
      guided = parents('guided');
    for (const scene of [classic, guided]) {
      scene.capital.housing = 4;
      Object.assign(scene.state.resources, { seed: 10, stone: 50, wood: 50 });
      scene.state.buildings = ['farm', 'house'].map((kind) => ({
        id: kind,
        kind: kind as 'farm' | 'house',
        x: scene.capital.x,
        y: scene.capital.y,
        cityId: scene.capital.id,
        active: true,
        completed: true,
        hp: BUILDING_SPECS[kind as 'farm' | 'house'].maxHp,
      }));
      seasonalImperial(scene.state);
    }
    expect(classic.state.stats.births).toBe(0);
    expect(guided.state.stats.births).toBe(1);
  });
  it('bounds living identities while keeping all actual additional births in their cohort', () => {
    const scene = parents();
    const template = scene.state.units[0];
    scene.state.units = Array.from({ length: 200 }, (_, index) => ({
      ...structuredClone(template),
      id: `named-${index}`,
      name: `Persona ${index}`,
      sex: index % 2 ? ('F' as const) : ('M' as const),
    }));
    scene.capital.cohorts.workers = 500;
    scene.capital.housing = 1000;
    scene.state.resources.food = 100000;
    seasonalImperial(scene.state);
    expect(scene.state.stats.births).toBeGreaterThan(0);
    expect(scene.state.units).toHaveLength(200);
    expect(cityPopulation(scene.capital)).toBe(500 + scene.state.stats.births);
  });
});
