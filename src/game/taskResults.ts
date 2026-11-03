import { observeTaskOutcomes, type TaskOutcomeReason } from './taskOutcomes';
import type { GameState, Target } from './types';

/** A factual stop, retained on the person until the next accepted assignment.
 * This never schedules work, grants a resource or stores an inferred idle task. */
export interface RecordedTaskResult {
  time: number;
  tokens: string[];
  reason: TaskOutcomeReason;
  target?: Target;
  suspended: boolean;
}

/** Copy only the mutable inputs used to recognize a stop in one simulation step.
 * Histories, events and other world data remain shared; no full world clone is
 * needed for each quarter-second inside a batched public tick. */
export function snapshotTaskResultInputs(state: GameState): GameState | undefined {
  const actors = state.units.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.age >= 4 &&
      (!unit.factionId || unit.factionId === 'player') &&
      unit.command?.length,
  );
  if (!actors.length) return undefined;
  return {
    ...state,
    units: actors.map((unit) => ({
      ...unit,
      command: [...unit.command!],
      lastEventAt: unit.lastEventAt ? { ...unit.lastEventAt } : undefined,
    })),
    entities: state.entities.map((entity) => ({ ...entity })),
    buildings: state.buildings.map((building) => ({ ...building })),
    resources: { ...state.resources },
    stats: { ...state.stats },
    words: Object.fromEntries(
      Object.entries(state.words).map(([id, memory]) => [id, { ...memory }]),
    ),
  };
}

/** Called after each private simulation step, before another step can recover
 * hunger, temperature or a completed job and hide its actual stopping cause. */
export function captureObservedTaskResults(previous: GameState, next: GameState): void {
  for (const outcome of observeTaskOutcomes(previous, next))
    for (const id of outcome.unitIds) {
      const unit = next.units.find((person) => person.id === id);
      if (!unit || unit.hp <= 0) continue;
      unit.lastTaskResult = {
        time: outcome.time,
        tokens: [...outcome.tokens],
        reason: outcome.reason,
        target: outcome.target ? { ...outcome.target } : undefined,
        suspended: outcome.suspended,
      };
    }
}
