import { issueCommand } from './engine';
import { SEASON_TEMPERATURES } from './content';
import { getSeason } from './simulation';
import { distance, isPlayerBuilding } from './runtime';
import { thermalConditionsAt } from './thermal';
import { allAdultsAnchor, selectableTribeAdults } from './tribeSelection';
import type { GameState, Target } from './types';

export {
  ALL_ADULTS_ANCHOR_ID,
  allAdultsAnchor,
  isAllAdultsAnchor,
  selectableTribeAdults,
} from './tribeSelection';

/** Select the best existing protection close to the camp, with no imaginary
 * shelter, teleport, new heat or new knowledge. Positions remain ordinary V01. */
export function tribeRecallDestination(state: GameState): Target {
  const people = selectableTribeAdults(state);
  const phase = getSeason(state);
  const ambient = state.disasters.blizzard
    ? -10
    : SEASON_TEMPERATURES[phase.index][phase.isNight ? 'night' : 'day'];
  const candidates: { x: number; y: number }[] = [{ ...state.home }];
  const nearby = state.buildings.filter(
    (building) =>
      isPlayerBuilding(state, building) &&
      building.hp > 0 &&
      building.active &&
      building.completed !== false &&
      distance(building, state.home) <= 30 &&
      ['campfire', 'hut', 'house'].includes(building.kind),
  );
  for (const building of nearby) candidates.push({ x: building.x, y: building.y });
  // Narrow overlaps between a home and a fire are real usable shelter too.
  for (const home of nearby.filter((b) => b.kind !== 'campfire'))
    for (const fire of nearby.filter((b) => b.kind === 'campfire')) {
      const length = distance(home, fire);
      if (length <= 0 || length >= 25) continue;
      const low = Math.max(0, length - 14.9),
        high = Math.min(9.9, length);
      if (low > high) continue;
      const along = (low + high) / 2 / length;
      candidates.push({
        x: home.x + (fire.x - home.x) * along,
        y: home.y + (fire.y - home.y) * along,
      });
    }
  const benefit = (point: { x: number; y: number }) =>
    people.length
      ? Math.min(
          ...people.map((person) => thermalConditionsAt(state, person, point, ambient).delta),
        )
      : 0;
  candidates.sort(
    (left, right) =>
      benefit(right) - benefit(left) || distance(left, state.home) - distance(right, state.home),
  );
  return { type: 'point', ...candidates[0] };
}

/** One real spoken movement order. Calling this does not bypass the language,
 * law, Voice, cargo or physical travel rules. Children remain autonomous. */
export function recallTribe(state: GameState): GameState {
  if (
    !state.started ||
    state.gameOver ||
    state.victory ||
    state.campfirePending ||
    !selectableTribeAdults(state).length
  )
    return state;
  return issueCommand(
    state,
    ['S_01', 'V_01'],
    tribeRecallDestination(state),
    undefined,
    allAdultsAnchor(state),
  );
}
