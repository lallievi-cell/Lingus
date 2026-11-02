import type { GameState } from '../game/types';

export const PLAYTEST_EVENT_LIMIT = 500;
export type PlaytestAction =
  | 'command-attempt'
  | 'command-accepted'
  | 'help-opened'
  | 'word-details-opened'
  | 'lesson-plan';
export type PlaytestEventKind =
  | PlaytestAction
  | 'birth'
  | 'death'
  | 'discovery'
  | 'teaching'
  | 'first-fire-observed'
  | 'victory'
  | 'game-over';
export interface PlaytestEvent {
  kind: PlaytestEventKind;
  simulationSeconds: number;
  count: number;
}
export interface PlaytestSummary {
  recording: boolean;
  mode: 'guided' | 'classic';
  resumedStory: boolean;
  startedAtSimulationSeconds: number;
  endedAtSimulationSeconds: number;
  activeRealSeconds: number;
  pausedRealSeconds: number;
  observedSimulationSeconds: number;
  fireAlreadyPresentAtStart: boolean;
  lessonsAlreadyCompletedAtStart: number;
  totals: Partial<Record<PlaytestEventKind, number>>;
  events: PlaytestEvent[];
  omittedEvents: number;
}
interface Observation {
  now: number;
  time: number;
  paused: boolean;
  visible: boolean;
  births: number;
  deaths: number;
  discoveries: number;
  taught: number;
  fire: boolean;
  victory: boolean;
  gameOver: boolean;
}
export interface PlaytestRecord {
  summary: PlaytestSummary;
  previous: Observation;
  hasObservedFire: boolean;
}

function observation(game: GameState, now: number, paused: boolean, visible: boolean): Observation {
  return {
    now,
    time: game.time,
    paused,
    visible,
    births: game.stats.births,
    deaths: game.stats.deaths,
    discoveries: game.stats.discoveries,
    taught: game.stats.taught,
    fire: game.buildings.some(
      (building) =>
        building.kind === 'campfire' &&
        building.active &&
        building.hp > 0 &&
        building.completed !== false,
    ),
    victory: !!game.victory,
    gameOver: !!game.gameOver,
  };
}

/** A voluntary, in-memory observation. No names, positions, seed, or saved world are copied. */
export function createPlaytestRecord(
  game: GameState,
  now: number,
  paused: boolean,
  visible = true,
): PlaytestRecord {
  const previous = observation(game, now, paused, visible);
  return {
    previous,
    hasObservedFire: previous.fire,
    summary: {
      recording: true,
      mode: game.playMode ?? 'classic',
      resumedStory: game.time > 0,
      startedAtSimulationSeconds: game.time,
      endedAtSimulationSeconds: game.time,
      activeRealSeconds: 0,
      pausedRealSeconds: 0,
      observedSimulationSeconds: 0,
      fireAlreadyPresentAtStart: previous.fire,
      lessonsAlreadyCompletedAtStart: game.stats.taught,
      totals: {},
      events: [],
      omittedEvents: 0,
    },
  };
}

function append(
  summary: PlaytestSummary,
  kind: PlaytestEventKind,
  time: number,
  count = 1,
): PlaytestSummary {
  const event = { kind, simulationSeconds: time, count };
  const full = summary.events.length >= PLAYTEST_EVENT_LIMIT;
  return {
    ...summary,
    totals: { ...summary.totals, [kind]: (summary.totals[kind] ?? 0) + count },
    events: full ? summary.events : [...summary.events, event],
    omittedEvents: summary.omittedEvents + (full ? 1 : 0),
  };
}

/** Hidden intervals are excluded, and their changes become the next baseline rather than a backlog. */
export function observePlaytest(
  record: PlaytestRecord,
  game: GameState,
  now: number,
  paused: boolean,
  visible = true,
): PlaytestRecord {
  if (!record.summary.recording) return record;
  const previous = record.previous;
  const current = observation(game, now, paused, visible);
  const elapsed = previous.visible ? Math.max(0, now - previous.now) / 1000 : 0;
  let summary: PlaytestSummary = {
    ...record.summary,
    endedAtSimulationSeconds: current.time,
    activeRealSeconds: record.summary.activeRealSeconds + (previous.paused ? 0 : elapsed),
    pausedRealSeconds: record.summary.pausedRealSeconds + (previous.paused ? elapsed : 0),
    observedSimulationSeconds:
      record.summary.observedSimulationSeconds +
      (previous.visible && visible ? Math.max(0, current.time - previous.time) : 0),
  };
  if (visible && previous.visible) {
    const counters = [
      ['births', 'birth'],
      ['deaths', 'death'],
      ['discoveries', 'discovery'],
      ['taught', 'teaching'],
    ] as const;
    for (const [counter, kind] of counters) {
      const count = Math.max(0, current[counter] - previous[counter]);
      if (count) summary = append(summary, kind, current.time, count);
    }
    if (current.fire && !record.hasObservedFire)
      summary = append(summary, 'first-fire-observed', current.time);
    if (current.victory && !previous.victory) summary = append(summary, 'victory', current.time);
    if (current.gameOver && !previous.gameOver)
      summary = append(summary, 'game-over', current.time);
  }
  return { summary, previous: current, hasObservedFire: record.hasObservedFire || current.fire };
}

export function recordPlaytestAction(
  record: PlaytestRecord,
  kind: PlaytestAction,
  time: number,
): PlaytestRecord {
  if (!record.summary.recording || !record.previous.visible) return record;
  return { ...record, summary: append(record.summary, kind, time) };
}

export function stopPlaytestRecord(record: PlaytestRecord): PlaytestRecord {
  return { ...record, summary: { ...record.summary, recording: false } };
}

export function exportPlaytestReport(
  record: PlaytestRecord,
  build: { version: string; commit: string },
): string {
  return JSON.stringify(
    {
      schema: 1,
      build,
      observation: record.summary,
      note: 'Resoconto locale volontario. I tempi indicano osservazioni, non il momento esatto degli eventi. Nessun dato viene inviato automaticamente.',
    },
    null,
    2,
  );
}
