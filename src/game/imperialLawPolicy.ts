import { ADULT_AGE } from './content';
import type { Battalion, City, GameState, Law, Unit } from './types';

/** Source examples add their stated consequences to the general six-slot compiler.
 * Unlisted legal sentences keep the ordinary sanction/incentive semantics.
 */
export type LawArchetype =
  | 'debt_bondage'
  | 'draconian_theft'
  | 'conscription'
  | 'merit_manumission'
  | 'customs'
  | 'murder'
  | 'retaliation'
  | 'desertion'
  | 'political_exile'
  | 'inquisition'
  | 'smuggling'
  | 'royal_poaching'
  | 'corvee'
  | 'agrarian_reform'
  | 'vagrancy'
  | 'slave_protection'
  | 'state_education'
  | 'feudalism'
  | 'auxilia'
  | 'night_curfew'
  | 'natalism'
  | 'metal_monopoly'
  | 'tolerance'
  | 'generic';

type TokenChoice = string | readonly string[];
const ARCHETYPES: readonly [Exclude<LawArchetype, 'generic'>, readonly TokenChoice[]][] = [
  ['debt_bondage', ['S_09', 'V_04', 'O_11', ['O_07', 'O_12'], 'C_03', 'S_06']],
  ['draconian_theft', ['S_02', 'V_05', 'M_04', 'O_14', 'C_03', 'O_06']],
  ['conscription', ['S_03', 'V_01', 'S_08', 'M_01', 'C_03', 'O_06']],
  ['merit_manumission', ['S_06', 'V_08', 'O_02', 'C_02', 'C_03', 'M_05']],
  ['customs', ['S_05', 'V_11', 'O_12', 'O_10', 'C_03', 'V_03']],
  ['murder', ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06']],
  ['retaliation', ['S_02', 'V_03', 'S_02', 'M_01', 'C_03', 'V_03']],
  ['desertion', ['S_08', 'V_01', 'O_01', 'M_01', 'C_03', 'O_06']],
  ['political_exile', ['S_04', 'V_14', 'S_07', 'M_01', 'C_03', 'O_10']],
  ['inquisition', ['S_02', 'V_14', 'M_03', 'M_01', 'C_03', ['O_05', 'O_06']]],
  ['smuggling', ['S_02', 'V_11', 'S_05', 'M_01', 'C_03', 'O_11']],
  ['royal_poaching', ['S_01', 'V_03', 'O_04', 'M_01', 'C_03', 'S_06']],
  ['corvee', ['S_01', 'V_08', 'O_02', 'M_02', 'C_03', 'V_03']],
  ['agrarian_reform', ['S_09', 'V_09', 'O_04', 'C_02', 'C_03', 'M_04']],
  ['vagrancy', ['S_02', 'V_04', 'O_01', 'C_02', 'C_03', 'O_10']],
  ['slave_protection', ['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12']],
  ['state_education', ['S_01', 'V_05', 'O_09', 'M_02', 'C_03', 'O_12']],
  ['feudalism', ['S_03', 'V_13', 'O_10', 'S_05', 'C_03', 'M_04']],
  ['auxilia', ['S_05', 'V_01', 'S_08', 'C_02', 'C_03', 'M_05']],
  ['night_curfew', ['S_01', 'V_01', 'C_01', 'M_01', 'C_03', 'V_03']],
  ['natalism', ['S_01', 'V_05', 'O_01', 'M_02', 'C_03', 'O_11']],
  ['metal_monopoly', ['S_09', 'V_12', 'O_07', 'S_07', 'C_03', 'O_06']],
  ['tolerance', ['S_09', 'V_03', 'S_05', 'M_01', 'C_03', 'O_12']],
];

export function lawArchetype(law: Pick<Law, 'tokens'>): LawArchetype {
  if (law.tokens.length !== 6) return 'generic';
  for (const [kind, pattern] of ARCHETYPES) {
    if (
      pattern.every((expected, i) =>
        typeof expected === 'string'
          ? expected === law.tokens[i]
          : expected.includes(law.tokens[i]),
      )
    )
      return kind;
  }
  return 'generic';
}

/** The GDD gives three generations but no numerical length for one generation.
 * One generation here is the explicit implementation age of adulthood: four seasons.
 * Education reaches its stated +2 Intelligence / universal basic custody by season12.
 */
export const LAW_POLICY_ASSUMPTIONS = {
  educationGenerationSeasons: ADULT_AGE,
  educationGenerations: 3,
  // A quota is not numerically specified for non-fiscal duties in the GDD.
  // One completed unit per season is the minimum, never an order merely issued.
  seasonalDutyMinimumCompletedUnits: 1,
} as const;

type LegalSubject = Unit | City | Battalion;

/** A law selects its own subject; the subject chosen for an attempted order
 * cannot make unrelated castes or foreign visitors liable for that law.
 */
export function lawSubjectMatches(s: GameState, law: Pick<Law, 'subjectId'>, target: LegalSubject) {
  const own = target.factionId === undefined || target.factionId === 'player';
  if ('hp' in target && target.hp <= 0) return false;
  if ('cohorts' in target) return own && (law.subjectId === 'S_09' || law.subjectId === 'S_01');
  if ('maxHp' in target) return own && law.subjectId === 'S_08';
  switch (law.subjectId) {
    case 'S_01':
    case 'S_02':
      return own;
    case 'S_03':
      return own && target.age >= ADULT_AGE && target.strength >= 7;
    case 'S_04':
      return own && target.intelligence >= 7;
    case 'S_06':
      return own && target.caste === 'slave';
    case 'S_07':
      return own && target.id === s.kingId;
    case 'S_05': {
      const palace = s.buildings.some(
        (b) =>
          b.kind === 'palace' &&
          b.hp > 0 &&
          b.active &&
          b.completed !== false &&
          (!b.cityId || s.cities.some((c) => c.id === b.cityId && c.factionId === 'player')),
      );
      return !own && Math.hypot(target.x - s.home.x, target.y - s.home.y) <= (palace ? 100 : 35);
    }
    default:
      return false;
  }
}

const evidencePrefix = 'legal-work:';
// Completion at the boundary belongs to the season that has just ended.
const workSeason = (time: number) => Math.max(0, Math.ceil(time / 90) - 1);
const workKey = (season: number, id: string, verb: string, object: string) =>
  `${evidencePrefix}${season}:${id}:${verb}:${object}`;

/** Call only after a real completed action: an item produced, material
 * delivered, construction completed, etc. Evidence survives the sixty-second
 * cognition buffer and is bounded to three seasons in the numeric save map.
 */
export function recordLawWork(
  s: GameState,
  subjectId: string,
  tokens: string[],
  amount = 1,
  atTime = s.time,
) {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(atTime) || atTime < 0) return;
  const start = tokens[0] === 'C_01' || tokens[0] === 'C_02' ? 1 : 0;
  const verb = tokens[start + 1];
  if (!verb?.startsWith('V_')) return;
  const objects = new Set(tokens.slice(start + 2));
  // Carrying has home as its implicit destination unless a foreign recipient
  // is explicitly named. This is the same rule used by the direct compiler.
  if (verb === 'V_04' && !objects.has('S_05')) objects.add('O_01');
  const season = workSeason(atTime);
  for (const object of objects) {
    const key = workKey(season, subjectId, verb, object);
    s.eventTimes[key] = (s.eventTimes[key] ?? 0) + amount;
  }
  for (const key of Object.keys(s.eventTimes)) {
    if (
      key.startsWith(evidencePrefix) &&
      Number(key.slice(evidencePrefix.length).split(':')[0]) < season - 2
    )
      delete s.eventTimes[key];
  }
}

