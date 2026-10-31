import { activeUnits, distance, hasBuilding, hasWord, isPlayerBuilding } from './runtime';
import { effectiveElapsed } from './calendar';
import { LEARNING_AGE_LIMIT, WORDS } from './content';
import type { GameState } from './types';

/** Product calibration for Guided; the document's Classic equations are unchanged. */
export const GUIDED_PROGRESSION = {
  fertilityPerMilestone: 1.5,
  teachingMultiplier: 2,
  naturalDeathTrauma: 5,
  councilWoodCost: 2,
  councilAttention: 10,
  productiveUseInterval: 10,
} as const;

export function guidedGrowthMilestones(state: GameState, cityId?: string) {
  const buildings = state.buildings.filter(
    (building) =>
      isPlayerBuilding(state, building) &&
      (cityId === undefined ? !building.cityId : building.cityId === cityId) &&
      building.hp > 0 &&
      building.active &&
      building.completed !== false,
  );
  return {
    cooking: hasWord(state, 'V_07'),
    agriculture: buildings.some(
      (building) =>
        building.kind === 'farm' || (building.kind === 'pen' && (building.livestock ?? 0) > 0),
    ),
    housing: buildings.some((building) => building.kind === 'house'),
  };
}

export function guidedBirthMultiplier(state: GameState, cityId?: string) {
  if (state.playMode !== 'guided') return 1;
  const count = Object.values(guidedGrowthMilestones(state, cityId)).filter(Boolean).length;
  return GUIDED_PROGRESSION.fertilityPerMilestone ** count;
}

/** Sustained Guided jobs reinforce spoken concepts only after actual work.
 * A global per-word interval prevents a large group multiplying the same tick. */
export function recordGuidedWorkUse(state: GameState, tokens: readonly string[]) {
  if (state.playMode !== 'guided') return;
  for (const id of new Set(tokens)) {
    const memory = state.words[id];
    const key = `guidedWorkUse:${id}`;
    if (
      !memory ||
      memory.retention <= 0 ||
      (state.eventTimes[key] !== undefined &&
        effectiveElapsed(state, state.eventTimes[key], state.time) <
          GUIDED_PROGRESSION.productiveUseInterval)
    )
      continue;
    memory.uses++;
    state.eventTimes[key] = state.time;
  }
}

/** A paid oral rehearsal is available only after every eligible pupil knows it. */
export function canRehearseWord(state: GameState, id: string) {
  const memory = state.words[id];
  const people = activeUnits(state);
  return !!(
    state.playMode === 'guided' &&
    state.campfirePending &&
    !state.gameOver &&
    !state.victory &&
    WORDS[id]?.tier > 0 &&
    memory &&
    memory.retention > 0 &&
    memory.retention < 100 &&
    state.attention >= 10 &&
    hasBuilding(state, 'campfire') &&
    !people.some(
      (unit) =>
        unit.age < LEARNING_AGE_LIMIT &&
        unit.caste !== 'slave' &&
        !memory.custodians.includes(unit.id),
    ) &&
    people.some(
      (unit) =>
        unit.caste !== 'slave' &&
        memory.custodians.includes(unit.id) &&
        distance(unit, state.home) <= 15,
    )
  );
}
