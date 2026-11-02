import type { GameState } from '../game/types';
import { institutionIds } from '../game/commandAcknowledgement';
import { CONTEXTUAL_WORDS, contextualDiscoveryKey } from '../game/contextualDiscovery';
import type { AudioLevels } from './audioPreferences';
import type { SoundscapeFrame, WorldAudioCue } from './worldAudio';

export type GameAudioCue = 'command' | 'spark' | 'birth' | 'loss' | 'disaster';
type SessionKey = string | number;
type AudioObservation = {
  time: number;
  commands: number;
  institutions: Set<string>;
  births: number;
  sparks: Set<string>;
  contextualDiscoveries: Map<string, number>;
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
      contextualDiscoveries: new Map(
        CONTEXTUAL_WORDS.flatMap((id) => {
          const at = state.eventTimes[contextualDiscoveryKey(id)];
          return typeof at === 'number' ? [[id, at] as const] : [];
        }),
      ),
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
    if (
      [...current.contextualDiscoveries].some(
        ([id, at]) =>
          at >= previous.time && at <= state.time && previous.contextualDiscoveries.get(id) !== at,
      )
    )
      cues.add('spark');
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
type Voice = {
  oscillator: OscillatorNode | AudioBufferSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode;
};
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
  private lastWorldCue = new Map<WorldAudioCue['kind'], number>();
  private lastMusic = -Infinity;
  private levels: AudioLevels = { master: 1, ambience: 1, effects: 1, music: 1 };
  private noiseBuffer?: AudioBuffer;
  private soundPhase = 0;
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
        this.lastWorldCue.clear();
        this.lastMusic = -Infinity;
        this.noiseBuffer = undefined;
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled && this.visible ? this.levels.master : 0;
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
      this.master.gain.setValueAtTime(
        enabled && visible ? this.levels.master : 0,
        this.context.currentTime,
      );
    }
    if (!enabled || !visible) this.silence();
  }

  setLevels(value: Partial<AudioLevels>) {
    const next = { ...this.levels };
    for (const key of ['master', 'ambience', 'effects', 'music'] as const) {
      if (typeof value[key] === 'number' && Number.isFinite(value[key]))
        next[key] = Math.max(0, Math.min(1, value[key]));
    }
    if ((Object.keys(next) as (keyof AudioLevels)[]).every((key) => next[key] === this.levels[key]))
      return;
    // Replacing a mix never leaves a long ambient or musical voice at its old level.
    this.silence();
    this.levels = next;
    this.lastMusic = -Infinity;
    this.setAudible(this.enabled, this.visible);
  }

  playCue(cue: GameAudioCue): boolean {
    const context = this.context;
    if (!this.canPlay() || !context || this.levels.effects === 0) return false;
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
    if (!this.canPlay() || this.levels.ambience === 0 || this.voices.size >= GAME_AUDIO_VOICE_LIMIT)
      return false;
    this.tone(
      {
        frequency: night ? 660 : 1450,
        endFrequency: night ? 440 : 2350,
        offset: 0,
        duration: 0.4,
        volume: 0.012,
      },
      'ambience',
    );
    return true;
  }

  /** Material envelopes are short, coalesced and quieter than discoveries or danger. */
  playWorldCue(cue: WorldAudioCue): boolean {
    const context = this.context;
    if (!context || !this.canPlay() || this.levels.effects === 0 || cue.volume <= 0) return false;
    const interval = cue.kind === 'step' ? 0.7 : cue.kind === 'animal' ? 2.5 : 0.26;
    if (
      context.currentTime - (this.lastWorldCue.get(cue.kind) ?? -Infinity) < interval ||
      this.voices.size + 2 > GAME_AUDIO_VOICE_LIMIT
    )
      return false;
    this.lastWorldCue.set(cue.kind, context.currentTime);
    const volume = Math.min(1, Math.max(0, cue.volume));
    if (cue.kind === 'wood') {
      this.noise(0.085, 0.022 * volume, 760, 'bandpass', 'effects');
      this.tone({
        frequency: 220,
        endFrequency: 95,
        offset: 0,
        duration: 0.11,
        volume: 0.018 * volume,
        type: 'triangle',
      });
    } else if (cue.kind === 'stone') {
      this.noise(0.045, 0.025 * volume, 2400, 'highpass', 'effects');
      this.tone({
        frequency: 1830,
        endFrequency: 1170,
        offset: 0,
        duration: 0.065,
        volume: 0.012 * volume,
        type: 'triangle',
      });
    } else if (cue.kind === 'delivery') {
      this.noise(0.14, 0.014 * volume, 510, 'lowpass', 'effects');
      this.tone({
        frequency: 132,
        endFrequency: 75,
        offset: 0.02,
        duration: 0.14,
        volume: 0.015 * volume,
        type: 'triangle',
      });
    } else if (cue.kind === 'step') {
      this.noise(0.075, 0.012 * volume, 390, 'lowpass', 'effects');
    } else if (cue.kind === 'meal') {
      this.noise(0.09, 0.009 * volume, 1150, 'bandpass', 'effects');
    } else {
      this.tone({
        frequency: 185,
        endFrequency: 125,
        offset: 0,
        duration: 0.3,
        volume: 0.014 * volume,
        type: 'triangle',
      });
      this.noise(0.22, 0.009 * volume, 650, 'bandpass', 'effects');
    }
    return true;
  }

  /** Layered, overlapping wind and real nearby fire replace a repeating lone chirp. */
  playSoundscape(frame: SoundscapeFrame): boolean {
    if (
      !this.canPlay() ||
      this.levels.ambience === 0 ||
      this.voices.size > GAME_AUDIO_VOICE_LIMIT - 4
    )
      return false;
    const rough = frame.weather === 'storm' || frame.weather === 'blizzard';
    this.noise(
      5.4,
      rough ? 0.019 : 0.011,
      rough ? 1150 : frame.night ? 420 : 720,
      'lowpass',
      'ambience',
      0,
      0.7,
    );
    if (frame.fire > 0.03) {
      this.noise(0.18, 0.012 * frame.fire, 1350, 'bandpass', 'ambience', 0.12);
      this.noise(0.07, 0.015 * frame.fire, 2100, 'highpass', 'ambience', 1.7);
      this.noise(0.12, 0.009 * frame.fire, 1700, 'bandpass', 'ambience', 3.35);
    } else if (!rough && !frame.night && frame.season !== 3) {
      this.tone(
        { frequency: 1530, endFrequency: 2180, offset: 0.8, duration: 0.18, volume: 0.006 },
        'ambience',
      );
      this.tone(
        { frequency: 1840, endFrequency: 1370, offset: 1.02, duration: 0.16, volume: 0.004 },
        'ambience',
      );
    }
    return true;
  }

  /** Sparse, gently swelling fifths leave space for the language and material sounds. */
  playMusic(frame: SoundscapeFrame): boolean {
    const context = this.context;
    if (
      !context ||
      !this.canPlay() ||
      this.levels.music === 0 ||
      context.currentTime - this.lastMusic < 18 ||
      this.voices.size + 3 > GAME_AUDIO_VOICE_LIMIT - 2
    )
      return false;
    this.lastMusic = context.currentTime;
    const root = [130.81, 146.83, 123.47, 110][frame.season % 4] * (frame.night ? 0.5 : 1);
    for (const [ratio, offset, volume] of [
      [1, 0, 0.013],
      [1.5, 0.45, 0.008],
      [frame.tense ? 1.125 : 2, 1.6, 0.005],
    ])
      this.tone({ frequency: root * ratio, offset, duration: 5.5, volume }, 'music', 1.2);
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
    this.noiseBuffer = undefined;
  }

  private canPlay() {
    return (
      !this.disposed &&
      this.enabled &&
      this.visible &&
      this.levels.master > 0 &&
      this.context?.state === 'running'
    );
  }

  private release(voice: Voice) {
    if (!this.voices.delete(voice)) return;
    voice.oscillator.onended = null;
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    voice.filter?.disconnect();
  }

  private tone(note: Tone, channel: keyof Omit<AudioLevels, 'master'> = 'effects', attack = 0.012) {
    const context = this.context!,
      master = this.master!;
    const volume = note.volume * this.levels[channel];
    if (volume <= 0 || this.voices.size >= GAME_AUDIO_VOICE_LIMIT) return;
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
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(attack, note.duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(gain);
    gain.connect(master);
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => this.release(voice);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.01);
  }

  private noise(
    duration: number,
    volume: number,
    frequency: number,
    type: BiquadFilterType,
    channel: keyof Omit<AudioLevels, 'master'>,
    offset = 0,
    attack = 0.006,
  ) {
    const context = this.context!;
    if (volume <= 0 || this.levels[channel] === 0 || this.voices.size >= GAME_AUDIO_VOICE_LIMIT)
      return;
    if (
      typeof context.createBufferSource !== 'function' ||
      typeof context.createBuffer !== 'function' ||
      typeof context.createBiquadFilter !== 'function'
    ) {
      // Older/limited contexts can still offer a quiet tonal material cue.
      this.tone(
        { frequency, offset, duration: Math.min(duration, 0.2), volume: volume * 0.3 },
        channel,
      );
      return;
    }
    if (!this.noiseBuffer) {
      this.noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 2),
        context.sampleRate,
      );
      const samples = this.noiseBuffer.getChannelData(0);
      let seed = 0x31647a81;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 4294967296) * 2 - 1;
      }
    }
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    const start = context.currentTime + offset;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      volume * this.levels[channel],
      start + Math.min(attack, duration * 0.25),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    const voice = { oscillator: source, filter, gain };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(start, (++this.soundPhase * 0.137) % 1.7);
    source.stop(start + duration + 0.01);
  }
}
