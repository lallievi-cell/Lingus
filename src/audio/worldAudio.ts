import { getCalendar } from '../game/calendar';
import type { GameState, Unit } from '../game/types';

export type WorldAudioKind = 'wood' | 'stone' | 'meal' | 'delivery' | 'step' | 'animal';
export type WorldAudioCue = { kind: WorldAudioKind; volume: number };
export type AudioListener = { x: number; y: number; radius?: number };
export type SoundscapeFrame = {
  night: boolean;
  season: number;
  weather: 'clear' | 'storm' | 'blizzard' | 'drought';
  fire: number;
  tense: boolean;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const revealed = (state: GameState, point: { x: number; y: number }) =>
  state.tier >= 4 ||
  state.sectors.some(
    (sector) =>
      sector.explored &&
      sector.x === Math.min(4, Math.floor(point.x / 100)) &&
      sector.y === Math.min(4, Math.floor(point.y / 100)),
  );
const listenerAt = (state: GameState, listener?: AudioListener) => listener ?? state.home;
const heard = (state: GameState, point: { x: number; y: number }, listener?: AudioListener) => {
  if (!revealed(state, point)) return 0;
  const radius =
    listener?.radius && Number.isFinite(listener.radius) && listener.radius > 0
      ? listener.radius
      : 60;
  return Math.max(0, 1 - distance(point, listenerAt(state, listener)) / radius);
};

/** Derived ambience follows real heat sources and the simulation calendar. */
export function soundscapeFrame(state: GameState, listener?: AudioListener): SoundscapeFrame {
  const calendar = getCalendar(state);
  return {
    night: calendar.isNight,
    season: calendar.season,
    weather: state.disasters.blizzard
      ? 'blizzard'
      : state.disasters.storm
        ? 'storm'
        : state.disasters.drought
          ? 'drought'
          : 'clear',
    fire: Math.min(
      1,
      state.buildings
        .filter(
          (building) =>
            building.kind === 'campfire' &&
            building.hp > 0 &&
            building.active &&
            building.completed !== false,
        )
        .reduce(
          (sum, building) =>
            sum + heard(state, building, { ...listenerAt(state, listener), radius: 30 }),
          0,
        ),
    ),
    tense: state.units.some(
      (unit) =>
        unit.hp > 0 &&
        (!unit.factionId || unit.factionId === 'player') &&
        heard(state, unit, listener) > 0.3 &&
        (unit.hp <= 30 || unit.hunger >= 95 || unit.temp <= 20),
    ),
  };
}

type ActorSample = Pick<Unit, 'x' | 'y' | 'hp'> & {
  markers: Record<string, number>;
  targetKind?: string;
};
type Observation = {
  time: number;
  session: string | number;
  audible: boolean;
  units: Map<string, ActorSample>;
  animals: Map<string, { x: number; y: number; hp: number }>;
};
const intervals: Record<WorldAudioKind, number> = {
  wood: 0.4,
  stone: 0.4,
  delivery: 0.8,
  meal: 2,
  step: 1.1,
  animal: 5,
};
const priorities: WorldAudioKind[] = ['delivery', 'stone', 'wood', 'meal', 'animal', 'step'];

/** Actual completed work and observed movement, never an invented per-unit timer. */
export class GameWorldAudioEvents {
  private previous?: Observation;
  private playedAt = new Map<WorldAudioKind, number>();

  observe(
    state: GameState,
    audible: boolean,
    session: string | number = 0,
    listener?: AudioListener,
  ): WorldAudioCue[] {
    const targetKinds = new Map(state.entities.map((entity) => [entity.id, entity.kind]));
    const current: Observation = {
      time: state.time,
      session,
      audible,
      units: new Map(
        state.units
          .filter((unit) => unit.hp > 0)
          .map((unit) => [
            unit.id,
            {
              x: unit.x,
              y: unit.y,
              hp: unit.hp,
              targetKind: unit.targetId ? targetKinds.get(unit.targetId) : undefined,
              markers: Object.fromEntries(
                Object.entries(unit.lastEventAt ?? {}).filter(
                  ([key]) => key === 'DELIVERY' || key === 'MEAL' || key.startsWith('WORK:'),
                ),
              ),
            },
          ]),
      ),
      animals: new Map(
        state.entities
          .filter(
            (entity) => ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind) && entity.hp > 0,
          )
          .map((entity) => [entity.id, { x: entity.x, y: entity.y, hp: entity.hp }]),
      ),
    };
    const previous = this.previous;
    this.previous = current;
    if (
      !previous ||
      !audible ||
      !previous.audible ||
      !state.started ||
      state.paused ||
      session !== previous.session ||
      state.time < previous.time ||
      state.time - previous.time > 8
    ) {
      this.playedAt.clear();
      return [];
    }
    const pending = new Map<WorldAudioKind, number>();
    const add = (kind: WorldAudioKind, volume: number) => {
      if (volume > 0.05) pending.set(kind, Math.max(pending.get(kind) ?? 0, volume));
    };
    for (const unit of state.units) {
      const before = previous.units.get(unit.id),
        after = current.units.get(unit.id);
      if (!before || !after) continue;
      if (
        state.urbanized &&
        (!unit.factionId || unit.factionId === 'player') &&
        !unit.isKing &&
        !['delegating', 'frontline', 'frontline-returning'].includes(unit.action)
      )
        continue;
      const volume = heard(state, unit, listener);
      if (volume <= 0.05) continue;
      for (const [key, at] of Object.entries(after.markers)) {
        if (
          before.markers[key] === at ||
          at < previous.time ||
          at > state.time ||
          state.time - at > 1.25
        )
          continue;
        if (key === 'DELIVERY') add('delivery', volume);
        else if (key === 'MEAL') add('meal', volume * 0.65);
        else if (key === 'WORK:V_06') add('stone', volume);
        else if (key === 'WORK:V_08') add('wood', volume * 0.75);
        else if (key === 'WORK:V_03' || key === 'WORK:V_04') {
          const targetKind = after.targetKind ?? before.targetKind;
          if (targetKind === 'tree') add('wood', volume);
          else if (targetKind === 'stone' || targetKind === 'ore') add('stone', volume);
        }
      }
      if (unit.age >= 1 && distance(before, after) >= 0.12) add('step', volume * 0.4);
    }
    for (const animal of state.entities) {
      const before = previous.animals.get(animal.id);
      if (!before) continue;
      const moved = distance(before, animal);
      if (
        animal.hp < before.hp ||
        (['wolf', 'alpha'].includes(animal.kind) &&
          moved > 0.3 &&
          state.units.some((unit) => unit.hp > 0 && distance(unit, animal) < 12))
      )
        add('animal', heard(state, animal, listener) * 0.65);
    }
    return priorities
      .filter(
        (kind) =>
          pending.has(kind) &&
          state.time - (this.playedAt.get(kind) ?? -Infinity) >= intervals[kind],
      )
      .slice(0, 2)
      .map((kind) => {
        this.playedAt.set(kind, state.time);
        return { kind, volume: pending.get(kind)! };
      });
  }
}
