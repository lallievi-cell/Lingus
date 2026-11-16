import { BOAT_BUILD_COST } from '../game/maritime';
import { hasWord } from '../game/runtime';
import { isWorldPointRevealed } from '../game/worldDimensions';
import type { GameState, Target } from '../game/types';
import { describeResourceAmount } from './semanticReadability';
import {
  getBoatPreparations,
  getBoatPresentation,
  maritimePreparation,
  type MaritimePreparation,
} from './maritimePresentation';
import './BoatPanel.css';

export interface BoatPanelProps {
  state: GameState;
  target: Target;
  onPrepare?: (tokens: string[], target?: Target, groupAnchor?: Target) => void;
}

export function BoatPanel({ state, target, onPrepare }: BoatPanelProps) {
  if (state.mapGeneration?.maritimeRules !== 1) return null;
  const numbered = hasWord(state, 'O_08');
  const button = (action: MaritimePreparation) => (
    <div className="boat-preparation" key={action.id}>
      <button
        type="button"
        disabled={!!action.issue || !onPrepare}
        onClick={() => onPrepare?.([...action.tokens], action.target, action.groupAnchor)}
      >
        {action.label}
      </button>
      {action.issue && <small>{action.issue}</small>}
    </div>
  );
  if (target.type === 'building') {
    const harbor = state.buildings.find(
      (building) => building.id === target.id && building.kind === 'harbor' && building.hp > 0,
    );
    if (!harbor || !isWorldPointRevealed(state, harbor.x, harbor.y)) return null;
    const owned =
      !harbor.cityId ||
      state.cities.some((city) => city.id === harbor.cityId && city.factionId === 'player');
    if (!owned || harbor.completed === false) return null;
    const unfinished = state.boats?.find(
      (boat) => boat.harborId === harbor.id && boat.status === 'building',
    );
    const action = maritimePreparation(
      state,
      {
        id: 'build',
        label: unfinished ? 'Prepara ripresa della barca' : 'Prepara una barca',
        tokens: ['S_01', 'V_06', 'O_03', 'O_01'],
        target: { type: 'building', id: harbor.id, x: harbor.x, y: harbor.y },
        groupAnchor: { type: 'point', x: harbor.x, y: harbor.y },
      },
      !harbor.active ? 'L’approdo deve essere attivo.' : undefined,
    );
    return (
      <details className="boat-panel">
        <summary>Barche e traversate</summary>
        <div className="boat-panel-content">
          <p>
            {unfinished
              ? 'Lo scafo conserva il lavoro e i materiali già impiegati. Un nuovo artigiano può riprenderlo.'
              : `Una barca richiede ${describeResourceAmount('wood', BOAT_BUILD_COST.wood ?? 0, numbered).toLocaleLowerCase('it')} e ${describeResourceAmount('tool', BOAT_BUILD_COST.tool ?? 0, numbered).toLocaleLowerCase('it')}. L’artigiano deve raggiungere l’approdo e lavorare sullo scafo.`}
          </p>
          {button(action)}
          <p className="boat-panel-note">Prepara compone le parole. L’ordine parte con Pronuncia.</p>
        </div>
      </details>
    );
  }
  if (target.type !== 'boat') return null;
  const boat = state.boats?.find((item) => item.id === target.id && item.hp > 0);
  if (!boat) return null;
  const presentation = getBoatPresentation(state, boat);
  if (!presentation?.owned) return null;
  const preparations = getBoatPreparations(state, boat);
  return (
    <details className="boat-panel">
      <summary>Equipaggio, carico e ordini</summary>
      <div className="boat-panel-content">
        <dl className="boat-state">
          <div><dt>Equipaggio</dt><dd>{presentation.crew}</dd></div>
          <div><dt>Stiva e carichi personali</dt><dd>{presentation.cargo}</dd></div>
          {presentation.construction && <div><dt>Scafo</dt><dd>{presentation.construction}</dd></div>}
        </dl>
        {presentation.inventory.length > 0 && (
          <dl className="boat-cargo" aria-label="Carico nella barca">
            {presentation.inventory.map((entry) => (
              <div key={entry.resource} data-resource={entry.resource}>
                <dt>{entry.label}</dt><dd>{entry.quantity}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="boat-preparations">{preparations.map(button)}</div>
        <p className="boat-panel-note">
          Prepara compone la frase senza eseguirla. Per navigare scegli poi il mare o una riva osservata e premi Pronuncia. I carichi entrano nelle scorte del campo soltanto dopo la consegna.
        </p>
      </div>
    </details>
  );
}
