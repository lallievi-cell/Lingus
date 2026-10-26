import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from '../game/engine';
import { orderAcknowledged } from '../game/commandAcknowledgement';
import { killUnit } from '../game/simulation';
import type { Spark } from '../game/types';
import { GameAudioEvents, GameAudioSynth, GAME_AUDIO_VOICE_LIMIT } from './gameAudio';

const spark = (id: string): Spark => ({
  id,
  wordId: 'O_03',
  unitId: 'unit-0',
  eventLabel: 'Legno',
  expiresAt: 50,
  recipe: ['V_03', 'V_01'],
  hint: 'Esperienza reale',
});
function game() {
  const state = createGame(6842);
  state.started = true;
  state.time = 20;
  return state;
}

describe('game audio event observation', () => {
  it('acknowledges a real institution with exhausted Voice and does not replay duplicate requests', () => {
    const state = game();
    state.tier = 3;
    state.voice = 0;
    for (const id of ['C_02', 'V_04', 'O_03'])
      state.words[id] = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    const events = new GameAudioEvents();
    events.observe(state, true);
    const next = issueCommand(state, ['C_02', 'S_01', 'V_04', 'O_03']);
    expect(next.traditions).toHaveLength(1);
    expect(next.stats.commands).toBe(state.stats.commands);
    expect(next.voice).toBe(0);
    expect(orderAcknowledged(state, next)).toBe(true);
    expect(events.observe(next, true)).toEqual(['command']);
    const duplicate = issueCommand(next, ['C_02', 'S_01', 'V_04', 'O_03']);
    expect(orderAcknowledged(next, duplicate)).toBe(false);
    expect(events.observe(duplicate, true)).toEqual([]);
  });
  it('does not replay loaded history and emits each new event once even while paused', () => {
    const state = game();
    state.sparks = [spark('existing')];
    state.disasters.storm = true;
    state.tribeEvents = [{ id: 'old-birth', time: 10, kind: 'birth' }];
    const events = new GameAudioEvents();
    expect(events.observe(state, true)).toEqual([]);
    expect(events.observe(state, true)).toEqual([]);
    state.paused = true;
    state.sparks.push(spark('new-spark'));
    state.stats.commands++;
    state.tribeEvents.unshift({ id: 'new-birth', time: 20, kind: 'birth' });
    state.stats.births++;
    const before = structuredClone(state);
    expect(events.observe(state, true)).toEqual(['birth', 'spark', 'command']);
    expect(events.observe(state, true)).toEqual([]);
    expect(state).toEqual(before);
  });

  it('silences mute/hidden intervals, session replacements, rewinds and suspended-tab gaps', () => {
    const state = game();
    const events = new GameAudioEvents();
    events.observe(state, true);
    state.sparks.push(spark('hidden-spark'));
    expect(events.observe(state, false)).toEqual([]);
    state.stats.births++;
    expect(events.observe(state, true)).toEqual([]);
    state.sparks.push(spark('imported-spark'));
    expect(events.observe(state, true, 1)).toEqual([]);
    state.time = 10;
    expect(events.observe(state, true, 1)).toEqual([]);
    state.time = 50;
    state.stats.commands++;
    expect(events.observe(state, true, 1)).toEqual([]);
    expect(events.observe(state, true, 1)).toEqual([]);
    state.stats.commands++;
    expect(events.observe(state, true, 1)).toEqual(['command']);
  });

  it('uses a real last-custodian death, and coalesces a simultaneous epidemic into one grave cue', () => {
    const state = game();
    const custodian = state.units[0];
    state.words.O_03 = { retention: 100, custodians: [custodian.id], uses: 0 };
    custodian.knows.push('O_03');
    const events = new GameAudioEvents();
    events.observe(state, true);
    state.time += 0.25;
    killUnit(state, custodian, 'STAT_PLAGUE');
    state.units[1].plagueUntil = 50;
    expect(events.observe(state, true)).toEqual(['loss']);
    expect(events.observe(state, true)).toEqual([]);
    state.time += 0.25;
    killUnit(state, state.units[2], 'oldAge');
    expect(events.observe(state, true)).toEqual([]);
  });

  it('announces a new disaster or infection without repeating season-long flags or every birth in a cohort', () => {
    const state = game();
    const events = new GameAudioEvents();
    events.observe(state, true);
    state.disasters.blizzard = true;
    expect(events.observe(state, true)).toEqual(['disaster']);
    state.time++;
    expect(events.observe(state, true)).toEqual([]);
    state.units[0].plagueUntil = 50;
    expect(events.observe(state, true)).toEqual(['disaster']);
    state.stats.births += 12;
    expect(events.observe(state, true)).toEqual(['birth']);
    expect(events.observe(state, true)).toEqual([]);
  });
});

