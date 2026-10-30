import { MapPin } from 'lucide-react';
import { BUILDING_SPECS } from '../game/content';
import { hasWord, isPlayerBuilding } from '../game/runtime';
import { getBuildingWorkStatus, getUnitWorkStatus } from '../game/workDiagnostics';
import type { Building, GameState, Target, Unit } from '../game/types';
import './QualityOfLife.css';

export function UnitWorkStatus({
  state,
  unit,
  compact = false,
  onFocus,
}: {
  state: GameState;
  unit: Unit;
  compact?: boolean;
  onFocus?: (target: Target) => void;
}) {
  const status = getUnitWorkStatus(state, unit);
  if (compact)
    return (
      <span className={`person-work-status status-${status.tone}`} title={status.detail}>
        {status.category === 'young' ? 'Può imparare · non lavora' : status.title}
        {status.assignment ? ` · ${status.assignment.label}` : ''}
      </span>
    );
  return (
    <div className={`work-status status-${status.tone}`} aria-label="Dove e perché lavora">
      <strong>{status.title}</strong>
      <p>{status.detail}</p>
      {status.assignment && (
        <span>
          Incarico {status.assignment.state === 'suspended' ? 'sospeso' : 'assegnato'}:{' '}
          {status.assignment.label}.
        </span>
      )}
      {status.target && onFocus && (
        <button className="text-button" onClick={() => onFocus(status.target!)}>
          <MapPin size={12} /> Mostra destinazione
        </button>
      )}
    </div>
  );
}

export function BuildingWorkStatus({
  state,
  building,
  onFocus,
  onCompose,
}: {
  state: GameState;
  building: Building;
  onFocus?: (target: Target) => void;
  onCompose?: (tokens: string[], target?: Target) => void;
}) {
  const status = getBuildingWorkStatus(state, building);
  const numbered = hasWord(state, 'O_08');
  const spec = BUILDING_SPECS[building.kind];
  const phrase = building.kind === 'campfire' ? ['S_01', 'V_05', 'O_05'] : ['S_01', ...spec.recipe];
  const canAssign =
    !status.urban &&
    spec.workers > 0 &&
    isPlayerBuilding(state, building) &&
    building.hp > 0 &&
    building.completed !== false &&
    phrase.every((id) => hasWord(state, id));
  const destination: Target = { type: 'building', id: building.id, x: building.x, y: building.y };
  return (
    <section className="work-status building-work-status" aria-label={`Attività: ${spec.label}`}>
      <strong>{spec.label}</strong>
      {status.urban ? (
        <p>
          Il lavoro è affidato ai gruppi sociali della città.{' '}
          {status.observedEfficiency !== undefined
            ? `Rendimento dell’ultima stagione: ${numbered ? `${Math.round(status.observedEfficiency * 100)}%` : status.observedEfficiency >= 1 ? 'pieno' : status.observedEfficiency > 0 ? 'parziale' : 'nessuno'}.`
            : 'Il rendimento sarà visibile dopo il primo lavoro stagionale.'}
        </p>
      ) : (
        status.required > 0 && (
          <p>
            {numbered
              ? `${status.contributing}/${status.required} al lavoro · ${status.assigned} assegnati · ${status.suspended} in pausa.`
              : status.contributing >= status.required
                ? 'Postazione coperta.'
                : status.contributing > 0
                  ? 'Postazione coperta solo in parte.'
                  : 'Nessun addetto sta lavorando in questo momento.'}
          </p>
        )
      )}
      {status.reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
      {!status.reasons.length && status.required === 0 && (
        <p>
          {status.healthy
            ? 'Non richiede addetti per funzionare.'
            : 'Controlla manutenzione e integrità.'}
        </p>
      )}
      <div className="qol-actions">
        {onFocus && (
          <button className="text-button" onClick={() => onFocus(destination)}>
            <MapPin size={12} /> Inquadra
          </button>
        )}
        {canAssign && onCompose && (
          <button className="text-button" onClick={() => onCompose(phrase, destination)}>
            Prepara incarico
          </button>
        )}
      </div>
    </section>
  );
}
