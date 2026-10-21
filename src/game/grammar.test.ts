import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, WORDS } from './content';
import { createInitialState } from './state';
import { cognitiveSlots, compileSentence, getPredicate, resolveConstruction } from './grammar';
import {
  forbiddenByDogma,
  getDogmaEffects,
  getDogmaVectors,
  handleDogmaticDeath,
  inscribeDogma,
  memorySupport,
  onDogmaticUse,
  previewDogma,
  protectedByDogma,
  removeDogma,
  resourcePreservationFloor,
  SACRED_TARGETS,
  updateDogmas,
  updateDogmasSeason,
  vectorFamily,
} from './dogmas';
import type { BuildingKind, Dogma, GameState, Target, Tier } from './types';

function world(tier: Tier = 5): GameState {
  const s = createInitialState();
  s.started = true;
  s.tier = tier;
  for (const id of Object.keys(WORDS)) {
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
    if (!s.units[0].knows.includes(id)) s.units[0].knows.push(id);
  }
  for (const kind of ['campfire', 'menhir', 'palace', 'school'] as BuildingKind[])
    s.buildings.push({
      id: `fixture-${kind}`,
      kind,
      x: s.home.x,
      y: s.home.y,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      workerIds: [],
    });
  return s;
}
function dogma(s: GameState, targetId: string, vectorId: string): Dogma {
  const d: Dogma = {
    id: `dogma-${targetId}-${vectorId}`,
    targetId,
    vectorId,
    age: 0,
    weight: 10,
    vector: vectorFamily(vectorId),
    ...previewDogma(targetId, vectorId),
  };
  s.dogmas.push(d);
  return d;
}
const point: Target = { type: 'point', x: 250, y: 250 };

