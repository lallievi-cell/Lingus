import { getCalendar } from './calendar';
import { promoteDeferredSparks } from './discoveryPacing';
import { updateForeignPolicy } from './foreignPolicy';
import { finishWorldImperial, seasonalImperial, updateImperial } from './imperial';
import { copy, hasBuilding, hasWord, isPlayerBuilding, log } from './runtime';
import {
  finishSeasonMemory,
  finishWorldSimulationStep,
  population,
  seasonalCore,
  simulationStep,
} from './simulation';
import { captureObservedTaskResults, snapshotTaskResultInputs } from './taskResults';
import { advanceWorldTransfers } from './worldTravel';
import { globalWorldProjection, runInRegion, syncGlobalState } from './worldRuntime';
import type { GameState } from './types';

/** One clock and one transaction, regardless of the region currently observed. */
export function tickWorld(
  state: GameState,
  dt: number,
  resolveDiscoveries: (state: GameState) => unknown,
): GameState {
  const s = copy(state);
  let remaining = Math.min(60, dt) * s.speed;
  while (remaining > 1e-8 && !s.gameOver && !s.campfirePending && !s.victory) {
    const calendar = getCalendar(s);
    const d = Math.min(0.25, remaining, calendar.seasonEnd - s.time);
    const censusBefore = globalWorldProjection(s);
    const archiveBefore = censusBefore.buildings.some(
      (b) => isPlayerBuilding(censusBefore, b) && b.kind === 'archive' && b.hp > 0,
    );
    s.time += d;
    if (s.time >= calendar.seasonEnd - 1e-9) s.time = calendar.seasonEnd;
    remaining -= d;
    s.seasonIndex = getCalendar(s).seasonIndex;
    const boundary = s.seasonIndex > calendar.seasonIndex;
    s.voiceProgress += d;
    while (s.voiceProgress >= 10) {
      s.voice = Math.min(hasWord(s, 'S_07') ? 5 : 3, s.voice + 1);
      s.voiceProgress -= 10;
    }
    // Stable order makes simulation RNG independent of atlas navigation.
    for (const id of Object.keys(s.world!.regions).sort()) {
      runInRegion(s, id, (local) => {
        const before = snapshotTaskResultInputs(local);
        simulationStep(local, d, { regional: true });
        resolveDiscoveries(local);
        updateForeignPolicy(local, d);
        updateImperial(local, d, { regional: true });
        if (boundary) {
          seasonalCore(local, { regional: true, global: id === s.world!.homeRegionId });
          seasonalImperial(local, { regional: true });
        }
        if (before) captureObservedTaskResults(before, local);
      });
    }
    advanceWorldTransfers(s);
    const census = globalWorldProjection(s);
    finishWorldSimulationStep(census, d);
    finishWorldImperial(census, d, boundary);
    promoteDeferredSparks(census);
    if (boundary && !census.campfirePending) finishSeasonMemory(census);
    if (
      archiveBefore &&
      !census.buildings.some(
        (b) => isPlayerBuilding(census, b) && b.kind === 'archive' && b.hp > 0,
      )
    ) {
      for (const memory of Object.values(census.words))
        if (memory.uses === 0) memory.retention *= 0.3;
      log(
        census,
        'L’Archivio è distrutto: le parole non usate perdono il settanta per cento della memoria.',
        'danger',
      );
    }
    if (
      getCalendar(census).seasonIndex >= 4 &&
      population(census) >= 4 &&
      hasBuilding(census, 'campfire') &&
      hasBuilding(census, 'storage')
    )
      census.milestone = true;
    syncGlobalState(s, census);
  }
  return s;
}
