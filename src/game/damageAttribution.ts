import type { CombatSource, GameState, Unit } from './types';

/** Record the attacker only when the simulation actually subtracts positive damage. */
export function rememberCombatWound(
  state: GameState,
  victim: Unit,
  damage: number,
  source: Omit<CombatSource, 'time'>,
) {
  if (!Number.isFinite(damage) || damage <= 0) return;
  victim.lastDamageCause = 'V_03';
  victim.lastCombatSource = { ...source, time: state.time };
  victim.pendingCombatDamage = true;
}

/** Counterattacks settle death at the wound. Historical attackers cannot explain later deaths. */
export function lethalCombatSource(state: GameState, unit: Unit, cause: string) {
  const source = unit.lastCombatSource;
  return cause === 'V_03' && source?.time === state.time ? { ...source } : undefined;
}