describe('final GDD syntax, inherited lower-tier patterns, and the six-slot ceiling', () => {
  it.each([0, 1, 2, 3, 4, 5] as Tier[])('tier %i retains basic subject-verb orders', (tier) => {
    const s = world(tier);
    expect(compileSentence(s, ['S_01', 'V_01'], point).valid).toBe(true);
    expect(cognitiveSlots(s)).toBe([2, 3, 4, 5, 6, 6][tier]);
  });
  it('locks only the final syntax slot during cognitive regression', () => {
    const s = world(5);
    s.lockedSlot = true;
    expect(cognitiveSlots(s)).toBe(5);
    expect(compileSentence(s, ['S_09', 'V_04', 'O_11', 'O_07', 'C_03', 'S_06']).valid).toBe(false);
  });
  it('supports implicit home delivery with three slots as the final patch requires', () => {
    const s = world(1);
    const c = compileSentence(s, ['S_01', 'V_04', 'O_02']);
    expect(c.valid).toBe(true);
    expect(c.requiresTarget).toBe(false);
  });
  it('supports a night prefix with three slots', () => {
    const s = world(1);
    s.time = 65;
    expect(compileSentence(s, ['C_01', 'S_01', 'V_01'], point).valid).toBe(true);
  });
  it('requires an actual edible target for an implicit eating order', () => {
    expect(compileSentence(world(), ['S_01', 'V_02'], point).valid).toBe(false);
  });
  it('recognizes the final emancipation sentence, an explicit exception with no verb', () => {
    expect(compileSentence(world(), ['C_02', 'S_01', 'M_05']).valid).toBe(true);
  });
  it('rejects invented semantic combinations instead of accepting any nouns after a verb', () => {
    const s = world();
    expect(compileSentence(s, ['S_01', 'V_02', 'O_03']).valid).toBe(false);
    expect(compileSentence(s, ['S_01', 'V_12', 'O_02']).valid).toBe(false);
  });
  const sentences = [
    ['S_01', 'V_01', 'O_01', 'M_01'],
    ['S_01', 'V_01', 'O_10'],
    ['S_01', 'V_01', 'S_05'],
    ['S_01', 'V_02', 'O_04', 'M_04'],
    ['S_01', 'V_02', 'O_06'],
    ['S_01', 'V_03', 'O_04', 'M_01'],
    ['S_01', 'V_03', 'O_02'],
    ['S_01', 'V_03', 'O_03'],
    ['S_01', 'V_03', 'S_05', 'V_05'],
    ['S_01', 'V_03', 'S_06'],
    ['S_01', 'V_04', 'O_04', 'O_01'],
    ['S_01', 'V_04', 'O_05', 'O_01'],
    ['S_01', 'V_04', 'O_06', 'O_10'],
    ['S_01', 'V_04', 'O_11', 'S_07'],
    ['S_01', 'V_04', 'O_11', 'S_05'],
    ['S_04', 'V_04', 'O_09', 'S_09'],
    ['S_01', 'V_05', 'O_04', 'M_02'],
    ['S_01', 'V_05', 'O_02'],
    ['S_01', 'V_05', 'O_03'],
    ['S_01', 'V_05', 'O_07'],
    ['S_01', 'V_05', 'O_05'],
    ['S_04', 'V_05', 'O_09'],
    ['S_01', 'V_05', 'O_12'],
    ['S_01', 'V_06', 'O_02'],
    ['S_01', 'V_06', 'O_02', 'O_03'],
    ['S_01', 'V_06', 'O_02', 'M_03'],
    ['S_01', 'V_06', 'O_02', 'O_09'],
    ['S_01', 'V_07', 'O_04', 'O_05'],
    ['S_01', 'V_07', 'O_02', 'O_05'],
    ['S_01', 'V_08', 'O_03', 'O_01'],
    ['S_01', 'V_08', 'O_03', 'M_01'],
    ['S_01', 'V_08', 'O_02', 'O_01'],
    ['S_01', 'V_08', 'O_02', 'O_06'],
    ['S_01', 'V_08', 'O_02', 'M_03'],
    ['S_01', 'V_08', 'O_02', 'O_10'],
    ['S_01', 'V_08', 'O_02', 'O_09'],
    ['S_01', 'V_08', 'O_02', 'S_07'],
    ['S_01', 'V_08', 'O_12', 'V_11'],
    ['S_01', 'V_08', 'O_02', 'O_14'],
    ['S_01', 'V_08', 'O_02', 'S_04'],
    ['S_01', 'V_08', 'O_13', 'O_01'],
    ['S_01', 'V_08', 'O_13', 'S_08'],
    ['S_01', 'V_09', 'O_04', 'O_01'],
    ['S_01', 'V_09', 'O_03'],
    ['S_01', 'V_10', 'O_04', 'O_01'],
    ['S_01', 'V_10', 'O_04', 'M_01'],
    ['S_01', 'V_11', 'O_02', 'S_05'],
    ['S_01', 'V_11', 'O_12', 'S_05'],
    ['S_01', 'V_11', 'O_12', 'S_06'],
    ['S_01', 'V_12', 'O_07', 'O_05'],
    ['S_01', 'V_12', 'O_07', 'V_03'],
    ['S_01', 'V_12', 'O_07', 'O_08'],
    ['S_08', 'V_13', 'S_09', 'S_05'],
    ['S_08', 'V_13', 'O_10', 'M_02'],
    ['S_04', 'V_14', 'M_03', 'O_05'],
    ['S_04', 'V_14', 'S_07', 'M_05'],
    ['C_02', 'S_03', 'V_03', 'O_04', 'M_02'],
    ['C_01', 'S_03', 'V_05', 'O_01'],
    ['C_02', 'S_09', 'V_09', 'O_04'],
    ['C_02', 'S_09', 'V_12', 'O_07'],
    ['C_02', 'S_09', 'V_11', 'O_12'],
    ['C_02', 'S_09', 'V_05', 'O_09'],
  ];
  it.each(sentences.map((tokens) => ({ tokens })))(
    'accepts the GDD predicate $tokens',
    ({ tokens }) => {
      expect(compileSentence(world(), tokens, point).valid).toBe(true);
    },
  );
  const laws = [
    ['S_09', 'V_04', 'O_11', 'O_07', 'C_03', 'S_06'],
    ['S_02', 'V_05', 'M_04', 'O_14', 'C_03', 'O_06'],
    ['S_03', 'V_01', 'S_08', 'M_01', 'C_03', 'O_06'],
    ['S_06', 'V_08', 'O_02', 'C_02', 'C_03', 'M_05'],
    ['S_05', 'V_11', 'O_12', 'O_10', 'C_03', 'V_03'],
    ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06'],
    ['S_02', 'V_14', 'M_03', 'M_01', 'C_03', 'O_05'],
    ['S_01', 'V_08', 'O_02', 'M_02', 'C_03', 'V_03'],
    ['S_09', 'V_09', 'O_04', 'C_02', 'C_03', 'M_04'],
    ['S_02', 'V_04', 'O_01', 'C_02', 'C_03', 'O_10'],
    ['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12'],
    ['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12'],
    ['S_03', 'V_13', 'O_10', 'S_05', 'C_03', 'M_04'],
    ['S_05', 'V_01', 'S_08', 'C_02', 'C_03', 'M_05'],
    ['S_01', 'V_01', 'C_01', 'M_01', 'C_03', 'V_03'],
    ['S_01', 'V_05', 'O_01', 'M_02', 'C_03', 'O_11'],
    ['S_09', 'V_12', 'O_07', 'S_07', 'C_03', 'O_06'],
    ['S_09', 'V_03', 'S_05', 'M_01', 'C_03', 'O_12'],
  ];
  it.each(laws.map((tokens) => ({ tokens })))(
    'accepts the legal construct $tokens',
    ({ tokens }) => {
      expect(compileSentence(world(), tokens).valid).toBe(true);
    },
  );
  it('constructs four ordinary houses for the urban housing sentence, without inventing a new building', () => {
    expect(resolveConstruction(['S_09', 'V_08', 'O_02', 'O_01'])).toEqual({
      kind: 'house',
      cost: { stone: 80, wood: 40 },
      quantity: 4,
    });
  });
  it('keeps the catapult a mobile army addition and the workshop a distinct building', () => {
    const s = world();
    expect(resolveConstruction(['S_01', 'V_08', 'O_13', 'O_01'])?.kind).toBe('workshop');
    expect(compileSentence(s, ['S_01', 'V_08', 'O_13', 'S_08'], point).cost).toEqual({
      wood: 40,
      ingot: 20,
    });
  });
  it('extracts conditional predicates without losing either object', () => {
    expect(getPredicate(['C_02', 'S_03', 'V_03', 'O_04', 'M_02'])).toMatchObject({
      condition: 'C_02',
      subject: 'S_03',
      verb: 'V_03',
      args: ['O_04', 'M_02'],
    });
  });
});

