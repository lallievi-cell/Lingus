import type { MemoryEvent } from './types';
export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
/** GDD: last 60 seconds, lambda=.05/s; later unit table defines Ie=Intelligence/5. */
export function cognitiveTension(
  events: Pick<MemoryEvent, 'time' | 'weight'>[],
  intelligence: number,
  now: number,
): number {
  return events.reduce(
    (sum, event) =>
      event.time <= now && now - event.time <= 60
        ? sum + event.weight * (intelligence / 5) * Math.exp(-0.05 * (now - event.time))
        : sum,
    0,
  );
}
/** Investment is normalized: one normalized unit is 10 actual Attention points. */
export function retentionDelta(
  uses: number,
  normalizedInvestment: number,
  complexity: number,
  sigma = 0,
  gamma = 3,
): number {
  return 1.5 * uses + 10 * normalizedInvestment - gamma * complexity * (1 - sigma);
}
export function attentionPoints(
  woodBurnt: number,
  elders: number,
  averageHunger: number,
  maximum = 100,
): number {
  return clamp(woodBurnt * 5 + elders * 10 - averageHunger, 0, maximum);
}
export function bodyTemperatureDelta(ambient: number, fire = 0, clothes = 0): number {
  return (ambient - 50) * 0.1 + fire + clothes;
}
export function birthProbability(
  population: number,
  housing: number,
  hutBonus = 0,
  additionalBonus = 0,
): number {
  return housing <= 0
    ? 0
    : clamp(0.25 * (1 + hutBonus) * (1 - population / housing) + additionalBonus, 0, 1);
}
export function senileDeathProbability(ageSeasons: number): number {
  return clamp((ageSeasons - 14) * 0.12, 0, 1);
}
export function effectiveDamage(
  weaponDamage: number,
  strength: number,
  morale = 1,
  armor = 0,
  wallCover = 0,
): number {
  return Math.max(1, (weaponDamage + strength / 2) * morale * (1 - armor) * (1 - wallCover));
}
export function mutualIntelligibility(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(a),
    right = new Set(b),
    union = new Set([...left, ...right]);
  return union.size ? ([...left].filter((id) => right.has(id)).length / union.size) * 100 : 100;
}
export function corruptionRate(sectorDistance: number, tribunal = false, machine = false): number {
  return Math.min(
    0.8,
    Math.max(0, sectorDistance) * 0.15 * (1 - 0.5 * Number(tribunal)) * (1 - 0.3 * Number(machine)),
  );
}
export function buildingEfficiency(activeWorkers: number, maxWorkers: number): number {
  return maxWorkers === 0 ? 1 : clamp(activeWorkers / maxWorkers, 0, 1);
}
export function dogmaWeight(seasons: number): number {
  return 10 * Math.pow(1.08, seasons);
}
export function faunaGrowth(population: number, rate: number, capacity = 20): number {
  return rate * population * (1 - population / capacity);
}
export function resourceSpoilage(
  baseRate: number,
  summer = false,
  storagePit = false,
  pottery = false,
): number {
  return clamp(baseRate * (summer ? 1.5 : 1) * (storagePit ? 0.8 : 1) * (pottery ? 0.5 : 1), 0, 1);
}
export function custodianLoss(retention: number, custodiansBeforeDeath: number): number {
  return custodiansBeforeDeath <= 0 ? 0 : retention * (1 - 1 / custodiansBeforeDeath);
}
