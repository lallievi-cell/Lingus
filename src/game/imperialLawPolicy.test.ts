import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import {
  imperialLawEffects,
  lawArchetype,
  lawSubjectMatches,
  recordLawWork,
  seasonalDutyFulfilled,
} from './imperialLawPolicy';
import { parseGame, serializeGame } from './engine';
import type { Battalion, Law } from './types';

function law(tokens: string[], age = 0): Law {
  return {
    id: tokens.join('-'),
    tokens,
    name: 'law',
    subjectId: tokens[0],
    verbId: tokens[1],
    objectId: tokens[2],
    modifierId: tokens[3],
    sanctionId: tokens[5],
    prohibitive: tokens[3] === 'M_01',
    age,
  };
}
const sentences = {
  corvee: ['S_01', 'V_08', 'O_02', 'M_02', 'C_03', 'V_03'],
  agrarian: ['S_09', 'V_09', 'O_04', 'C_02', 'C_03', 'M_04'],
  education: ['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12'],
  protection: ['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12'],
  natalism: ['S_01', 'V_05', 'O_01', 'M_02', 'C_03', 'O_11'],
  tolerance: ['S_09', 'V_03', 'S_05', 'M_01', 'C_03', 'O_12'],
  curfew: ['S_01', 'V_01', 'C_01', 'M_01', 'C_03', 'V_03'],
  draconian: ['S_02', 'V_05', 'M_04', 'O_14', 'C_03', 'O_06'],
  conscription: ['S_03', 'V_01', 'S_08', 'M_01', 'C_03', 'O_06'],
  auxilia: ['S_05', 'V_01', 'S_08', 'C_02', 'C_03', 'M_05'],
};

