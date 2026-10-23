import { ADULT_AGE } from './content';
import { forbiddenByDogma, getDogmaEffects, protectedByDogma } from './dogmas';
import { lawArchetype, lawSubjectMatches } from './imperialLawPolicy';
import { activeUnits, clamp, distance, hasBuilding, log, random } from './runtime';
import type { GameState, Unit } from './types';

/** The guide specifies the legal outcomes, not the rate or geometry of a quarrel.
 * These episodes reuse citizens, food and the existing HP combat model.
 */
export const CIVIL_LAW_ASSUMPTIONS = {
  inequalityThreshold: 50,
  cohesionThreshold: 30,
  hungryThreshold: 60,
  scarceFoodUnits: 1,
  radiusMetres: 3,
  episodeCooldownSeconds: 90,
  feudDelaySeconds: 30,
  basicBlowDamage: 5,
} as const;

type Kill = (s: GameState, unit: Unit, cause: string) => void;
type Assault = (s: GameState, attacker: Unit, victim: Unit) => number;
const own = (u: Unit) => u.factionId === undefined || u.factionId === 'player';
const feudPrefix = 'civil-feud:';
function decodeId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}
function protectedPerson(s: GameState, u: Unit) {
  return (
    protectedByDogma(s, u.caste === 'slave' ? 'S_06' : 'S_02', u) ||
    getDogmaEffects(s, { unit: u }).protected
  );
}
function stop(u: Unit) {
  u.command = undefined;
  u.targetId = undefined;
  u.progress = 0;
  u.tx = undefined;
  u.ty = undefined;
  u.jobBuildingId = undefined;
  if (u.hp > 0) u.action = 'idle';
}
function code(s: GameState, kind: 'murder' | 'retaliation', attacker: Unit) {
  return (
    hasBuilding(s, 'court') &&
    s.laws.some(
      (l) => l.prohibitive && lawArchetype(l) === kind && lawSubjectMatches(s, l, attacker),
    )
  );
}
function forgetFeuds(s: GameState, attackerId: string) {
  for (const key of Object.keys(s.eventTimes)) {
    if (!key.startsWith(feudPrefix)) continue;
    const [, encodedTarget] = key.slice(feudPrefix.length).split(':');
    if (decodeId(encodedTarget ?? '') === attackerId) delete s.eventTimes[key];
  }
}

/** Real damage first, justice second. Never substitute the generic40HP penalty
 * for the specific Taglione result, and never execute a murderer before a death.
 */
export function applyCivilAssault(
  s: GameState,
  attacker: Unit,
  victim: Unit,
  damage: number,
  kill: Kill,
  onDamage?: () => void,
): number {
  if (
    !own(attacker) ||
    !own(victim) ||
    attacker.id === victim.id ||
    attacker.hp <= 0 ||
    victim.hp <= 0 ||
    !Number.isFinite(damage) ||
    damage <= 0 ||
    protectedPerson(s, victim)
  )
    return 0;
  const target = { type: 'unit' as const, id: victim.id, x: victim.x, y: victim.y };
  const effect = getDogmaEffects(s, { unit: attacker, tokens: ['S_02', 'V_03', 'S_02'] });
  const aggressor =
    (victim.lastEventAt?.CIVIL_AGGRESSOR_UNTIL ?? 0) > s.time ||
    (victim.action === 'combat' && !!victim.command?.includes('V_03'));
  if (
    (effect.pacifism && !aggressor) ||
    forbiddenByDogma(s, ['S_02', 'V_03', 'S_02'], target, attacker)
  )
    return 0;
  const actual = Math.min(victim.hp, damage);
  victim.hp -= actual;
  victim.lastDamageCause = 'V_03';
  victim.pendingCombatDamage = true;
  attacker.lastEventAt ??= {};
  attacker.lastEventAt.CIVIL_AGGRESSOR_UNTIL = s.time + 30;
  s.eventTimes[`civil-last-damage:${attacker.id}`] = actual;
  s.eventTimes[`civil-last-victim:${victim.id}`] = s.time;
  onDamage?.();
  if (victim.hp <= 0) kill(s, victim, 'V_03');
  const murdered = victim.hp <= 0;
  if (murdered && code(s, 'murder', attacker)) {
    if (!protectedPerson(s, attacker)) kill(s, attacker, 'O_14');
    stop(attacker);
    forgetFeuds(s, attacker.id);
    log(
      s,
      'Il Tribunale giudica l’omicidio dopo la morte della vittima e interrompe la faida.',
      'warning',
    );
  } else if (code(s, 'retaliation', attacker)) {
    if (!protectedPerson(s, attacker)) {
      attacker.hp = Math.max(0, attacker.hp - actual);
      if (attacker.hp <= 0) kill(s, attacker, 'O_14');
    }
    s.cohesion = clamp(s.cohesion + 10);
    stop(attacker);
    forgetFeuds(s, attacker.id);
    log(
      s,
      `Il Tribunale applica il Taglione: ${actual} salute per il danno realmente inflitto. Coesione +10.`,
      'info',
    );
  } else if (murdered) {
    // Kinship is not modelled in the guide. A nearby adult witness from the
    // same community is the explicit proxy, without inventing a family system.
    const witness = activeUnits(s).find(
      (u) =>
        u.id !== attacker.id &&
        u.id !== victim.id &&
        u.age >= ADULT_AGE &&
        u.caste !== 'slave' &&
        u.cityId === victim.cityId &&
        distance(u, victim) <= CIVIL_LAW_ASSUMPTIONS.radiusMetres,
    );
    if (witness) {
      const key = `${feudPrefix}${encodeURIComponent(witness.id)}:${encodeURIComponent(attacker.id)}`;
      s.eventTimes[key] = s.time + CIVIL_LAW_ASSUMPTIONS.feudDelaySeconds;
    }
  }
  return actual;
}

