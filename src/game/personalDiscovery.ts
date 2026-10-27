import { activeUnits, hasWord } from './runtime';
import type { GameState, Unit } from './types';

export const PERSONAL_DISCOVERY = {
  craftContribution: 35,
  mealContribution: 100,
} as const;
export type PersonalExperience = 'craft' | 'meal';

/** Io can emerge from real individual initiative while others have different needs.
 * The group may still have issued the original job; the personal result is real. */
export function personalExperienceEligible(
  state: GameState,
  unit: Unit,
  experience: PersonalExperience,
) {
  if (
    state.playMode !== 'guided' ||
    state.urbanized ||
    hasWord(state, 'S_02') ||
    unit.hp <= 0 ||
    unit.caste === 'slave' ||
    (unit.factionId && unit.factionId !== 'player')
  )
    return false;
  if (experience === 'craft') return unit.action === 'crafting' && !!unit.command?.includes('V_06');
  if (unit.command) return false;
  return activeUnits(state).some(
    (other) => other.id !== unit.id && other.hunger < 60 && other.action !== 'eating',
  );
}

export function getPersonalDiscoveryProgress(state: GameState) {
  if (state.playMode !== 'guided' || state.urbanized || hasWord(state, 'S_02')) return null;
  const spark = state.sparks.find((entry) => entry.wordId === 'S_02');
  const contribution = Math.max(0, ...activeUnits(state).map((unit) => unit.tension?.S_02 ?? 0));
  return {
    ready: !!spark,
    sparkId: spark?.id,
    started: contribution > 0,
    hint: spark
      ? 'Un compagno ha vissuto qualcosa di personale: apri la sua Scintilla di Io.'
      : contribution > 0
        ? 'Un compagno riconosce il proprio lavoro. Altri manufatti possono completare l’intuizione di Io.'
        : 'Un compagno può mangiare di propria iniziativa mentre gli altri non hanno fame: questa esperienza fa riconoscere Io. Anche completare personalmente manufatti fa nascere l’intuizione.',
  };
}
