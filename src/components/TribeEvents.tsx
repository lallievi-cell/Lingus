import { Baby, BookOpen, HeartCrack, MapPin } from 'lucide-react';
import { WORDS } from '../game/content';
import { getLifeStage, resolveUnitSex } from '../game/demography';
import { hasWord } from '../game/runtime';
import type { GameState, TribeEvent, Unit } from '../game/types';

export function visiblePerson(state: GameState, unit?: Unit) {
  if (!unit) return 'un compagno';
  if (hasWord(state, 'S_02')) return unit.name;
  const female = resolveUnitSex(unit) === 'F',
    stage = getLifeStage(unit);
  return stage === 'elder'
    ? female
      ? 'un’anziana'
      : 'un anziano'
    : stage === 'child' || stage === 'newborn'
      ? female
        ? 'una bambina'
        : 'un bambino'
      : female
        ? 'una donna adulta'
        : 'un uomo adulto';
}
const causes: Record<string, string> = {
  ENV_STARVATION: 'per la fame',
  C_01: 'per il freddo',
  oldAge: 'di vecchiaia',
  V_03: 'durante uno scontro',
  STAT_PLAGUE: 'per una malattia',
  STAT_PARASITES: 'dopo un pasto di carne cruda',
  plague: 'per una malattia',
  disease: 'per una malattia',
  O_14: 'per una sanzione del Tribunale',
};
function combatCircumstance(state: GameState, event: TribeEvent) {
  if (event.cause !== 'V_03' || !event.combatSource) return undefined;
  const source = event.combatSource;
  if (source.kind === 'wolf') return 'per l’attacco di un lupo';
  if (source.kind === 'alpha') return 'per l’attacco di un predatore alfa';
  if (source.kind === 'mammoth') return 'durante uno scontro con un mammut';
  if (source.kind === 'deer') return 'durante uno scontro con un cervo';
  if (source.kind === 'army') return 'durante uno scontro con un esercito';
  const attacker = state.units.find((unit) => unit.id === source.id);
  return attacker && hasWord(state, 'S_02')
    ? `per l’aggressione di ${attacker.name}`
    : 'per un’aggressione umana';
}
export function tribeEventText(state: GameState, event: TribeEvent) {
  const unit = state.units.find((u) => u.id === event.unitId);
  const who = visiblePerson(state, unit);
  if (event.kind === 'birth') {
    const parents = (event.parentIds ?? unit?.parentIds ?? [])
      .map((id) =>
        visiblePerson(
          state,
          state.units.find((u) => u.id === id),
        ),
      )
      .join(' e ');
    return {
      title: 'Una nuova vita',
      text: `${unit ? `${who} ${resolveUnitSex(unit) === 'F' ? 'è nata' : 'è nato'}` : 'Una nuova voce è nata'} nella tribù.${parents ? ` Genitori: ${parents}.` : ''}`,
    };
  }
  if (event.kind === 'death') {
    const carriedIds = [...new Set(event.wordIds ?? event.lostWordIds ?? [])];
    const carried = carriedIds.map((id) => `«${WORDS[id].label}»`).join(', ');
    const lost = event.lostWordIds?.map((id) => `«${WORDS[id].label}»`).join(', ');
    const retained = carriedIds
      .filter((id) => !event.lostWordIds?.includes(id))
      .map((id) => `«${WORDS[id].label}»`)
      .join(', ');
    const cause =
      combatCircumstance(state, event) ??
      (event.cause && Object.hasOwn(causes, event.cause) ? causes[event.cause] : undefined);
    return {
      title: 'Un lutto nella tribù',
      text: `${who} ${unit && resolveUnitSex(unit) === 'F' ? 'è morta' : 'è morto'}${cause ? ` ${cause}` : ''}.${carried ? ` Custodiva: ${carried}.` : ''}${lost ? ` Parole perdute: ${lost}.` : ''}${retained ? ` Affidate anche ad altri custodi: ${retained}.` : ''}`,
    };
  }
  return {
    title: 'Una parola perduta',
    text: `«${WORDS[event.wordId!]?.label ?? 'Una parola'}» è stata dimenticata. ${event.cause === 'custodian-death' ? `L’ultimo custode era ${who}.` : 'La memoria si è indebolita al cambio di stagione.'} Ricrea l’esperienza per riscoprirla.`,
  };
}

/** A death already explains all of its lost words, avoiding duplicate alerts. */
export function distinctTribeEvents(events: TribeEvent[]) {
  return events.filter(
    (event) =>
      event.kind !== 'word-lost' ||
      !events.some(
        (other) =>
          other.kind === 'death' &&
          other.unitId === event.unitId &&
          other.time === event.time &&
          other.lostWordIds?.includes(event.wordId!),
      ),
  );
}

export function acknowledgedTribeEventIds(events: TribeEvent[], limit = 3) {
  const shown = distinctTribeEvents(events).slice(0, limit);
  return events
    .filter((event) =>
      shown.some(
        (other) =>
          other.id === event.id ||
          (event.kind === 'word-lost' &&
            other.kind === 'death' &&
            other.unitId === event.unitId &&
            other.time === event.time &&
            other.lostWordIds?.includes(event.wordId!)),
      ),
    )
    .map((event) => event.id);
}

export function forgottenWordHint(state: GameState, id: string) {
  const event = state.tribeEvents?.find((e) => e.kind === 'word-lost' && e.wordId === id);
  return event
    ? tribeEventText(state, event).text
    : 'Questa parola è stata dimenticata. Ricrea l’esperienza per riscoprirla.';
}

export function TribeEvents({
  state,
  events,
  onFocus,
  summary = false,
}: {
  state: GameState;
  events: TribeEvent[];
  onFocus?: (id: string) => void;
  summary?: boolean;
}) {
  const shown = distinctTribeEvents(events).slice(0, summary ? 6 : 3);
  if (!shown.length) return null;
  return (
    <div
      className={`tribe-events ${summary ? 'season-events' : ''}`}
      aria-label={summary ? 'Riepilogo della tribù' : 'Eventi della tribù'}
      role="status"
      aria-live="polite"
    >
      {summary && <strong>La vita della tribù</strong>}
      {shown.map((event) => {
        const message = tribeEventText(state, event);
        const Icon = event.kind === 'birth' ? Baby : event.kind === 'death' ? HeartCrack : BookOpen;
        return (
          <article key={event.id} className={`tribe-event event-${event.kind}`}>
            <Icon size={19} aria-hidden="true" />
            <div>
              <strong>{message.title}</strong>
              <p>{message.text}</p>
            </div>
            {onFocus && event.unitId && (
              <button
                className="text-button"
                onClick={() => onFocus(event.unitId!)}
                aria-label={`Mostra sulla mappa: ${message.title}`}
              >
                <MapPin size={14} />
                <span>Mostra</span>
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
