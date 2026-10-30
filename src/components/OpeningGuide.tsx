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
      ? 'Raduna il gruppo vicino al Falò. Ripari e pelli aiutano a mantenere il calore; durante una tormenta il solo fuoco può non bastare.'
      : hearth
        ? 'Riporta il gruppo al campo e consegna legno per riaccendere il Falò. I materiali lasciati lontano devono ancora essere trasportati.'
        : 'Serve una fonte di calore: prepara il primo Falò con legna consegnata e l’intuizione del Fuoco. Ripari e pelli proteggono dal freddo; il giaciglio da solo non scalda.';
  } else if (starving) {
    title = 'Prima viene il cibo';
    text =
      'Interrompi il lavoro di chi ha fame. Componi Gruppo · Mangiare e indica bacche o una carcassa per mangiare sul posto. Al campo si possono consumare le scorte già consegnate.';
  } else if (personal?.ready && onSpark) {
    title = 'Un’esperienza personale';
    text = personal.hint + ' Non serve allontanare un compagno dal gruppo.';
    action = 'spark';
  } else if (!hasWord(state, 'O_03') || !hasWord(state, 'O_02')) {
    title = hasWord(state, 'O_03') ? 'Prova anche una roccia' : 'Comincia da un albero';
    text = hasWord(state, 'O_03')
      ? 'Componi Gruppo · Colpire e indica una roccia vicina. Le schegge resteranno a terra e il lavoro potrà far nascere una Scintilla. Al calare del buio torna al giaciglio.'
      : 'Componi Gruppo · Colpire, scegli un albero vicino e premi Pronuncia. Il legno tagliato resterà a terra. Prova anche su una roccia e segui le prime Scintille.';
  } else if (!hasWord(state, 'O_01') && !hasWord(state, 'S_02')) {
    title = 'Rientrare al calare del buio';
    text = `Quando arriva il buio usa Raduna al campo: è un ordine di Andare che costa una Voce. Camminare al buio fa comprendere Notte. Dormire vicini per ${guided ? 'una notte' : 'due notti'} può far nascere la Scintilla di Qui.${personal ? ' Per Io conta anche un’esperienza personale: un compagno che mangia di propria iniziativa mentre gli altri non hanno fame può avere l’intuizione, senza essere isolato.' : ''}`;
  } else if (!hasWord(state, 'V_04')) {
    title = 'Mangiare prima di trasportare';
    text =
      'Gruppo · Mangiare su un cespuglio fa mangiare sul posto. Apri le Scintille: scoprendo Portare imparerai a riportare cibo e materiali al campo.';
  } else if (!fire && !hasWord(state, 'O_05')) {
    title = 'Prepara il primo fuoco';
    text = `Porta legno e pietra al campo. Poi componi Gruppo · Scheggiare · Pietra: fabbricare utensili può far nascere la Scintilla del Fuoco.${guided ? ' In Guidata gli addetti ripetono trasporti e fabbricazione di utensili durante il giorno, finché ci sono risorse e spazio.' : ' In Classica ogni viaggio o manufatto richiede un nuovo ordine.'} Per accendere il primo Falò servono cinque unità di legno.`;
  } else if (!fire) {
    title = hearth ? 'Riaccendi il Falò' : 'Manca il combustibile';
    text = hearth
      ? 'Riaccendi il focolare con Conservare · Fuoco: serve un’unità di legno al campo. Una guardia presente lo protegge dalle tempeste. Tieni altre scorte per il cambio di stagione.'
      : 'Porta cinque unità di legno al campo per accendere il primo Falò. Il legno lasciato accanto agli alberi deve ancora essere trasportato.';
  } else if (state.time < 180) {
    title = 'Prepara il primo insegnamento';
    text = guided
      ? 'Puoi tramandare già ora: apri il Falò, prepara una breve lezione con legna consegnata e usa l’Attenzione per formare un nuovo custode. Il pannello indica insegnante e allievo. Non aspettare che l’anziano sia in pericolo.'
      : 'Apri il Falò per scegliere una parola e un nuovo custode. Fai mangiare il gruppo prima del consiglio stagionale: la fame riduce l’Attenzione. Conservare · Fuoco assegna una guardia contro le tempeste.';
    action = 'teach';
  } else if (state.time >= 270) {
    title = 'Attraversare l’inverno';
    text =
      'Le bacche sono gelate fino alla primavera: usa le scorte consegnate o la carne di animali abbattuti. Tieni il gruppo dentro il calore del Falò durante la notte, mantieni legna di riserva e tramanda le parole.';
  } else {
    title = 'Scorte prima del gelo';
    text =
      'Porta cibo prima che il gelo blocchi le bacche; esplora altre pianure se quelle vicine finiscono. Tieni legna per alimentare il Falò e assegna una guardia con Conservare · Fuoco contro le tempeste. Ripari e pelli proteggono dal freddo.' +
      (guided && hasWord(state, 'V_05')
        ? ' In Guidata, dopo aver scoperto Conservare, Portare · Preda ripete i viaggi dalla stessa fonte di cibo durante il giorno.'
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
