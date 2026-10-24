import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import {
  continuousAnimationTime,
  createAnimationClock,
  createMapMotionSession,
  observeUnitMotion,
  readUnitDisplay,
} from './mapMotion';

describe('observed map motion', () => {
  it('walks for real idle wandering, rather than for an unfinished movement action', () => {
    const unit = createGame(6842).units[0],
      session = createMapMotionSession();
    unit.action = 'moving';
    expect(observeUnitMotion(session, unit, 0, 0).moving).toBe(false);
    expect(observeUnitMotion(session, { ...unit }, 0.25, 0.35).moving).toBe(false);
    const walking = { ...unit, action: 'idle', x: unit.x - 0.5 };
    const pose = observeUnitMotion(session, walking, 0.5, 0.625);
    expect(pose.moving).toBe(true);
    expect(pose.facing).toBe(-1);
    expect(pose.displayX).toBeCloseTo(unit.x - 0.25);
    expect(readUnitDisplay(session, unit.id)?.x).toBeCloseTo(pose.displayX);
  });

  it('arrives and starts stationary work without continuing to walk at the node', () => {
    const unit = createGame(6842).units[0],
      session = createMapMotionSession();
    unit.action = 'gathering';
    observeUnitMotion(session, unit, 0, 0);
    const arrived = { ...unit, x: unit.x + 1, progress: 0.1 };
    expect(observeUnitMotion(session, arrived, 0.25, 0.4).moving).toBe(true);
    const working = { ...arrived, progress: 0.35 };
    expect(observeUnitMotion(session, working, 0.5, 0.6).moving).toBe(false);
    expect(working).toEqual({ ...arrived, progress: 0.35 });
  });

  it('snaps to and freezes the exact paused snapshot, and resets history on rewind', () => {
    const unit = createGame(6842).units[0],
      session = createMapMotionSession();
    observeUnitMotion(session, unit, 10, 10);
    const moved = { ...unit, x: unit.x + 1 };
    observeUnitMotion(session, moved, 10.25, 10.35);
    const paused = observeUnitMotion(session, moved, 10.25, 10.25, true);
    expect(paused).toMatchObject({ moving: false, displayX: moved.x, displayY: moved.y });
    expect(observeUnitMotion(session, moved, 10.25, 10.25, true)).toEqual(paused);
    const restored = { ...unit, x: 100, y: 100 };
    expect(observeUnitMotion(session, restored, 2, 2)).toMatchObject({
      moving: false,
      displayX: 100,
      displayY: 100,
    });
  });

  it('treats imports and instantaneous repositioning as snapshots, not a map-spanning walk', () => {
    const unit = createGame(6842).units[0],
      session = createMapMotionSession();
    observeUnitMotion(session, unit, 1, 1);
    const imported = { ...unit, x: 10, y: 20 };
    expect(observeUnitMotion(session, imported, 1, 1)).toMatchObject({
      moving: false,
      displayX: 10,
      displayY: 20,
    });
  });
});

describe('map animation clock', () => {
  it('advances across wall-clock second boundaries without restarting its phase', () => {
    const clock = createAnimationClock();
    expect(continuousAnimationTime(clock, 20, 990, false)).toBe(20);
    expect(continuousAnimationTime(clock, 20, 1030, false)).toBeCloseTo(20.04);
    expect(continuousAnimationTime(clock, 20, 1100, false)).toBeCloseTo(20.11);
    expect(continuousAnimationTime(clock, 20, 1500, false)).toBeCloseTo(20.25);
  });

  it('freezes in pause and resumes at the selected simulation speed', () => {
    const clock = createAnimationClock();
    continuousAnimationTime(clock, 4, 0, false, 4);
    expect(continuousAnimationTime(clock, 4, 100, false, 4)).toBeCloseTo(4.4);
    expect(continuousAnimationTime(clock, 4, 150, true, 4)).toBe(4);
    expect(continuousAnimationTime(clock, 4, 9000, true, 4)).toBe(4);
    expect(continuousAnimationTime(clock, 4, 9100, false, 4)).toBe(4);
    expect(continuousAnimationTime(clock, 4, 9200, false, 4)).toBeCloseTo(4.4);
  });
});
