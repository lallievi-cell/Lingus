import { Flame, MapPin, Sprout, TriangleAlert } from 'lucide-react';
import { BUILDING_SPECS, RESOURCE_SPECS } from '../game/content';
import { getSeasonReadiness } from '../game/seasonReadiness';
import { hasWord } from '../game/runtime';
import { cognitiveSlots } from '../game/grammar';
import type { GameState, Resource, Target } from '../game/types';
import './QualityOfLife.css';

export function SeasonReadiness({
  state,
  onFocus,
  onCompose,
  onRecipes,
  expanded = false,
}: {
  state: GameState;
  onFocus: (target: Target) => void;
  onCompose: (words: string[], target?: Target) => void;
  onRecipes: () => void;
  expanded?: boolean;
}) {
  const report = getSeasonReadiness(state),
    numbered = hasWord(state, 'O_08');
  const foodRisk = report.food.some((entry) => !entry.sufficient);
  const armies = state.battalions.filter((army) => army.factionId === 'player' && army.hp > 0);
  const risk =
    report.missingUpkeep.length > 0 || foodRisk || report.coldExposed > 0 || armies.length > 0;
  const cookingPhrase = ['S_01', 'V_07', 'O_04', 'O_05'];
  const canCook =
    cookingPhrase.length <= cognitiveSlots(state) &&
    cookingPhrase.every((id) => hasWord(state, id));
  return (
    <details
      className={`season-readiness ${risk ? 'needs-attention' : ''}`}
      aria-label="Preparazione alla prossima stagione"
      open={expanded || undefined}
    >
      <summary>
        <Sprout size={16} />
        <span>
          <strong>Verso {report.nextName}</strong>
          <small>
            {numbered ? `Cambio tra ${Math.ceil(report.remaining)}s · ` : ''}
            {report.missingUpkeep.length
              ? 'Manutenzioni da coprire'
              : report.coldExposed
                ? 'Riparo da preparare'
                : foodRisk
                  ? 'Scorte alimentari da rinforzare'
                  : armies.length
                    ? 'Verifica anche il mantenimento militare'
                    : 'Scorte e manutenzione da sorvegliare'}
          </small>
        </span>
        <span className="readiness-open">Dettagli</span>
      </summary>
      <div className="readiness-body">
        <p className="qol-assumption">
          Stima prudente sulle scorte già consegnate: riserva i costi del prossimo cambio e applica
          il marciume della stagione che finisce. Non anticipa raccolti, consegne, nuove nascite o
          disastri.
        </p>
        <h3>Manutenzione degli edifici al prossimo cambio</h3>
        {!report.upkeep.length && <p>Nessun costo stagionale per gli edifici completati.</p>}
        {report.upkeep.map(({ building, cost, missing, payable, scope }) => (
          <div className={`readiness-row ${payable ? '' : 'qol-warning'}`} key={building.id}>
            <strong>
              {BUILDING_SPECS[building.kind].label}
              {state.urbanized ? ` · ${scope}` : ''}
            </strong>
            <span>
              {Object.entries(cost)
                .map(([r, amount]) =>
                  `${numbered ? amount : ''} ${r === 'food' ? 'vegetali' : RESOURCE_SPECS[r as Resource].label.toLocaleLowerCase('it')}`.trim(),
                )
                .join(' · ')}{' '}
              —{' '}
              {payable
                ? 'coperta con le scorte attuali'
                : `mancano ${Object.entries(missing)
                    .map(([r, amount]) =>
                      `${numbered ? Math.ceil(amount!) : ''} ${r === 'food' ? 'vegetali' : RESOURCE_SPECS[r as Resource].label.toLocaleLowerCase('it')}`.trim(),
                    )
                    .join(', ')}`}
            </span>
            {!payable && (
              <button className="text-button" onClick={() => onFocus(report.targetOf(building))}>
                <MapPin size={12} /> Mostra edificio
              </button>
            )}
          </div>
        ))}
        {report.unprotectedPens.length > 0 && (
          <p className="qol-assumption">
            Il bestiame richiede mangime vegetale alla fine dell’inverno. Carne e cibo cotto non
            pagano questo costo; proteggi i vegetali anche dal consumo e dal marciume dei cambi
            precedenti.
          </p>
        )}
        <h3>Cibo e autonomia</h3>
        {armies.length > 0 && (
          <div className="raw-food-warning">
            <TriangleAlert size={14} />
            <div>
              <strong>Il mantenimento delle truppe è separato</strong>
              <p>
                Questa autonomia riguarda la popolazione civile. Il cibo e le monete dovuti ai
                battaglioni non sono riservati nella stima: prima del cambio controlla anche gli
                eserciti.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  onFocus({ type: 'battalion', id: armies[0].id, x: armies[0].x, y: armies[0].y })
                }
              >
                Mostra un battaglione
              </button>
            </div>
          </div>
        )}
        {report.food.map((entry) => (
          <p className={entry.sufficient ? '' : 'qol-warning'} key={entry.id}>
            <b>{entry.label}:</b>{' '}
            {numbered
              ? `circa ${Math.floor(entry.seconds)}s di nutrimento senza carne cruda, dopo i costi e il marciume stimati.`
              : entry.sufficient
                ? 'le scorte non crude offrono un margine teorico fino alla fine della prossima stagione.'
                : 'le sole scorte non crude non offrono margine fino alla fine della prossima stagione.'}
          </p>
        ))}
        <p className="qol-assumption">
          Il fabbisogno include il tempo rimasto e tutta la prossima stagione. Distanze, diete,
          accesso alle scorte e sprechi dei pasti possono ridurre l’autonomia effettiva.
        </p>
        {report.rawMeat > 0 && (
          <div className="raw-food-warning">
            <TriangleAlert size={14} />
            <div>
              <strong>La carne cruda è un rischio</strong>
              <p>
                Viene mangiata prima dei vegetali quando manca cibo cotto. Può causare malattia e
                ferite a ogni pasto.
              </p>
              {canCook && (
                <button className="text-button" onClick={() => onCompose(cookingPhrase)}>
                  Prepara cottura
                </button>
              )}
            </div>
          </div>
        )}
        {!state.urbanized && (
          <>
            <h3>Riparo al giaciglio</h3>
            <p className={report.coldExposed ? 'qol-warning' : ''}>
              {report.coldExposed
                ? numbered
                  ? `${report.coldExposed} persone perderebbero calore al giaciglio nella prossima notte stagionale.`
                  : 'Il riparo attuale non basta a mantenere il calore di tutti nella prossima notte stagionale.'
                : 'Il punto del giaciglio può mantenere il calore nella normale notte della prossima stagione.'}
            </p>
            <p className="qol-assumption">
              Valutato al centro del campo con fuochi e ripari attuali che possono pagare la
              manutenzione. Il calore dipende dai raggi reali: allontanarsi o una tormenta cambia il
              rischio.
            </p>
            <button
              className="text-button"
              onClick={() => onFocus({ type: 'point', ...state.home })}
            >
              <Flame size={12} /> Mostra giaciglio
            </button>
          </>
        )}
        <button className="text-button" onClick={onRecipes}>
          Consulta le costruzioni conosciute
        </button>
      </div>
    </details>
  );
}