/** Check actual results in this season, not the subject's current command or
 * lifetime workCycles. The minimum quota is an explicit design resolution.
 */
export function seasonalDutyFulfilled(
  s: GameState,
  law: Pick<Law, 'verbId' | 'objectId'>,
  target: { id: string },
) {
  return (
    (s.eventTimes[workKey(workSeason(s.time), target.id, law.verbId, law.objectId)] ?? 0) >=
    LAW_POLICY_ASSUMPTIONS.seasonalDutyMinimumCompletedUnits
  );
}

export function cityUnderSiege(s: Pick<GameState, 'cities' | 'battalions'>, cityId?: string) {
  return s.battalions.some((b) => {
    if (b.hp <= 0 || b.factionId === 'player' || !['attacking', 'conquering'].includes(b.action))
      return false;
    const city = s.cities.find(
      (c) => c.id === b.targetId && c.factionId === 'player' && (!cityId || c.id === cityId),
    );
    return !!city && Math.hypot(b.x - city.x, b.y - city.y) <= 3;
  });
}

/** Pure, additive exception policy. Applying these numbers belongs to the actual
 * production, birth, theft, research and enactment paths, not to this classifier.
 */
export function imperialLawEffects(s: Pick<GameState, 'laws' | 'time' | 'cities' | 'battalions'>) {
  const active = new Set(s.laws.map(lawArchetype));
  const has = (kind: LawArchetype) => active.has(kind);
  const winter = Math.floor(s.time / 90) % 4 === 3;
  const curfew = has('night_curfew') && s.time % 90 >= 60 && cityUnderSiege(s);
  const educationAge = Math.max(
    0,
    ...s.laws.filter((l) => lawArchetype(l) === 'state_education').map((l) => l.age),
  );
  const educationProgress = Math.min(
    1,
    educationAge /
      (LAW_POLICY_ASSUMPTIONS.educationGenerations *
        LAW_POLICY_ASSUMPTIONS.educationGenerationSeasons),
  );
  return {
    active,
    constructionMultiplier: has('corvee') && winter ? 1.5 : 1,
    winterCorveeCohesionCost: has('corvee') && winter ? 10 : 0,
    agricultureMultiplier: has('agrarian_reform') ? 1.35 : 1,
    agrarianRevoltReliefOnFulfilment: has('agrarian_reform') ? 20 : 0,
    slaveMortalityMultiplier: has('slave_protection') ? 0.5 : 1,
    slaveProtectionRevoltReliefOnEnact: has('slave_protection') ? 15 : 0,
    birthMultiplier: has('natalism') ? 1.25 : 1,
    tradeMultiplier: has('tolerance') ? 1.4 : 1,
    foodConsumptionMultiplier: has('vagrancy') ? 0.85 : 1,
    recruitmentSpeedMultiplier: has('conscription') ? 2 : 1,
    auxiliaryRecruitmentPoolMultiplier: has('auxilia') ? 2 : 1,
    fightToDeath: has('conscription'),
    theftMultiplier: has('draconian_theft') || curfew ? 0 : 1,
    inquisition: has('inquisition'),
    reformMultiplier: has('inquisition') ? 0 : 1,
    inquisitionCohesionMultiplierOnEnact: has('inquisition') ? 1.25 : 1,
    rebelsWeaponDamageCap: has('metal_monopoly') ? 5 : Infinity,
    customsRate: has('customs') ? 0.2 : 0,
    educationProgress,
    educationIntelligenceBonus: educationProgress * 2,
  };
}