describe('explicit legal examples supplementing the generic compiler', () => {
  it('preserves ordinary legal combinations instead of mistaking every death sentence for conscription', () => {
    expect(lawArchetype(law(['S_03', 'V_01', 'O_01', 'M_01', 'C_03', 'O_06']))).toBe('generic');
    expect(lawArchetype(law(sentences.conscription))).toBe('conscription');
    expect(lawArchetype(law(['S_02', 'V_14', 'M_03', 'M_01', 'C_03', 'O_05']))).toBe('inquisition');
    expect(lawArchetype(law(['S_02', 'V_14', 'M_03', 'M_01', 'C_03', 'O_06']))).toBe('inquisition');
  });
  it('uses Corvée during winter and preserves the original thirtypercent private concession as a different rule', () => {
    const s = createInitialState();
    s.laws = [law(sentences.corvee), law(sentences.agrarian)];
    expect(imperialLawEffects(s).constructionMultiplier).toBe(1);
    s.time = 270;
    expect(imperialLawEffects(s).constructionMultiplier).toBe(1.5);
    expect(imperialLawEffects(s).winterCorveeCohesionCost).toBe(10);
    expect(imperialLawEffects(s).agricultureMultiplier).toBe(1.35);
    s.time = 360;
    expect(imperialLawEffects(s).constructionMultiplier).toBe(1);
  });
  it('keeps distinct demographic, servile and commercial multipliers independent', () => {
    const s = createInitialState();
    s.laws = [law(sentences.natalism), law(sentences.protection), law(sentences.tolerance)];
    const effects = imperialLawEffects(s);
    expect(effects.birthMultiplier).toBe(1.25);
    expect(effects.slaveMortalityMultiplier).toBe(0.5);
    expect(effects.slaveProtectionRevoltReliefOnEnact).toBe(15);
    expect(effects.tradeMultiplier).toBe(1.4);
    s.laws = [];
    expect(imperialLawEffects(s).birthMultiplier).toBe(1);
  });
  it('distinguishes faster conscription from the doubled auxiliary recruitment pool', () => {
    const s = createInitialState();
    s.laws = [law(sentences.conscription), law(sentences.auxilia)];
    const effects = imperialLawEffects(s);
    expect(effects.recruitmentSpeedMultiplier).toBe(2);
    expect(effects.auxiliaryRecruitmentPoolMultiplier).toBe(2);
    expect(effects.fightToDeath).toBe(true);
  });
  it('recognizes the stated draconian exception even though its fourth token is Law rather than Danger', () => {
    const s = createInitialState();
    s.laws = [law(sentences.draconian)];
    expect(s.laws[0].prohibitive).toBe(false);
    expect(imperialLawEffects(s).theftMultiplier).toBe(0);
  });
  it('blocks curfew theft only at night while a hostile battalion has physically reached an owned city', () => {
    const s = createInitialState();
    s.cities[0].factionId = 'player';
    const c = s.cities[0];
    s.laws = [law(sentences.curfew)];
    s.time = 60;
    const army: Battalion = {
      id: 'siege',
      name: 'siege',
      x: c.x + 20,
      y: c.y,
      cityId: 'foreign',
      factionId: 'enemy',
      hp: 2000,
      maxHp: 2000,
      morale: 1,
      action: 'conquering',
      targetId: c.id,
      catapult: false,
      occupation: 0,
    };
    s.battalions = [army];
    expect(imperialLawEffects(s).theftMultiplier).toBe(1);
    army.x = c.x;
    expect(imperialLawEffects(s).theftMultiplier).toBe(0);
    s.time = 90;
    expect(imperialLawEffects(s).theftMultiplier).toBe(1);
    s.time = 150;
    s.laws = [];
    expect(imperialLawEffects(s).theftMultiplier).toBe(1);
  });
  it('reaches the stated twoIntelligence bonus by three declared generations without stacking duplicate institutions', () => {
    const s = createInitialState();
    s.laws = [law(sentences.education, 6)];
    expect(imperialLawEffects(s).educationProgress).toBe(0.5);
    expect(imperialLawEffects(s).educationIntelligenceBonus).toBe(1);
    s.laws[0].age = 12;
    s.laws.push({ ...s.laws[0], id: 'duplicate' });
    expect(imperialLawEffects(s).educationIntelligenceBonus).toBe(2);
    s.laws[0].age = 90;
    expect(imperialLawEffects(s).educationIntelligenceBonus).toBe(2);
  });
});