describe('dogmatic matrix and the document’s explicit archetypes', () => {
  it('contains the exact26eligible targets and all eight effect families', () => {
    expect(SACRED_TARGETS).toHaveLength(26);
    expect(SACRED_TARGETS).not.toContain('V_01');
    const families = new Set(getDogmaVectors('O_02').map(vectorFamily));
    expect(families.size).toBe(8);
  });
  it('accepts commutative Sacro placement for ritual cannibalism', () => {
    const s = world();
    expect(compileSentence(s, ['O_06', 'M_03', 'V_02']).valid).toBe(true);
    expect(compileSentence(s, ['O_06', 'V_02', 'M_03']).valid).toBe(true);
  });
  it('prohibits animal killing without prohibiting berries under vegetarianism', () => {
    const s = world();
    dogma(s, 'O_04', 'M_01');
    const berry = s.entities.find((e) => e.kind === 'berries')!,
      deer = s.entities.find((e) => e.kind === 'deer')!;
    expect(
      forbiddenByDogma(s, ['S_01', 'V_02'], {
        type: 'entity',
        id: berry.id,
        x: berry.x,
        y: berry.y,
      }),
    ).toBeNull();
    expect(
      forbiddenByDogma(s, ['S_01', 'V_03'], { type: 'entity', id: deer.id, x: deer.x, y: deer.y }),
    ).not.toBeNull();
    expect(getDogmaEffects(s).agriculture).toBe(1.4);
  });
  it('reserves implicit cooking and smelting to the fire’s authorized caste', () => {
    const s = world();
    dogma(s, 'O_05', 'S_04');
    const sage = s.units.find((u) => u.intelligence >= 7)!,
      worker = s.units.find((u) => u.intelligence < 7)!;
    expect(forbiddenByDogma(s, ['S_01', 'V_12', 'O_07'], undefined, worker)).not.toBeNull();
    expect(forbiddenByDogma(s, ['S_04', 'V_12', 'O_07'], undefined, sage)).toBeNull();
    expect(getDogmaEffects(s, { unit: sage, tokens: ['S_04', 'V_12', 'O_07'] }).production).toBe(
      1.3,
    );
  });
  it('infers a material from the clicked node for monopoly and veneration bonuses', () => {
    const s = world();
    dogma(s, 'O_03', 'S_04');
    const u = s.units.find((u) => u.intelligence >= 7)!,
      tree = s.entities.find((e) => e.kind === 'tree')!;
    const target = { type: 'entity' as const, id: tree.id, x: tree.x, y: tree.y };
    expect(getDogmaEffects(s, { unit: u, tokens: ['S_04', 'V_03'], target }).production).toBe(1.3);
    const before = s.cohesion;
    s.cohesion = 50;
    onDogmaticUse(s, ['S_04', 'V_03'], u, target);
    expect(s.cohesion).toBe(50.5);
    s.cohesion = before;
  });
  it('protects every member of a protected caste, regardless of the caller’s selector', () => {
    const s = world();
    dogma(s, 'S_01', 'V_05');
    expect(protectedByDogma(s, 'S_02', s.units[0])).toBe(true);
    dogma(s, 'S_04', 'V_05');
    expect(getDogmaEffects(s).elderAttention).toBe(2);
  });
  it('keeps the preservation floor at20% of initialnodeamount after depletion', () => {
    const s = world();
    dogma(s, 'O_03', 'V_05');
    const tree = s.entities.find((e) => e.kind === 'tree')!;
    tree.amount = 2;
    expect(resourcePreservationFloor(s, tree)).toBe(4);
  });
  it('permits defense under pacifism but prevents initiating a war', () => {
    const s = world();
    dogma(s, 'V_03', 'M_01');
    const city = s.cities[0],
      target: Target = { type: 'city', id: city.id, x: city.x, y: city.y };
    expect(forbiddenByDogma(s, ['S_08', 'V_03', 'S_05'], target)).not.toBeNull();
    s.factions.find((f) => f.id === city.factionId)!.hostile = true;
    expect(forbiddenByDogma(s, ['S_08', 'V_03', 'S_05'], target)).toBeNull();
    expect(getDogmaEffects(s).growth).toBe(1.4);
  });
  it('gives written-memory support only with a full staffed, healthy active archive', () => {
    const s = world();
    const people = s.units.slice(0, 4);
    const archive = {
      id: 'archive',
      kind: 'archive' as const,
      x: s.home.x,
      y: s.home.y,
      hp: 350,
      active: true,
      workerIds: people.map((u) => u.id),
    };
    s.buildings.push(archive);
    for (const u of people) {
      u.x = s.home.x;
      u.y = s.home.y;
      u.jobBuildingId = archive.id;
      u.hunger = 0;
      u.temp = 100;
    }
    expect(memorySupport(s, 'O_02')).toBe(1);
    people[0].hunger = 80;
    expect(memorySupport(s, 'O_02')).toBe(0.75);
  });
  it('uses the explicitmartyr target/caste and adds exactly10cohesion15attention', () => {
    const s = world();
    dogma(s, 'S_03', 'O_06');
    const strong = s.units.find((u) => u.strength >= 7)!;
    expect(handleDogmaticDeath(s, strong, 'combat')).toMatchObject({
      handled: true,
      cohesion: 10,
      attention: 15,
    });
  });
  it('Valhalla treats senile death as five cohesion lost even after a combat order', () => {
    const s = world(),
      elder = s.units[0];
    elder.age = 45;
    elder.command = ['S_01', 'V_03', 'O_04'];
    dogma(s, 'V_03', 'O_06');
    expect(handleDogmaticDeath(s, elder, 'oldAge')).toMatchObject({
      handled: true,
      cohesion: -5,
      attention: 0,
    });
    expect(handleDogmaticDeath(s, elder, 'V_03')).toMatchObject({
      handled: true,
      cohesion: 10,
      attention: 15,
    });
  });
  it('ties sanctuary protection to being physically inside the home perimeter', () => {
    const s = world();
    dogma(s, 'S_02', 'O_01');
    const u = s.units[0];
    u.x = s.home.x;
    u.y = s.home.y;
    expect(getDogmaEffects(s, { unit: u }).protected).toBe(true);
    u.x += 110;
    expect(getDogmaEffects(s, { unit: u }).protected).toBe(false);
  });
  it('grants trauma relief once per recent trauma and never heals by inscription spam', () => {
    let s = world();
    s.cohesion = 30;
    s.recentTrauma = { tag: 'ENV_CORPSE', time: s.time };
    s = inscribeDogma(s, 'C_01', 'M_01');
    expect(s.cohesion).toBe(70);
    s = inscribeDogma(s, 'O_03', 'V_05');
    expect(s.cohesion).toBe(70);
  });
  it('calcifies at10×1.08^seasons and charges the exact weight for abolition', () => {
    let s = world();
    s.cohesion = 80;
    dogma(s, 'O_02', 'V_05');
    updateDogmasSeason(s);
    expect(s.dogmas[0].weight).toBeCloseTo(10.8);
    s = removeDogma(s, s.dogmas[0].id);
    expect(s.cohesion).toBeCloseTo(69.2);
  });
  it('reduces actual inequality by seventy percent when abolishing money', () => {
    let s = world();
    s.inequality = 80;
    s = inscribeDogma(s, 'O_12', 'M_01');
    expect(s.inequality).toBe(24);
    expect(getDogmaEffects(s).corruption).toBe(0);
  });
  it('decays absentveneration at5cohesion perminute and privatepropertyinequality at1/minute', () => {
    const s = world();
    s.cohesion = 80;
    s.resources.stone = 0;
    dogma(s, 'O_02', 'C_02');
    dogma(s, 'O_03', 'M_04');
    updateDogmas(s, 60);
    expect(s.cohesion).toBe(75);
    expect(s.inequality).toBe(1);
  });
});

