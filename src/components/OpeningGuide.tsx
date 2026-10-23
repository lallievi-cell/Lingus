import { Flame, MapPin, Moon } from 'lucide-react';
import { useState } from 'react';
import { hasBuilding, hasWord } from '../game/runtime';
import type { GameState } from '../game/types';

export function OpeningGuide({ state, onHome }: { state: GameState; onHome: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (state.time >= 360 || state.urbanized) return null;
  const guided = state.playMode === 'guided';
  const fire = hasBuilding(state, 'campfire');
  let title: string, text: string;
  if (!hasWord(state, 'O_03') || !hasWord(state, 'O_02')) {
    title = hasWord(state, 'O_03') ? 'Prova anche una roccia' : 'Comincia da un albero';
    text = hasWord(state, 'O_03')
      ? 'Componi Gruppo + Colpire su una roccia vicina. Il lavoro farà conoscere la pietra e come lavorarla. Poi torna al giaciglio prima del buio.'
      : 'Componi Gruppo + Colpire, scegli un albero vicino e pronuncia. Poi fai lo stesso su una roccia: il lavoro genera le prime intuizioni.';
  } else if (!hasWord(state, 'O_01') && !hasWord(state, 'S_02')) {
    title = 'Ritrovarsi prima della notte';
    text = `Prima del buio usa Gruppo + Andare e indica il giaciglio al centro del campo. Dormire vicini per ${guided ? 'una notte' : 'due notti'} fa nascere Qui: non occorre isolare qualcuno.`;
  } else if (!hasWord(state, 'V_04')) {
    title = 'Mangiare prima di trasportare';
    text =
      'Gruppo + Mangiare su un cespuglio sazia sul posto. Risolvi le intuizioni: quando impari Portare puoi consegnare materiali al campo.';
  } else if (!fire && !hasWord(state, 'O_05')) {
    title = 'Prepara il primo fuoco';
    text = `Porta legna e pietra al campo. Poi Gruppo + Scheggiare + Pietra crea utensili e fa nascere l’intuizione del Fuoco.${guided ? ' In Guidata trasporto e utensili continuano durante il giorno, finché ci sono spazio e materiali.' : ' In Classica ogni trasporto e manufatto richiede un nuovo ordine.'} Il Falò richiede cinque legna reali.`;
  } else if (!fire) {
    title = 'Manca il combustibile';
    text =
      'Porta cinque legna al campo per accendere il primo Falò. Le risorse lasciate accanto agli alberi sono ancora da trasportare.';
  } else {
    title = 'Il fuoco è un inizio';
    text =
      'Tieni legna per alimentarlo e tramanda le parole al Falò. Per l’inverno prepara anche cibo, ripari o pelli: il fuoco da solo non garantisce calore durante una tormenta.';
  }
  const autumn = state.time >= 180 && !fire;
  return (
    <aside
      className={`opening-guide ${autumn ? 'urgent' : ''} ${expanded ? 'expanded' : ''}`}
      aria-label="Prepararsi al primo inverno"
    >
      {fire ? <Flame size={19} /> : <Moon size={19} />}
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        <span>
          {state.time < 270
            ? autumn
              ? 'L’inverno è vicino.'
              : 'L’inverno arriva dopo l’autunno.'
            : 'È inverno: resta vicino al riparo.'}
        </span>
      </div>
      <button
        className="text-button guide-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        Come?
      </button>
      <button className="text-button" onClick={onHome}>
        <MapPin size={14} />
        Giaciglio
      </button>
    </aside>
  );
}
