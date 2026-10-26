import type { GameState } from '../game/types';
import { institutionIds } from '../game/commandAcknowledgement';

export type GameAudioCue = 'command' | 'spark' | 'birth' | 'loss' | 'disaster';
type SessionKey = string | number;
type AudioObservation = {
  time: number;
  commands: number;
  institutions: Set<string>;
  births: number;
  sparks: Set<string>;
  events: Set<string>;
  weather: Set<string>;
  infections: Set<string>;
  session: SessionKey;
  audible: boolean;
};

/** Ephemeral event observation; no audio IDs, timers or randomness enter the save. */
export class GameAudioEvents {
  private previous?: AudioObservation;

  observe(state: GameState, audible: boolean, session: SessionKey = 0): GameAudioCue[] {
    const current: AudioObservation = {
      time: state.time,
      commands: state.stats.commands,
      institutions: institutionIds(state),
      births: state.stats.births,
      sparks: new Set(state.sparks.map((spark) => spark.id)),
      events: new Set((state.tribeEvents ?? []).map((event) => event.id)),
      weather: new Set(
        (['storm', 'drought', 'blizzard', 'lightning'] as const).filter(
          (kind) => state.disasters[kind],
        ),
      ),
      infections: new Set(
        state.units
          .filter((unit) => unit.hp > 0 && (unit.plagueUntil ?? 0) > state.time)
          .map((unit) => unit.id),
      ),
      session,
      audible,
    };
    const previous = this.previous;
    this.previous = current;
    if (
      !previous ||
      !audible ||
      !previous.audible ||
      !state.started ||
      session !== previous.session ||
      state.time < previous.time ||
      state.time - previous.time > 8 ||
      state.stats.commands < previous.commands
    )
      return [];

    const cues = new Set<GameAudioCue>();
    if (
      state.stats.commands > previous.commands ||
      [...current.institutions].some((id) => !previous.institutions.has(id))
    )
      cues.add('command');
    // Urban cohorts also have real births, without individual tribe-event identities.
    if (state.stats.births > previous.births) cues.add('birth');
    if (state.sparks.some((spark) => !previous.sparks.has(spark.id))) cues.add('spark');
    for (const event of state.tribeEvents ?? []) {
      if (previous.events.has(event.id) || event.time < previous.time || event.time > state.time)
        continue;
      if (event.kind === 'birth') cues.add('birth');
      if (event.kind === 'death' && (event.lostWordIds?.length ?? 0) > 0) cues.add('loss');
    }
    if (
      [...current.weather].some((kind) => !previous.weather.has(kind)) ||
      [...current.infections].some((id) => !previous.infections.has(id))
    )
      cues.add('disaster');
    // One grave cue suffices if a disaster and the loss of a last custodian coincide.
    if (cues.has('loss')) cues.delete('disaster');
    return (['loss', 'disaster', 'birth', 'spark', 'command'] as const)
      .filter((cue) => cues.has(cue))
      .slice(0, 3);
  }
}

type Tone = {
  frequency: number;
  endFrequency?: number;
  offset: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
};
type Voice = { oscillator: OscillatorNode; gain: GainNode };
export const GAME_AUDIO_VOICE_LIMIT = 12;

const patterns: Record<GameAudioCue, Tone[]> = {
  command: [
    {
      frequency: 510,
      endFrequency: 170,
      offset: 0,
      duration: 0.1,
      volume: 0.035,
      type: 'triangle',
    },
    { frequency: 1620, endFrequency: 1190, offset: 0, duration: 0.055, volume: 0.011 },
  ],
  spark: [880, 1174.66, 1567.98].map((frequency, index) => ({
    frequency,
    offset: index * 0.065,
    duration: 0.28,
    volume: 0.026,
  })),
  birth: [523.25, 659.25, 783.99].map((frequency, index) => ({
    frequency,
    offset: index * 0.09,
    duration: 0.4,
    volume: 0.028,
  })),
  loss: [
    { frequency: 112, endFrequency: 48, offset: 0, duration: 0.65, volume: 0.06 },
    {
      frequency: 55,
      endFrequency: 42,
      offset: 0.03,
      duration: 0.45,
      volume: 0.022,
      type: 'triangle',
    },
  ],
  disaster: [
    { frequency: 88, endFrequency: 38, offset: 0, duration: 0.5, volume: 0.055 },
    {
      frequency: 132,
      endFrequency: 62,
      offset: 0.08,
      duration: 0.35,
      volume: 0.018,
      type: 'triangle',
    },
  ],
};

/** A single, gesture-unlocked context serves ambience and all event sounds. */
export class GameAudioSynth {
  private context?: AudioContext;
  private master?: GainNode;
  private voices = new Set<Voice>();
  private lastCue = new Map<GameAudioCue, number>();
  private enabled = false;
  private visible = true;
  private disposed = false;

  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}

  /** Call only from a user gesture. Effects never create or resume an AudioContext. */
  unlockFromGesture(): boolean {
    if (this.disposed) return false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.silence();
        this.master?.disconnect();
        this.lastCue.clear();
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled && this.visible ? 1 : 0;
        this.master.connect(this.context.destination);
      }
      void this.context.resume().catch(() => {
        // Browser denial leaves audio quiet; there is no queued event retry.
      });
      return true;
    } catch {
      return false;
    }
  }

  setAudible(enabled: boolean, visible = true) {
    this.enabled = enabled;
    this.visible = visible;
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(enabled && visible ? 1 : 0, this.context.currentTime);
    }
    if (!enabled || !visible) this.silence();
  }

  playCue(cue: GameAudioCue): boolean {
    const context = this.context;
    if (!this.canPlay() || !context) return false;
    const cooldown = cue === 'command' ? 0.08 : cue === 'loss' || cue === 'disaster' ? 0.65 : 0.35;
    if (context.currentTime - (this.lastCue.get(cue) ?? -Infinity) < cooldown) return false;
    const notes = patterns[cue];
    if (this.voices.size + notes.length > GAME_AUDIO_VOICE_LIMIT) {
      if (cue === 'loss' || cue === 'disaster') this.silence();
      else return false;
    }
    this.lastCue.set(cue, context.currentTime);
    for (const note of notes) this.tone(note);
    return true;
  }

  playAmbience(night: boolean): boolean {
    if (!this.canPlay() || this.voices.size >= GAME_AUDIO_VOICE_LIMIT) return false;
    this.tone({
      frequency: night ? 660 : 1450,
      endFrequency: night ? 440 : 2350,
      offset: 0,
      duration: 0.4,
      volume: 0.012,
    });
    return true;
  }

  /** Cancel all current and future notes; none can leak out after unmuting. */
  silence() {
    for (const voice of [...this.voices]) {
      try {
        voice.oscillator.stop();
      } catch {
        /* An ended oscillator is already silent. */
      }
      this.release(voice);
    }
  }

  dispose() {
    this.disposed = true;
    this.silence();
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    this.context = undefined;
    this.master = undefined;
  }

  private canPlay() {
    return !this.disposed && this.enabled && this.visible && this.context?.state === 'running';
  }

  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.oscillator.onended = null;
    voice.oscillator.disconnect();
    voice.gain.disconnect();
  }

  private tone(note: Tone) {
    const context = this.context!,
      master = this.master!;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    const start = context.currentTime + note.offset;
    oscillator.type = note.type ?? 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(
        note.endFrequency,
        start + note.duration * 0.65,
      );
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.volume, start + Math.min(0.012, note.duration * 0.12));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(master);
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => this.release(voice);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.01);
  }
}
