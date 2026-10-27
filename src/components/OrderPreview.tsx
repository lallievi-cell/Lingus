import { useMemo } from 'react';
import { Eye, TriangleAlert } from 'lucide-react';
import { getOrderPreview, previewResourceLabel } from '../game/orderPreview';
import { hasWord } from '../game/runtime';
import type { GameState, Target } from '../game/types';
import { visibleUnitName } from './unitReadability';
import { entityTargetPresentation } from './targetPresentation';
import { BUILDING_SPECS } from '../game/content';
import { isVisibleAt } from './mapDrawing';
import { visiblePerson } from './TribeEvents';
import './QualityOfLife.css';

export function OrderPreview({
  state,
  sentence,
  target,
  executorId,
  groupAnchor,
}: {
  state: GameState;
  sentence: string[];
  target?: Target;
  executorId?: string;
  groupAnchor?: Target;
}) {
  const preview = useMemo(
    () =>
      sentence.length >= 2
        ? getOrderPreview(state, sentence, target, executorId, groupAnchor)
        : null,
    [state, sentence, target, executorId, groupAnchor],
  );
  if (!preview) return null;
  const named = hasWord(state, 'S_02'),
    numbered = hasWord(state, 'O_08');
  const people = preview.unitIds.map((id) => state.units.find((u) => u.id === id)!).filter(Boolean);
  const destinations = [
    ...new Set(
      preview.destinations.map((destination) => {
        if (!isVisibleAt(state, destination.x, destination.y))
          return 'Destinazione nelle terre inesplorate';
        const entity = state.entities.find((e) => e.id === destination.id);
        const building = state.buildings.find((b) => b.id === destination.id);
        return entity
          ? (entityTargetPresentation(state, entity)?.label ?? 'Una fonte')
          : building
            ? BUILDING_SPECS[building.kind].label
            : sentence.includes('V_06') || sentence.includes('V_07')
              ? 'Sul posto'
              : Math.hypot(destination.x - state.home.x, destination.y - state.home.y) < 0.1
                ? 'Giaciglio della tribù'
                : 'Punto indicato sulla mappa';
      }),
    ),
  ];
  return (
    <details
      className={`order-preview ${preview.accepted ? 'ready' : 'blocked'}`}
      aria-label="Anteprima dell’ordine"
    >
      <summary aria-label="Dettagli dell’ordine" title="Anteprima: esecutori, costi e requisiti">
        {preview.accepted ? <Eye size={14} /> : <TriangleAlert size={14} />}
        <span className="preview-mobile-label" aria-hidden="true">
          Dettagli
        </span>
        <strong>{preview.accepted ? 'Ordine pronto' : 'Ordine da verificare'}</strong>
        <span>
          {preview.accepted
            ? people.length
              ? `${numbered ? people.length : people.length === 1 ? 'Una persona' : 'Persone selezionate'}${numbered ? (preview.institutional ? ' persone coinvolte' : people.length === 1 ? ' esecutore' : ' esecutori') : ''}${preview.interruptions.length ? ' · sostituisce attività in corso' : ''}`
              : 'Decisione della comunità'
            : 'Apri per capire cosa manca'}
        </span>
      </summary>
      <div className="order-preview-body">
        {!preview.accepted && (
          <p>{numbered ? preview.message : preview.message.replace(/\b\d+(?:[.,]\d+)?\s/g, '')}</p>
        )}
        {people.length > 0 && (
          <p>
            <b>{preview.institutional ? 'Persone coinvolte:' : 'Chi agisce:'}</b>{' '}
            {named
              ? people
                  .slice(0, 8)
                  .map((u) => visibleUnitName(state, u))
                  .join(', ') + (people.length > 8 ? ' e altri' : '')
              : people
                  .slice(0, 8)
                  .map((unit) => visiblePerson(state, unit))
                  .join(', ') + (people.length > 8 ? ' e altri compagni' : '')}
          </p>
        )}
        {preview.accepted && <p>{preview.behaviour}</p>}
        {preview.accepted && destinations.length > 0 && (
          <p>
            <b>Destinazione effettiva:</b> {destinations.join(' · ')}.
          </p>
        )}
        {preview.interruptions.length > 0 && (
          <p className="qol-warning">
            Sostituisce {numbered ? preview.interruptions.length : 'le'} attività già in corso e i
            relativi incarichi salvati.
          </p>
        )}
        {preview.cargoDrops.length > 0 && (
          <p className="qol-warning">
            Il carico trasportato viene lasciato a terra dove si trova la persona. Non sarà
            consegnato automaticamente.
          </p>
        )}
        {(preview.costs.length > 0 || preview.voice > 0 || preview.attention > 0) && (
          <p>
            <b>Costo immediato:</b>{' '}
            {[
              preview.voice ? `${numbered ? preview.voice : 'consuma'} voce` : '',
              preview.attention ? `${numbered ? preview.attention : 'consuma'} attenzione` : '',
              ...preview.costs.map(
                (c) =>
                  `${numbered ? Math.round(c.amount * 10) / 10 : 'consuma'} ${previewResourceLabel(c.resource)}`,
              ),
            ]
              .filter(Boolean)
              .join(' · ')}
            .
          </p>
        )}
        {preview.sideEffects && (
          <p className="qol-warning">
            Anche il tentativo respinto può applicare le sanzioni previste dalle regole della
            comunità.
          </p>
        )}
        <small>
          Situazione attuale: l’ordine viene verificato di nuovo quando premi Pronuncia. I viaggi e
          i cicli successivi dipendono da bisogni, spazio, leggi e dogmi.
        </small>
      </div>
    </details>
  );
}