class Parameter {
  value = 0;
  calls: { kind: string; value?: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'linear', value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'exponential', value, time });
  }
  cancelScheduledValues(time: number) {
    this.calls.push({ kind: 'cancel', time });
  }
}
class FakeGain {
  gain = new Parameter();
  disconnected = 0;
  connected: unknown[] = [];
  connect(node: unknown) {
    this.connected.push(node);
  }
  disconnect() {
    this.disconnected++;
  }
}
class FakeOscillator {
  frequency = new Parameter();
  type = 'sine';
  onended: (() => void) | null = null;
  started: number[] = [];
  stopped: (number | undefined)[] = [];
  disconnected = 0;
  connect(_node: unknown) {}
  disconnect() {
    this.disconnected++;
  }
  start(time: number) {
    this.started.push(time);
  }
  stop(time?: number) {
    this.stopped.push(time);
  }
}
class FakeContext {
  state = 'suspended';
  currentTime = 12;
  destination = {};
  resumes = 0;
  closes = 0;
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  async resume() {
    this.resumes++;
    this.state = 'running';
  }
  async close() {
    this.closes++;
    this.state = 'closed';
  }
}
function synth() {
  const context = new FakeContext();
  let created = 0;
  const audio = new GameAudioSynth(() => {
    created++;
    return context as unknown as AudioContext;
  });
  return { audio, context, created: () => created };
}

describe('bounded procedural audio synthesis', () => {
  it('uses one gesture-created context for command, crystalline event and ambient envelopes', () => {
    const { audio, context, created } = synth();
    audio.setAudible(true);
    expect(audio.playCue('command')).toBe(false);
    expect(created()).toBe(0);
    expect(audio.unlockFromGesture()).toBe(true);
    expect(audio.playCue('command')).toBe(true);
    expect(audio.playCue('spark')).toBe(true);
    expect(audio.playAmbience(false)).toBe(true);
    expect(audio.unlockFromGesture()).toBe(true);
    expect(created()).toBe(1);
    expect(context.oscillators).toHaveLength(6);
    const notes = context.oscillators.slice(2, 5);
    expect(notes.map((node) => node.started[0])).toEqual([12, 12.065, 12.13]);
    expect(notes.map((node) => node.frequency.calls[0].value)).toEqual([880, 1174.66, 1567.98]);
    expect(context.gains.slice(1).every((gain) => gain.connected[0] === context.gains[0])).toBe(
      true,
    );
    for (const node of context.oscillators) node.onended?.();
    expect(context.oscillators.every((node) => node.disconnected === 1)).toBe(true);
  });

  it('cancels current and scheduled notes on mute or hiding, without deferred playback', () => {
    const { audio, context } = synth();
    audio.unlockFromGesture();
    audio.setAudible(true);
    audio.playCue('birth');
    expect(context.oscillators[2].started[0]).toBeGreaterThan(context.currentTime);
    audio.setAudible(false);
    expect(
      context.oscillators.every(
        (node) => node.stopped.at(-1) === undefined && node.disconnected === 1,
      ),
    ).toBe(true);
    const count = context.oscillators.length;
    audio.setAudible(true);
    expect(context.oscillators).toHaveLength(count);
    audio.setAudible(true, false);
    expect(audio.playCue('disaster')).toBe(false);
    expect(audio.playAmbience(true)).toBe(false);
    expect(context.oscillators).toHaveLength(count);
    expect(context.gains[0].gain.calls.at(-1)?.value).toBe(0);
  });

  it('limits concurrent voices and cue bursts, prioritizes grave warnings and closes cleanly', () => {
    const { audio, context } = synth();
    audio.unlockFromGesture();
    audio.setAudible(true);
    for (let i = 0; i < 8; i++) audio.playAmbience(false);
    audio.playCue('spark');
    expect(audio.playCue('spark')).toBe(false);
    expect(audio.playCue('birth')).toBe(false);
    expect(
      context.oscillators.filter((node) => node.disconnected === 0).length,
    ).toBeLessThanOrEqual(GAME_AUDIO_VOICE_LIMIT);
    expect(audio.playCue('loss')).toBe(true);
    expect(context.oscillators.filter((node) => node.disconnected === 0)).toHaveLength(2);
    audio.dispose();
    expect(context.closes).toBe(1);
    expect(context.oscillators.every((node) => node.disconnected === 1)).toBe(true);
    expect(audio.unlockFromGesture()).toBe(false);
  });

  it('does not schedule against a suspended context or turn unsupported audio into a game failure', () => {
    const { audio, context } = synth();
    audio.unlockFromGesture();
    audio.setAudible(true);
    context.state = 'suspended';
    expect(audio.playCue('birth')).toBe(false);
    expect(context.oscillators).toEqual([]);
    expect(context.resumes).toBe(1);
    audio.setAudible(true);
    expect(context.resumes).toBe(1);
    const unavailable = new GameAudioSynth(() => {
      throw new Error('unsupported');
    });
    expect(unavailable.unlockFromGesture()).toBe(false);
    unavailable.dispose();
  });
});
