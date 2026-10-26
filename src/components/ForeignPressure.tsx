import { Flag, ShieldAlert, Send, X, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { RESOURCE_SPECS, WORDS } from '../game/content';
import { hasWord } from '../game/runtime';
import type { GameState } from '../game/types';
import './ForeignPressure.css';

export function ForeignPressure({
  state,
  onResolve,
  onFocus,
}: {
  state: GameState;
  onResolve: (id: string, choice: 'pay' | 'refuse') => void;
  onFocus?: (point: { x: number; y: number }) => void;
}) {
  const pending = state.foreignPolicy?.ultimata.filter((u) => u.status === 'pending') ?? [];
  const raids = state.foreignPolicy?.raids.filter((raid) => raid.phase !== 'ended') ?? [];
  const deliveries = state.foreignPolicy?.ultimata.filter((u) => u.status === 'dispatched') ?? [];
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const numbered = hasWord(state, 'O_08');
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setScrollable(list.scrollHeight > list.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [pending.length, raids.length, deliveries.length, numbered]);
  if (!pending.length && !raids.length && !deliveries.length) return null;
  const factionName = (id: string) =>
    state.factions.find((f) => f.id === id)?.name ?? 'Un popolo vicino';
  return (
    <section className="foreign-pressure" aria-label="Pressioni delle tribù vicine">
      <header>
        <Flag size={15} />
        <strong>Dalle terre vicine</strong>
        {scrollable && <small id="foreign-pressure-scroll-hint">Scorri gli avvisi ↓</small>}
      </header>
      <div
        ref={listRef}
        className="foreign-pressure__list"
        role="group"
        aria-label="Avvisi delle tribù vicine"
        aria-describedby={scrollable ? 'foreign-pressure-scroll-hint' : undefined}
        tabIndex={scrollable ? 0 : undefined}
      >
        {pending.map((ultimatum) => {
          const canPay =
            state.resources[ultimatum.resource] >= ultimatum.amount &&
            state.time < ultimatum.expiresAt;
          const concept =
            ultimatum.dogmaTargetId && hasWord(state, ultimatum.dogmaTargetId)
              ? WORDS[ultimatum.dogmaTargetId]?.label
              : undefined;
          return (
            <article className="foreign-pressure__ultimatum" key={ultimatum.id}>
              <strong>{factionName(ultimatum.factionId)}</strong>
              <p>
                {ultimatum.kind === 'religious'
                  ? `Contesta la nostra dottrina${concept ? ` su «${concept}»` : ''} e chiede un dono di tregua.`
                  : 'Chiede un tributo per mantenere la pace.'}
              </p>
              <small>
                {numbered
                  ? `${Math.max(0, Math.ceil(ultimatum.expiresAt - state.time))} s per rispondere · ${ultimatum.amount} ${RESOURCE_SPECS[ultimatum.resource].label}`
                  : `Il tempo per rispondere è breve · Un piccolo dono di ${RESOURCE_SPECS[ultimatum.resource].label.toLowerCase()}`}
              </small>
              <div className="foreign-pressure__actions">
                <button
                  disabled={!canPay}
                  onClick={() => onResolve(ultimatum.id, 'pay')}
                  title={
                    canPay
                      ? 'Invia un convoglio con scorte reali. La tregua comincia con la partenza.'
                      : 'Le scorte non bastano per il dono richiesto.'
                  }
                >
                  <Send size={13} />
                  Invia il dono
                </button>
                <button onClick={() => onResolve(ultimatum.id, 'refuse')}>
                  <X size={13} />
                  Rifiuta
                </button>
              </div>
            </article>
          );
        })}
        {raids.map((raid) => {
          const member = state.units.find(
            (unit) =>
              raid.memberIds.includes(unit.id) && unit.hp > 0 && unit.factionId === raid.factionId,
          );
          return (
            <article className="foreign-pressure__raid" key={raid.id}>
              <ShieldAlert size={16} />
              <div>
                <strong>{factionName(raid.factionId)}</strong>
                <p>
                  {raid.phase === 'returning'
                    ? 'Gli incursori si ritirano: il loro eventuale bottino viaggia con loro.'
                    : 'Una razzia si avvicina alle scorte. Presidia la tana o proteggila con la palizzata.'}
                </p>
              </div>
              {member && onFocus && (
                <button
                  aria-label={`Inquadra gli incursori di ${factionName(raid.factionId)}`}
                  title="Inquadra gli incursori"
                  onClick={() => onFocus(member)}
                >
                  <MapPin size={16} />
                </button>
              )}
            </article>
          );
        })}
        {deliveries.map((ultimatum) => (
          <article key={ultimatum.id} className="foreign-pressure__delivery">
            <Send size={14} />
            <p>
              Il dono per {factionName(ultimatum.factionId)} è in viaggio.{' '}
              {(state.factions.find((f) => f.id === ultimatum.factionId)?.peaceUntil ?? 0) >
              state.time
                ? 'La tregua è attiva; la consegna deve ancora arrivare.'
                : 'La tregua è scaduta e la consegna deve ancora arrivare.'}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
