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
          <strong>
            Verso{' '}
            {report.nextSeason === 0
              ? 'la primavera'
              : `l’${report.nextName.toLocaleLowerCase('it')}`}
          </strong>
          <small>
            {numbered ? `Tra ${Math.ceil(report.remaining)} s · ` : ''}
            {report.missingUpkeep.length
              ? 'Mancano scorte per la manutenzione'
              : report.coldExposed
                ? 'Riparo da preparare'
                : foodRisk
                  ? 'Serve altro cibo'
                  : armies.length
                    ? 'Controlla le scorte per le truppe'
                    : 'Le scorte attuali sono sufficienti'}
          </small>
        </span>
        <span className="readiness-open">Dettagli</span>
      </summary>
      <div className="readiness-body">
        <p className="qol-assumption">
          Le scorte di oggi basteranno? Controlla cibo, manutenzione e riparo prima che cambi la
          stagione.
        </p>
        <h3>Scorte per gli edifici</h3>
        {!report.upkeep.length && (
          <p>Nessun edificio richiede scorte al prossimo cambio di stagione.</p>
        )}
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
                ? 'già disponibili'
                : `da procurare: ${Object.entries(missing)
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
            Alla fine dell’inverno il bestiame avrà bisogno di cibo vegetale. Tienine da parte:
            carne e cibo cotto non sostituiscono il mangime, e una parte dei vegetali può andare
            perduta prima di allora.
          </p>
        )}
        <h3>Quanto durerà il cibo</h3>
        {armies.length > 0 && (
          <div className="raw-food-warning">
            <TriangleAlert size={14} />
            <div>
              <strong>Le truppe hanno bisogno di scorte a parte</strong>
              <p>
                La stima riguarda solo i civili. Prima del cambio di stagione, assicurati di avere
                anche il cibo e le monete necessari ai battaglioni.
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
              ? `autonomia stimata: circa ${Math.floor(entry.seconds)} s, senza contare la carne cruda.`
              : entry.sufficient
                ? 'il cibo vegetale e la carne cotta nelle scorte dovrebbero bastare fino alla fine della prossima stagione.'
                : 'il cibo vegetale e la carne cotta nelle scorte non bastano fino alla fine della prossima stagione. Procurane altro.'}
          </p>
        ))}
        <p className="qol-assumption">
          La stima copre il resto di questa stagione e tutta la prossima. Restrizioni alimentari,
          sprechi e tempo necessario a raggiungere le scorte possono far durare il cibo meno del
          previsto.
        </p>
        {report.rawMeat > 0 && (
          <div className="raw-food-warning">
            <TriangleAlert size={14} />
            <div>
              <strong>La carne cruda è un rischio</strong>
              <p>
                Se manca cibo cotto, viene mangiata prima dei vegetali. Ogni pasto può causare
                malattia e perdita di salute: cuocila quando puoi.
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
            <h3>Al riparo dal freddo</h3>
            <p className={report.coldExposed ? 'qol-warning' : ''}>
              {report.coldExposed
                ? numbered
                  ? `${report.coldExposed} ${report.coldExposed === 1 ? 'persona rischia' : 'persone rischiano'} di soffrire il freddo al giaciglio nelle notti della prossima stagione.`
                  : 'Nelle notti della prossima stagione il giaciglio non proteggerà tutti dal freddo.'
                : 'Con i ripari attuali, al giaciglio la tribù dovrebbe riuscire a mantenersi al caldo nelle notti della prossima stagione.'}
            </p>
            <p className="qol-assumption">
              Il riparo protegge solo chi lo raggiunge. Allontanarsi dal fuoco o trovarsi in una
              tormenta può rendere il freddo pericoloso anche con un Falò acceso.
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
        <details className="readiness-explanation">
          <summary>Come viene calcolata la stima</summary>
          <p>
            La stima del cibo usa le scorte già consegnate e sottrae i consumi degli edifici e le
            perdite previste al cambio di stagione. Per mantenere i falò dell’accampamento conta
            anche il legno a terra nelle vicinanze. Raccolti e consegne future, nascite e disastri
            non sono inclusi. Il riparo viene valutato al centro del giaciglio, con i fuochi e gli
            edifici che possono essere mantenuti con le risorse disponibili.
          </p>
        </details>
      </div>
    </details>
  );
}
