import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, WORDS } from './content';
import { createInitialState } from './state';
import {
  dogmaDiplomaticPenalty,
  dogmaTargetPresent,
  getDogmaConflict,
  getDogmaEffects,
  getDogmaPolicy,
  inscribeDogma,
  onDogmaticUse,
  sanctuaryProtected,
  updateDogmas,
} from './dogmas';
import { DOGMA_POLICY_MATRIX } from './dogmaPolicy';
import type { Building, Dogma, GameState } from './types';

function world() {
  const s = createInitialState(6842);
  for (const id of Object.keys(WORDS))
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
  s.buildings.push({ id: 'menhir', kind: 'menhir', ...s.home, hp: 500, active: true });
  return s;
}
function doctrine(s: GameState, targetId: string, vectorId: string) {
  const d: Dogma = {
    id: `d-${s.dogmas.length}`,
    targetId,
    vectorId,
    name: 'Dottrina',
    description: 'Caso di prova',
    age: 0,
    weight: 10,
  };
  s.dogmas.push(d);
  return d;
}

describe('resolved closed-world dogma policy', () => {
  it('gives every one of the208target/family cells an explicit, unique disposition', () => {
    expect(DOGMA_POLICY_MATRIX).toHaveLength(208);
    expect(new Set(DOGMA_POLICY_MATRIX.map((c) => `${c.targetId}:${c.family}`)).size).toBe(208);
    expect(DOGMA_POLICY_MATRIX.some((c) => !c.allowed)).toBe(true);
    expect(DOGMA_POLICY_MATRIX.every((c) => c.allowed || c.reason.length > 0)).toBe(true);
    expect(getDogmaPolicy('UNKNOWN', 'M_01')?.allowed).toBe(false);
    expect(getDogmaPolicy('O_02', 'UNKNOWN')).toBeNull();
  });
  it('rejects sacrifices of abstract laws without changing resources, trauma or cohesion', () => {
    const s = world();
    s.cohesion = 40;
    s.recentTrauma = { tag: 'trauma', time: 0 };
    s.resources.stone = 25;
    const n = inscribeDogma(s, 'O_14', 'O_05');
    expect(n.dogmas).toHaveLength(0);
    expect(n.resources).toEqual(s.resources);
    expect(n.cohesion).toBe(40);
    expect(n.recentTrauma).toEqual(s.recentTrauma);
    expect(n.logs[0].text).toContain('quantità materiale');
  });
  it('does not pretend an abstract activity is a physical invulnerable node', () => {
    const n = inscribeDogma(world(), 'V_11', 'V_05');
    expect(n.dogmas).toHaveLength(0);
    expect(n.logs[0].text).toContain('nodo naturale');
  });
  it('requires abolition before reversing an existing prohibition', () => {
    const s = world();
    doctrine(s, 'O_02', 'M_01');
    s.cohesion = 30;
    s.recentTrauma = { tag: 'trauma', time: 0 };
    const n = inscribeDogma(s, 'O_02', 'C_02');
    expect(n.dogmas).toEqual(s.dogmas);
    expect(n.cohesion).toBe(30);
    expect(n.recentTrauma).toEqual(s.recentTrauma);
    expect(n.logs[0].text).toContain('contraddice');
  });
  it('does not emancipate slaves by accepting a doctrine incompatible with sacred slavery', () => {
    const s = world();
    s.units[0].caste = 'slave';
    doctrine(s, 'S_06', 'C_02');
    const n = inscribeDogma(s, 'M_05', 'C_02');
    expect(n.units[0].caste).toBe('slave');
    expect(n.emancipated).toBe(false);
    expect(n.dogmas).toHaveLength(1);
  });
  it('does not permit two rival royal succession policies or private and collective ownership', () => {
    expect(
      getDogmaConflict([{ targetId: 'S_03', vectorId: 'S_07' }], 'S_04', 'S_07'),
    ).not.toBeNull();
    expect(
      getDogmaConflict([{ targetId: 'O_02', vectorId: 'M_04' }], 'O_02', 'S_01'),
    ).not.toBeNull();
    expect(getDogmaConflict([{ targetId: 'O_02', vectorId: 'S_04' }], 'O_02', 'C_02')).toBeNull();
  });
  it('applies the diplomatic penalty once, symmetrically, even with multiple opposing pairs', () => {
    const left = [
      { targetId: 'S_06', vectorId: 'C_02' },
      { targetId: 'V_03', vectorId: 'M_01' },
    ];
    const right = [
      { targetId: 'M_05', vectorId: 'C_02' },
      { targetId: 'V_03', vectorId: 'O_06' },
    ];
    expect(dogmaDiplomaticPenalty(left, right)).toBe(-50);
    expect(dogmaDiplomaticPenalty(right, left)).toBe(-50);
    expect(dogmaDiplomaticPenalty(left, left)).toBe(0);
    expect(dogmaDiplomaticPenalty([], right)).toBe(0);
  });
});