/** Episodes occur only when two hungry adults physically contest the same last
 * real ration during a social crisis. Normal seed play never rolls a crime each tick.
 */
export function updateCivilConflicts(s: GameState, dt: number, assault: Assault) {
  if (dt <= 0) return;
  for (const key of Object.keys(s.eventTimes)) {
    if (!key.startsWith(feudPrefix) || s.eventTimes[key] > s.time) continue;
    delete s.eventTimes[key];
    const [witnessId, targetId] = key.slice(feudPrefix.length).split(':').map(decodeId);
    const witness = s.units.find((u) => u.id === witnessId && u.hp > 0),
      target = s.units.find((u) => u.id === targetId && u.hp > 0);
    if (
      !witness ||
      !target ||
      code(s, 'murder', target) ||
      distance(witness, target) > CIVIL_LAW_ASSUMPTIONS.radiusMetres
    )
      continue;
    assault(s, witness, target);
  }
  if (
    s.inequality < CIVIL_LAW_ASSUMPTIONS.inequalityThreshold ||
    s.cohesion > CIVIL_LAW_ASSUMPTIONS.cohesionThreshold ||
    s.time - (s.eventTimes['civil-last-episode'] ?? -Infinity) <
      CIVIL_LAW_ASSUMPTIONS.episodeCooldownSeconds
  )
    return;
  const adults = activeUnits(s).filter(
    (u) =>
      u.age >= ADULT_AGE &&
      u.caste !== 'slave' &&
      u.hunger >= CIVIL_LAW_ASSUMPTIONS.hungryThreshold &&
      !protectedPerson(s, u) &&
      !getDogmaEffects(s, { unit: u }).pacifism,
  );
  const rations = s.entities.filter(
    (e) =>
      e.amount > 0 &&
      ((e.kind === 'berries' && Math.floor(s.time / 90) % 4 !== 3) ||
        (e.kind === 'ground' && ['food', 'meat', 'cooked'].includes(e.resource ?? '')) ||
        (['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) && e.hp <= 0)),
  );
  const stores = [
    { ...s.home, inventory: s.resources },
    ...s.cities
      .filter((c) => c.factionId === 'player' && c.resources !== s.resources)
      .map((c) => ({ ...c, inventory: c.resources })),
  ];
  const places = [
    ...rations,
    ...stores.filter((p) => p.inventory.food + p.inventory.meat + p.inventory.cooked > 0),
  ];
  for (const place of places) {
    const accessible =
      rations
        .filter((e) => distance(e, place) <= CIVIL_LAW_ASSUMPTIONS.radiusMetres)
        .reduce((n, e) => n + e.amount, 0) +
      stores
        .filter((p) => distance(p, place) <= CIVIL_LAW_ASSUMPTIONS.radiusMetres)
        .reduce((n, p) => n + p.inventory.food + p.inventory.meat + p.inventory.cooked, 0);
    if (accessible > CIVIL_LAW_ASSUMPTIONS.scarceFoodUnits) continue;
    const pair = adults.filter((u) => distance(u, place) <= CIVIL_LAW_ASSUMPTIONS.radiusMetres);
    if (pair.length < 2) continue;
    const index = Math.floor(random(s) * pair.length),
      attacker = pair[index],
      victim = pair.find((u) => u.id !== attacker.id)!;
    s.eventTimes['civil-last-episode'] = s.time;
    log(s, 'Due cittadini affamati si contendono l’ultima razione.', 'warning');
    assault(s, attacker, victim);
    break;
  }
}
