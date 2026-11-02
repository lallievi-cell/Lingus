import { Crown, Landmark } from 'lucide-react';
import type { GameState, Spark } from '../game/types';
import { getLifeStage } from '../game/demography';
import { visibleUnitName } from './unitReadability';
import './DiscoveryConsequence.css';

/** Explain irreversible social consequences before the player resolves the intuition. */
export function DiscoveryConsequence({ state, spark }: { state: GameState; spark: Spark }) {
  const person = state.units.find((unit) => unit.id === spark.unitId && unit.hp > 0);
  if (spark.wordId === 'S_07' && person && state.government !== 'monarchy')
    return (
      <aside className="discovery-consequence" aria-label="Conseguenza dell’intuizione">
        <Crown size={22} aria-hidden="true" />
        <div>
          <strong>Una scelta per tutta la tribù</strong>
          <p>
            Comprendere questa intuizione instaura subito una monarchia. Il potere sarà affidato a{' '}
            {visibleUnitName(state, person)}.
          </p>
          {getLifeStage(person) === 'elder' && (
            <p>
              È già in età avanzata: preparati anche alla successione e conserva il sapere che
              custodisce.
            </p>
          )}
          <small>
            Puoi chiudere la Scintilla e preparare la comunità prima di risolverla. L’intuizione
            conserva la propria scadenza.
          </small>
        </div>
      </aside>
    );
  if (spark.wordId === 'S_09' && !state.urbanized)
    return (
      <aside className="discovery-consequence" aria-label="Conseguenza dell’intuizione">
        <Landmark size={22} aria-hidden="true" />
        <div>
          <strong>La comunità cambia scala</strong>
          <p>
            Quando la popolazione sarà sufficiente, questa conoscenza permetterà di organizzare la
            società in città. Lavoro e governo passeranno ai gruppi sociali degli insediamenti.
          </p>
          <small>
            Le risorse e le istituzioni continuano ad avere costi reali. Preparati a mantenere una
            comunità più grande.
          </small>
        </div>
      </aside>
    );
  return null;
}
