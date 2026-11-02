import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import {
  createPlaytestRecord,
  exportPlaytestReport,
  observePlaytest,
  PLAYTEST_EVENT_LIMIT,
  recordPlaytestAction,
  stopPlaytestRecord,
} from './playtestRecord';

describe('voluntary local playtest observations', () => {
  it('does not reconstruct milestones or events that preceded a resumed observation', () => {
    const game = createGame(6842, 'guided');
    game.time = 450;
    game.stats.taught = 7;
    game.stats.births = 2;
    game.buildings.push({
      id: 'old-fire',
      kind: 'campfire',
      x: 250,
      y: 250,
      active: true,
      completed: true,
      hp: 100,
    });
    const before = JSON.stringify(game);
    let record = createPlaytestRecord(game, 1000, true);
    record = observePlaytest(record, game, 5000, true);
    expect(record.summary).toMatchObject({
      resumedStory: true,
      fireAlreadyPresentAtStart: true,
      lessonsAlreadyCompletedAtStart: 7,
      events: [],
      totals: {},
      pausedRealSeconds: 4,
    });
    expect(JSON.stringify(game)).toBe(before);
  });

  it('separates visible active and planning time, without counting a background interval or replaying hidden events', () => {
    const game = createGame(6842, 'guided');
    let record = createPlaytestRecord(game, 0, false);
    game.time = 5;
    record = observePlaytest(record, game, 5000, true);
    record = observePlaytest(record, game, 8000, true, false);
    game.time = 50;
    game.stats.births = 1;
    record = observePlaytest(record, game, 68000, false, true);
    game.time = 52;
    game.stats.births = 2;
    record = observePlaytest(record, game, 70000, false);
    expect(record.summary.activeRealSeconds).toBe(7);
    expect(record.summary.pausedRealSeconds).toBe(3);
    expect(record.summary.observedSimulationSeconds).toBe(7);
    expect(record.summary.totals.birth).toBe(1);
    expect(record.summary.events).toEqual([{ kind: 'birth', simulationSeconds: 52, count: 1 }]);
  });

  it('reports actual counter changes once and identifies only the first fire observed after starting', () => {
    const game = createGame(6842, 'guided');
    let record = createPlaytestRecord(game, 0, false);
    game.time = 120;
    game.stats.deaths += 1;
    game.stats.discoveries += 2;
    game.stats.taught += 3;
    game.buildings.push({
      id: 'new-fire',
      kind: 'campfire',
      x: 250,
      y: 250,
      active: true,
      hp: 100,
    });
    record = observePlaytest(record, game, 1000, false);
    record = observePlaytest(record, game, 2000, false);
    game.buildings[0].active = false;
    record = observePlaytest(record, game, 3000, false);
    game.buildings[0].active = true;
    record = observePlaytest(record, game, 4000, false);
    expect(record.summary.totals).toEqual({
      death: 1,
      discovery: 2,
      teaching: 3,
      'first-fire-observed': 1,
    });
  });

  it('retains exact aggregate action counts beyond the bounded event log and freezes after stop', () => {
    const game = createGame(6842, 'guided');
    let record = createPlaytestRecord(game, 0, false);
    for (let i = 0; i < PLAYTEST_EVENT_LIMIT + 3; i++)
      record = recordPlaytestAction(record, 'command-attempt', i);
    expect(record.summary.events).toHaveLength(PLAYTEST_EVENT_LIMIT);
    expect(record.summary.omittedEvents).toBe(3);
    expect(record.summary.totals['command-attempt']).toBe(PLAYTEST_EVENT_LIMIT + 3);
    record = stopPlaytestRecord(record);
    expect(recordPlaytestAction(record, 'help-opened', 600)).toBe(record);
    game.stats.deaths++;
    expect(observePlaytest(record, game, 5000, false)).toBe(record);
  });

  it('exports only the chosen diagnostic summary, never private world contents or internal clock state', () => {
    const game = createGame(6842, 'guided');
    game.units[0].name = 'Private-person-name';
    const record = createPlaytestRecord(game, 987654321, false);
    const report = JSON.parse(exportPlaytestReport(record, { version: '0.3.0', commit: 'abc' }));
    expect(report.schema).toBe(1);
    expect(report.build.version).toBe('0.3.0');
    expect(report.observation.events).toEqual([]);
    expect(Object.keys(report)).toEqual(['schema', 'build', 'observation', 'note']);
    const json = JSON.stringify(report);
    expect(json).not.toContain('Private-person-name');
    expect(json).not.toContain('987654321');
    expect(json).not.toContain('custodians');
    expect(json).not.toContain('previous');
    expect(json).not.toContain('seed');
  });

  it('does not log explicit interactions while hidden', () => {
    const game = createGame(6842, 'guided');
    const record = createPlaytestRecord(game, 0, false, false);
    expect(recordPlaytestAction(record, 'command-accepted', 0)).toBe(record);
  });
});