describe('concrete effects instead of abstract no-ops', () => {
  it('recognizes a living foreign visitor inside the border without mistaking citizens for foreigners', () => {
    const s = world();
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
    const visitor = {
      ...structuredClone(s.units[0]),
      id: 'visitor',
      factionId: s.factions[0].id,
      x: s.home.x + 35,
      y: s.home.y,
    };
    s.units.push(visitor);
    expect(dogmaTargetPresent(s, 'S_05')).toBe(true);
    visitor.x += 0.01;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
    visitor.x = s.home.x;
    visitor.hp = 0;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
  });
  it('requires an owned active palace to recognize visitors beyond35metres', () => {
    const s = world();
    s.units.push({
      ...structuredClone(s.units[0]),
      id: 'visitor',
      factionId: s.factions[0].id,
      x: s.home.x + 80,
      y: s.home.y,
    });
    const palace: Building = {
      id: 'palace',
      kind: 'palace' as const,
      ...s.home,
      hp: 1200,
      active: true,
      cityId: s.cities[0].id,
    };
    s.buildings.push(palace);
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
    delete palace.cityId;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(true);
    palace.active = false;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
  });
  it('counts physical foreign caravans and ends their presence when they leave or arrive', () => {
    const s = world();
    s.caravans.push({
      id: 'visitor-route',
      kind: 'trade',
      ...s.home,
      factionId: s.factions[0].id,
      fromCityId: s.cities[0].id,
      resources: structuredClone(s.resources),
      population: 0,
      hp: 100,
      target: { type: 'point', ...s.home },
    });
    expect(dogmaTargetPresent(s, 'S_05')).toBe(true);
    s.caravans[0].arrived = true;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
    s.caravans[0].arrived = false;
    s.caravans[0].x += 36;
    expect(dogmaTargetPresent(s, 'S_05')).toBe(false);
  });
  it('applies a caste monopoly to a real urban workforce selector without inventing a person', () => {
    const s = world();
    doctrine(s, 'O_05', 'S_04');
    expect(
      getDogmaEffects(s, { tokens: ['S_09', 'V_12', 'O_07', 'O_05'], subjectId: 'S_04' })
        .production,
    ).toBe(1.3);
    expect(
      getDogmaEffects(s, { tokens: ['S_09', 'V_12', 'O_07', 'O_05'], subjectId: 'S_03' })
        .production,
    ).toBe(1);
  });
  it('recognizes a condensed sage cohort after its original individual representatives died', () => {
    const s = world();
    s.urbanized = true;
    s.units.forEach((u) => (u.hp = 0));
    s.cities[0].factionId = 'player';
    s.cities[0].cohorts = { workers: 0, warriors: 0, sages: 2, slaves: 0 };
    expect(dogmaTargetPresent(s, 'S_04')).toBe(true);
    expect(dogmaTargetPresent(s, 'S_03')).toBe(false);
  });
  it('compensates a wood taboo on stone work, never on unrelated food work', () => {
    const s = world();
    doctrine(s, 'O_03', 'M_01');
    expect(getDogmaEffects(s, { tokens: ['S_01', 'V_03', 'O_02'] }).production).toBe(1.25);
    expect(getDogmaEffects(s, { tokens: ['S_01', 'V_02', 'O_04'] }).production).toBe(1);
    expect(getDogmaEffects(s).production).toBe(1);
  });
  it('recognizes an opposite material from a real clicked node before its noun is in the command', () => {
    const s = world();
    doctrine(s, 'O_02', 'M_01');
    const tree = s.entities.find((e) => e.kind === 'tree')!;
    expect(
      getDogmaEffects(s, {
        tokens: ['S_01', 'V_03'],
        target: { type: 'entity', id: tree.id, x: tree.x, y: tree.y },
      }).production,
    ).toBe(1.25);
  });
  it('compensates caste renunciation only for the explicitly opposite selector', () => {
    const s = world();
    doctrine(s, 'S_03', 'M_01');
    expect(getDogmaEffects(s, { tokens: ['S_04', 'V_06', 'O_02'] }).production).toBe(1.25);
    expect(getDogmaEffects(s, { tokens: ['S_01', 'V_06', 'O_02'] }).production).toBe(1);
  });
  it('keeps the vegetarian and nomadic archetypes exact instead of stacking the generic25percent', () => {
    const s = world();
    doctrine(s, 'O_04', 'M_01');
    doctrine(s, 'V_09', 'M_01');
    const fx = getDogmaEffects(s, { tokens: ['S_01', 'V_10', 'O_04'] });
    expect(fx.herding).toBe(1.5);
    expect(fx.agriculture).toBe(0);
    expect(fx.movement).toBe(1.4);
  });
  it('compensates the dark taboo during daylight only', () => {
    const s = world();
    doctrine(s, 'C_01', 'M_01');
    expect(getDogmaEffects(s, { isNight: false }).production).toBe(1.25);
    expect(getDogmaEffects(s, { isNight: true }).production).toBe(1);
  });
  it('venerates an actual legal code rather than the mere knowledge of the word Legge', () => {
    const s = world();
    doctrine(s, 'O_14', 'C_02');
    s.cohesion = 80;
    updateDogmas(s, 60);
    expect(s.cohesion).toBe(75);
    s.laws.push({
      id: 'law',
      tokens: ['S_02', 'V_04', 'O_02', 'O_08', 'C_03', 'O_06'],
      name: 'Norma',
      subjectId: 'S_02',
      verbId: 'V_04',
      objectId: 'O_02',
      modifierId: 'O_08',
      sanctionId: 'O_06',
      prohibitive: false,
      age: 0,
    });
    updateDogmas(s, 60);
    expect(s.cohesion).toBe(75);
  });
  it('requires a real owned written artifact, not a foreign archive or a known writing token', () => {
    const s = world();
    expect(dogmaTargetPresent(s, 'O_09')).toBe(false);
    s.buildings.push({
      id: 'foreign-archive',
      kind: 'archive',
      ...s.home,
      cityId: s.cities[0].id,
      hp: 350,
      active: true,
    });
    expect(dogmaTargetPresent(s, 'O_09')).toBe(false);
    s.buildings.push({
      id: 'stele',
      kind: 'stele',
      ...s.home,
      hp: BUILDING_SPECS.stele.maxHp,
      active: true,
    });
    expect(dogmaTargetPresent(s, 'O_09')).toBe(true);
  });
  it('recognizes recent completed activity and expires it after one90second season', () => {
    const s = world();
    s.time = 500;
    expect(dogmaTargetPresent(s, 'V_03')).toBe(false);
    onDogmaticUse(s, ['S_03', 'V_03', 'O_04'], s.units[0]);
    expect(dogmaTargetPresent(s, 'V_03')).toBe(true);
    s.time = 590;
    expect(dogmaTargetPresent(s, 'V_03')).toBe(true);
    s.time = 591;
    expect(dogmaTargetPresent(s, 'V_03')).toBe(false);
  });
  it('recognizes an actual burning fire and not just its wood stock', () => {
    const s = world();
    s.resources.wood = 20;
    expect(dogmaTargetPresent(s, 'O_05')).toBe(false);
    s.buildings.push({ id: 'fire', kind: 'campfire', ...s.home, hp: 100, active: true });
    expect(dogmaTargetPresent(s, 'O_05')).toBe(true);
    s.buildings[1].active = false;
    expect(dogmaTargetPresent(s, 'O_05')).toBe(false);
  });
  it('protects the resource itself inside a sanctuary without making its artisan invulnerable', () => {
    const s = world();
    doctrine(s, 'O_03', 'O_01');
    const u = s.units[0];
    expect(sanctuaryProtected(s, 'O_03', { x: s.home.x + 35, y: s.home.y })).toBe(true);
    expect(sanctuaryProtected(s, 'O_03', { x: s.home.x + 35.01, y: s.home.y })).toBe(false);
    expect(getDogmaEffects(s, { unit: u, tokens: ['S_01', 'V_03', 'O_03'] }).protected).toBe(false);
    doctrine(s, 'S_02', 'O_01');
    expect(getDogmaEffects(s, { unit: u }).protected).toBe(true);
  });
  it('expands sanctuary only with an active owned palace', () => {
    const s = world();
    doctrine(s, 'O_02', 'O_01');
    const p = { x: s.home.x + 80, y: s.home.y };
    s.buildings.push({
      id: 'palace',
      kind: 'palace',
      ...s.home,
      hp: 800,
      active: true,
      cityId: s.cities[0].id,
    });
    expect(sanctuaryProtected(s, 'O_02', p)).toBe(false);
    delete s.buildings[1].cityId;
    expect(sanctuaryProtected(s, 'O_02', p)).toBe(true);
    s.buildings[1].active = false;
    expect(sanctuaryProtected(s, 'O_02', p)).toBe(false);
  });
});
