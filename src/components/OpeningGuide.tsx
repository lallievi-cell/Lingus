import { Flame, MapPin, Moon, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { hasBuilding, hasWord } from '../game/runtime';
import { getPersonalDiscoveryProgress } from '../game/personalDiscovery';
import { thermalConditionsAt } from '../game/thermal';
import type { GameState } from '../game/types';

export function OpeningGuide({
  state,
  onHome,
  onSpark,
  onTeach,
}: {
  state: GameState;
  onHome: () => void;
  onSpark?: (id: string) => void;
  onTeach?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (state.time >= 360 || state.urbanized) return null;
  const guided = state.playMode === 'guided';
  const fire = hasBuilding(state, 'campfire');
  const hearth = state.buildings.some(
    (building) => building.kind === 'campfire' && !building.cityId && building.hp > 0,
  );
  const living = state.units.filter(
    (unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player'),
  );
  const cold = living.some((unit) => unit.temp <= 20 && thermalConditionsAt(state, unit).delta < 0);
  const starving = living.some((unit) => unit.hunger >= 95);
  const personal = getPersonalDiscoveryProgress(state);
  let action: 'spark' | 'teach' | undefined;
  let title: string, text: string;
  if (cold) {
    title = 'La tribù sta gelando';
    text = fire
      ? 'Riporta il gruppo al giaciglio, dentro il calore del Falò. Ripari e pelli aiutano a recuperare temperatura; durante una tormenta il solo fuoco non basta.'
      : hearth
        ? 'Riporta il gruppo al campo e porta legna al Falò per riaccenderlo. Il materiale lasciato lontano dal campo deve ancora essere trasportato.'
        : 'Serve una fonte di calore: prepara il primo Falò con legna consegnata e l’intuizione del Fuoco. Ripari e pelli proteggono dal freddo; il giaciglio da solo non scalda.';
  } else if (starving) {
    title = 'Prima viene il cibo';
    text =
      'Interrompi il lavoro di chi ha fame. Gruppo + Mangiare su bacche disponibili o una carcassa sazia sul posto; vicino al campo si possono consumare le scorte consegnate.';
  } else if (personal?.ready && onSpark) {
    title = 'Un’esperienza personale';
    text = personal.hint + ' Non serve allontanare un compagno dal gruppo.';
    action = 'spark';
  } else if (!hasWord(state, 'O_03') || !hasWord(state, 'O_02')) {
    title = hasWord(state, 'O_03') ? 'Prova anche una roccia' : 'Comincia da un albero';
    text = hasWord(state, 'O_03')
      ? 'Componi Gruppo + Colpire su una roccia vicina. Il lavoro farà conoscere la pietra e come lavorarla. Al calare del buio torna al giaciglio.'
      : 'Componi Gruppo + Colpire, scegli un albero vicino e pronuncia. Poi fai lo stesso su una roccia: il lavoro genera le prime intuizioni.';
  } else if (!hasWord(state, 'O_01') && !hasWord(state, 'S_02')) {
    title = 'Rientrare al calare del buio';
    text = `Quando arriva il buio usa Raduna al campo: è un ordine di Andare che costa una Voce. Camminare al buio fa comprendere Notte. Dormire vicini per ${guided ? 'una notte' : 'due notti'} fa nascere Qui.${personal ? ' Per Io conta anche un’esperienza personale: un compagno che mangia di propria iniziativa mentre gli altri non hanno fame può avere l’intuizione, senza essere isolato.' : ''}`;
  } else if (!hasWord(state, 'V_04')) {
    title = 'Mangiare prima di trasportare';
    text =
      'Gruppo + Mangiare su un cespuglio sazia sul posto. Risolvi le intuizioni: quando impari Portare puoi consegnare materiali al campo.';
  } else if (!fire && !hasWord(state, 'O_05')) {
    title = 'Prepara il primo fuoco';
    text = `Porta legna e pietra al campo. Poi Gruppo + Scheggiare + Pietra crea utensili e fa nascere l’intuizione del Fuoco.${guided ? ' In Guidata trasporto e utensili continuano durante il giorno, finché ci sono spazio e materiali.' : ' In Classica ogni trasporto e manufatto richiede un nuovo ordine.'} Il Falò richiede cinque legna reali.`;
  } else if (!fire) {
    title = hearth ? 'Riaccendi il Falò' : 'Manca il combustibile';
    text = hearth
      ? 'Serve una legna al campo per riaccendere il focolare con Conservare + Fuoco. Una guardia presente lo protegge dalle tempeste; controlla le scorte anche prima del cambio di stagione.'
      : 'Porta cinque legna al campo per accendere il primo Falò. Le risorse lasciate accanto agli alberi sono ancora da trasportare.';
  } else if (state.time < 180) {
    title = 'Prepara il primo insegnamento';
    text = guided
      ? 'Puoi tramandare già ora: apri il Falò, prepara una breve lezione con legna consegnata e usa l’Attenzione per formare un nuovo custode. Il pannello indica insegnante e allievo. Non aspettare che l’anziano sia in pericolo.'
      : 'Apri il Falò per scegliere una parola e un nuovo custode. Fai mangiare il gruppo prima del consiglio stagionale: la fame riduce l’Attenzione. Conservare + Fuoco assegna una guardia contro le tempeste.';
    action = 'teach';
  } else if (state.time >= 270) {
    title = 'Attraversare l’inverno';
    text =
      'Le bacche sono gelate fino alla primavera: usa le scorte consegnate o la carne di animali abbattuti. Tieni il gruppo dentro il calore del Falò durante la notte, mantieni legna di riserva e tramanda le parole.';
  } else {
    title = 'Scorte prima del gelo';
    text =
      'Porta cibo prima che il gelo blocchi le bacche; esplora altre pianure se quelle vicine finiscono. Tieni legna per alimentare il Falò e assegna una guardia con Conservare + Fuoco contro le tempeste. Ripari e pelli proteggono dal freddo.' +
      (guided && hasWord(state, 'V_05')
        ? ' In Guidata, Portare Preda ripete i viaggi sullo stesso nodo durante il giorno.'
        : '');
  }
  const autumn = state.time >= 180 && !fire;
  return (
    <aside
      className={`opening-guide ${autumn || cold || starving ? 'urgent' : ''} ${expanded ? 'expanded' : ''}`}
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
          {guided && ' In Guidata le tormente possono arrivare dal secondo inverno.'}
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
      {action === 'spark' && personal?.sparkId && onSpark && (
        <button className="text-button" onClick={() => onSpark(personal.sparkId!)}>
          <Sparkles size={14} /> Scopri Io
        </button>
      )}
      {action === 'teach' && onTeach && (
        <button className="text-button" onClick={onTeach}>
          <Flame size={14} /> Tramanda
        </button>
      )}
    </aside>
  );
}