describe('archetype precedence and finite physical offerings', () => {
  it('xenophobia forbids foreign trade but permits fighting an invader', () => {
    const s = world();
    dogma(s, 'S_05', 'M_01');
    expect(forbiddenByDogma(s, ['S_08', 'V_03', 'S_05'])).toBeNull();
    expect(forbiddenByDogma(s, ['S_01', 'V_11', 'O_02', 'S_05'])).not.toBeNull();
    expect(getDogmaEffects(s, { inBorders: true }).combat).toBe(1.2);
  });
  it('animism protects nature and forbids extracting machines', () => {
    const s = world();
    dogma(s, 'O_03', 'V_05');
    expect(getDogmaEffects(s).machinesForbidden).toBe(true);
    expect(forbiddenByDogma(s, ['S_01', 'V_08', 'O_13', 'O_01'])).not.toBeNull();
  });
  it('venerating nourishment recognizes berries even when no meat exists', () => {
    const s = world();
    s.resources.food = 1;
    s.resources.meat = 0;
    s.cohesion = 70;
    dogma(s, 'O_04', 'C_02');
    updateDogmas(s, 60);
    expect(s.cohesion).toBe(70);
  });
  it('offers exactlytenedibleunits across foodtypes and gives15cohesion20percentmorale', () => {
    const s = world();
    s.resources.food = 6;
    s.resources.meat = 4;
    s.cohesion = 50;
    dogma(s, 'O_04', 'O_05');
    updateDogmasSeason(s);
    expect(s.resources.food + s.resources.meat).toBe(0);
    expect(s.cohesion).toBe(65);
    expect(getDogmaEffects(s).morale).toBe(1.2);
  });
  it('does not expose undefined abstract ten-unit sacrifices as working choices', () => {
    expect(getDogmaVectors('O_09')).not.toContain('V_02');
    expect(getDogmaVectors('O_14')).not.toContain('O_05');
    expect(getDogmaVectors('O_02')).toContain('V_02');
  });
  it('cremates existingunburiedbodies with fiveactualwood perbody', () => {
    const s = world();
    s.resources.wood = 9;
    s.attention = 0;
    dogma(s, 'O_06', 'O_05');
    s.entities.push(
      { id: 'old-body-1', kind: 'corpse', x: 250, y: 250, hp: 0, maxHp: 1, amount: 1 },
      { id: 'old-body-2', kind: 'corpse', x: 251, y: 250, hp: 0, maxHp: 1, amount: 1 },
    );
    updateDogmasSeason(s);
    expect(s.resources.wood).toBe(4);
    expect(s.entities.filter((e) => e.kind === 'corpse' && e.amount > 0)).toHaveLength(1);
    expect(s.attention).toBe(5);
  });
  it('immolates exactly one represented city resident and removes the same person from the cohort and custodians', () => {
    const s = world(),
      victim = s.units[0],
      city = s.cities[0];
    city.factionId = 'player';
    city.cohorts = { workers: 10, warriors: 3, sages: 4, slaves: 0 };
    city.garrisonHp = 300;
    victim.cityId = city.id;
    victim.jobBuildingId = s.buildings[0].id;
    s.buildings[0].workerIds = [victim.id];
    s.words.O_03.custodians = [victim.id, s.units[1].id];
    s.words.O_03.retention = 80;
    s.cohesion = 50;
    s.attention = 0;
    s.revoltTension = 70;
    dogma(s, 'S_02', 'O_05');
    updateDogmasSeason(s);
    expect(s.units.filter((u) => u.hp === 0)).toHaveLength(1);
    expect(city.cohorts).toEqual({ workers: 10, warriors: 2, sages: 4, slaves: 0 });
    expect(city.garrisonHp).toBe(200);
    expect(s.words.O_03.retention).toBe(40);
    expect(s.words.O_03.custodians).toEqual([s.units[1].id]);
    expect(s.words.S_01.retention).toBe(100);
    expect(s.words.S_01.custodians).not.toContain(victim.id);
    expect(s.buildings[0].workerIds).toEqual([]);
    expect(victim.jobBuildingId).toBeUndefined();
    expect(s.stats.deaths).toBe(1);
    expect(s.cohesion).toBe(75);
    expect(s.attention).toBe(30);
    expect(s.revoltTension).toBe(0);
  });
  it('can sacrifice a physical foreigner without consuming an unrelated own citizen', () => {
    const s = world(),
      city = s.cities[0],
      foreigner = {
        ...structuredClone(s.units[0]),
        id: 'foreign-patrol',
        factionId: city.factionId,
        cityId: city.id,
        caste: 'warrior' as const,
      };
    s.units.push(foreigner);
    dogma(s, 'S_05', 'O_05');
    updateDogmasSeason(s);
    expect(foreigner.hp).toBe(0);
    expect(s.units[0].hp).toBe(100);
    expect(city.cohorts.warriors).toBe(1);
    expect(s.stats.deaths).toBe(1);
  });
  it('performs no human immolation without an active ritual fire or temple', () => {
    const s = world();
    s.buildings = s.buildings.filter((b) => b.kind !== 'campfire');
    s.cohesion = 50;
    s.attention = 0;
    dogma(s, 'S_02', 'O_05');
    updateDogmasSeason(s);
    expect(s.units.every((u) => u.hp > 0)).toBe(true);
    expect(s.cohesion).toBe(50);
    expect(s.attention).toBe(0);
    expect(s.stats.deaths).toBe(0);
  });
  it('does not immolate someone protected by the village sanctuary', () => {
    const s = world();
    dogma(s, 'S_02', 'O_01');
    dogma(s, 'S_02', 'O_05');
    updateDogmasSeason(s);
    expect(s.stats.deaths).toBe(0);
    expect(s.units.every((u) => u.hp > 0)).toBe(true);
  });
  it('charges the ordinary royal-death shock after ritual relief and clears the vacant throne', () => {
    const s = world(),
      king = s.units[0];
    s.government = 'monarchy';
    s.kingId = king.id;
    king.isKing = true;
    s.cohesion = 90;
    dogma(s, 'S_07', 'O_05');
    updateDogmasSeason(s);
    expect(king.hp).toBe(0);
    expect(s.kingId).toBeNull();
    expect(s.cohesion).toBe(50);
    expect(s.gameOver).toBeNull();
    expect(s.stats.deaths).toBe(1);
  });
  it('ends the community when a sacrificed king is the sacred Re-Dio despite the ritual relief', () => {
    const s = world(),
      king = s.units[0];
    s.government = 'monarchy';
    s.kingId = king.id;
    king.isKing = true;
    s.cohesion = 90;
    dogma(s, 'S_07', 'C_02');
    dogma(s, 'S_07', 'O_05');
    updateDogmasSeason(s);
    expect(king.hp).toBe(0);
    expect(s.kingId).toBeNull();
    expect(s.cohesion).toBe(0);
    expect(s.gameOver).toContain('Re-Dio');
    expect(s.stats.deaths).toBe(1);
  });
});