describe('actual legal subjects and completed seasonal duties', () => {
  it('does not treat a citizen as a slave or a strong person as a sage', () => {
    const s = createInitialState(),
      korg = s.units[0],
      uma = s.units[5];
    expect(lawSubjectMatches(s, { subjectId: 'S_06' }, korg)).toBe(false);
    expect(lawSubjectMatches(s, { subjectId: 'S_03' }, korg)).toBe(true);
    expect(lawSubjectMatches(s, { subjectId: 'S_04' }, korg)).toBe(false);
    expect(lawSubjectMatches(s, { subjectId: 'S_04' }, uma)).toBe(true);
    korg.caste = 'slave';
    expect(lawSubjectMatches(s, { subjectId: 'S_06' }, korg)).toBe(true);
  });
  it('selects only adult strong people and the unique current king', () => {
    const s = createInitialState(),
      ilo = s.units[6];
    ilo.strength = 9;
    expect(lawSubjectMatches(s, { subjectId: 'S_03' }, ilo)).toBe(false);
    s.kingId = s.units[0].id;
    expect(lawSubjectMatches(s, { subjectId: 'S_07' }, s.units[0])).toBe(true);
    expect(lawSubjectMatches(s, { subjectId: 'S_07' }, s.units[1])).toBe(false);
  });
  it('subjects peaceful foreigners to foreign laws only inside the actual owned boundary', () => {
    const s = createInitialState(),
      foreign = {
        ...s.units[0],
        id: 'foreign',
        factionId: s.factions[0].id,
        x: s.home.x + 50,
        y: s.home.y,
      };
    expect(lawSubjectMatches(s, { subjectId: 'S_01' }, foreign)).toBe(false);
    expect(lawSubjectMatches(s, { subjectId: 'S_05' }, foreign)).toBe(false);
    const city = s.cities[0];
    s.buildings.push({
      id: 'foreign-palace',
      kind: 'palace',
      cityId: city.id,
      x: city.x,
      y: city.y,
      hp: 100,
      active: true,
    });
    expect(lawSubjectMatches(s, { subjectId: 'S_05' }, foreign)).toBe(false);
    s.buildings.push({ id: 'own-palace', kind: 'palace', ...s.home, hp: 100, active: true });
    expect(lawSubjectMatches(s, { subjectId: 'S_05' }, foreign)).toBe(true);
    s.buildings[1].active = false;
    expect(lawSubjectMatches(s, { subjectId: 'S_05' }, foreign)).toBe(false);
  });
  it('does not apply individual laws to an entire urban population or city laws to an individual', () => {
    const s = createInitialState(),
      city = s.cities[0];
    city.factionId = 'player';
    expect(lawSubjectMatches(s, { subjectId: 'S_09' }, city)).toBe(true);
    expect(lawSubjectMatches(s, { subjectId: 'S_01' }, city)).toBe(true);
    expect(lawSubjectMatches(s, { subjectId: 'S_02' }, city)).toBe(false);
    expect(lawSubjectMatches(s, { subjectId: 'S_09' }, s.units[0])).toBe(false);
  });
  it('requires a completed matching action and does not credit lifetime cycles or a pending command', () => {
    const s = createInitialState(),
      u = s.units[0],
      duty = law(sentences.corvee);
    u.workCycles = 1000;
    u.command = ['S_01', 'V_08', 'O_02', 'M_02'];
    s.time = 45;
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    recordLawWork(s, u.id, ['S_01', 'V_04', 'O_02'], 5);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    recordLawWork(s, u.id, ['S_01', 'V_08', 'O_03', 'M_02']);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    recordLawWork(s, u.id, u.command);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
    expect(seasonalDutyFulfilled(s, duty, s.units[1])).toBe(false);
  });
  it('retains early-season results through the full ninety seconds but never into a second duty season', () => {
    const s = createInitialState(),
      u = s.units[0],
      duty = law(sentences.corvee);
    s.time = 2;
    recordLawWork(s, u.id, ['S_01', 'V_08', 'O_02', 'M_02']);
    s.time = 90;
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
    s.time = 180;
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
    s.time = 180;
    recordLawWork(s, u.id, ['C_02', 'S_06', 'V_08', 'O_02']);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
    s.time = 180.25;
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
  });
  it('recognizes a completed implicit home delivery without granting credit for a gift abroad', () => {
    const s = createInitialState(),
      u = s.units[0],
      duty = law(['S_02', 'V_04', 'O_01', 'C_02', 'C_03', 'O_10']);
    recordLawWork(s, u.id, ['S_02', 'V_04', 'O_03']);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
    s.time = 91;
    recordLawWork(s, u.id, ['S_02', 'V_04', 'S_05', 'M_04']);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(false);
  });
  it('keeps evidence in valid restored saves and bounds the evidence history', () => {
    const s = createInitialState(),
      u = s.units[0],
      duty = law(sentences.corvee);
    s.time = 30;
    recordLawWork(s, u.id, ['S_01', 'V_08', 'O_02']);
    const restored = parseGame(serializeGame(s));
    expect(restored).not.toBeNull();
    expect(seasonalDutyFulfilled(restored!, duty, u)).toBe(true);
    s.time = 361;
    recordLawWork(s, u.id, ['S_01', 'V_08', 'O_02']);
    expect(Object.keys(s.eventTimes).some((k) => k.startsWith('legal-work:0:'))).toBe(false);
    expect(seasonalDutyFulfilled(s, duty, u)).toBe(true);
  });
});
