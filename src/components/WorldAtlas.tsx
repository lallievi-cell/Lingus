import { useId, useState } from 'react';
import { ArrowRight, Compass, MapPin, Ship, Users } from 'lucide-react';
import { hasWord } from '../game/runtime';
import { getWorldRegionGeometry, type WorldPoint } from '../game/worldGeography';
import { regionProjection } from '../game/worldRuntime';
import { worldBoundaryTargets } from '../game/worldTravel';
import type { GameState, Target } from '../game/types';
import { Modal } from './Modal';
import './WorldAtlas.css';

interface WorldAtlasProps {
  state: GameState;
  selectedTarget: Target | null;
  groupAnchor: Target;
  onClose: () => void;
  onFocus: (regionId: string) => void;
  onPrepare: (tokens: string[], destination?: Target, groupAnchor?: Target) => void;
}

const ringPath = (points: readonly WorldPoint[]) =>
  points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ') + ' Z';

export function worldRegionLabel(state: GameState, x: number, y: number) {
  const world = state.world;
  if (!world) return 'Regione';
  if (world.regions[world.homeRegionId]?.x === x && world.regions[world.homeRegionId]?.y === y)
    return 'Regione delle origini';
  if (hasWord(state, 'O_08')) return `Regione ${x + 1}, ${y + 1}`;
  const vertical = ['settentrionale', 'del centro nord', 'del centro sud', 'meridionale'][y];
  const horizontal = ['a ovest', 'verso ovest', 'verso est', 'a est'][x];
  return `Regione ${vertical} ${horizontal}`;
}

/** Geography is clipped by actual exploration, including within a visited cell. */
function RegionTerrain({ state, x, y }: { state: GameState; x: number; y: number }) {
  const clipId = useId();
  const geometry = getWorldRegionGeometry({ seed: state.world!.seed, regionX: x, regionY: y });
  const revealed = state.sectors.filter((sector) => sector.explored);
  return (
    <svg viewBox="0 0 1000 1000" aria-hidden="true" className="world-atlas-terrain">
      <defs>
        <clipPath id={clipId}>
          {revealed.map((sector) => (
            <rect key={sector.id} x={sector.x * 100} y={sector.y * 100} width="100" height="100" />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="1000" height="1000" className="world-atlas-sea" />
        {geometry.landmasses.map((landmass) => (
          <path
            key={landmass.id}
            d={[ringPath(landmass.points), ...landmass.holes.map(ringPath)].join(' ')}
            fillRule="evenodd"
            className="world-atlas-land"
          />
        ))}
        {state.units
          .filter((unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player'))
          .map((unit) => (
            <circle key={unit.id} cx={unit.x} cy={unit.y} r="24" className="world-atlas-person" />
          ))}
      </g>
    </svg>
  );
}

export function WorldAtlas({
  state,
  selectedTarget,
  groupAnchor,
  onClose,
  onFocus,
  onPrepare,
}: WorldAtlasProps) {
  const world = state.world!;
  const [selectedId, setSelectedId] = useState(world.activeRegionId);
  const active = world.regions[world.activeRegionId];
  const cells = Array.from({ length: world.width * world.height }, (_, index) => {
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    return { id: `${x}:${y}`, x, y };
  });
  const selected = cells.find((cell) => cell.id === selectedId) ?? active;
  const selectedRegion = world.regions[selected.id];
  const selectedState = selectedRegion?.discovered ? regionProjection(state, selected.id) : undefined;
  const adjacent = Math.abs(selected.x - active.x) + Math.abs(selected.y - active.y) === 1;
  const boatSelection = [selectedTarget, groupAnchor].find(
    (target) => target?.type === 'boat' && state.boats?.some(
      (boat) => boat.id === target.id && boat.ownerId === 'player' && boat.hp > 0,
    ),
  );
  const boat = boatSelection ? state.boats?.find((entry) => entry.id === boatSelection.id) : undefined;
  const destinations = adjacent ? worldBoundaryTargets(state, selected.id, boat?.id) : [];
  const destination = destinations[0];
  const needsHere = !hasWord(state, 'O_01');
  const present = selected.id === active.id;
  const pending = world.transfers.filter((transfer) => transfer.to === selected.id);
  const people = selectedState?.units.filter(
    (unit) => unit.hp > 0 && (!unit.factionId || unit.factionId === 'player'),
  );
  return (
    <Modal title="Atlante del mondo" onClose={onClose} className="world-atlas-modal">
      <p className="world-atlas-intro">
        Le coste emergono dove la tribù è passata. Ogni regione conserva persone, scorte e lavori;
        il tempo scorre per tutte.
      </p>
      <div className="world-atlas-grid" role="group" aria-label="Le regioni del mondo">
        {cells.map((cell) => {
          const region = world.regions[cell.id];
          const local = region?.discovered ? regionProjection(state, cell.id) : undefined;
          const current = cell.id === active.id;
          const label = worldRegionLabel(state, cell.x, cell.y);
          return (
            <button
              type="button"
              key={cell.id}
              aria-label={`${label}${current ? ', sulla mappa' : local ? ', visitata' : ', inesplorata'}`}
              aria-pressed={selected.id === cell.id}
              className={`world-atlas-cell ${local ? 'is-known' : 'is-unknown'} ${current ? 'is-current' : ''}`}
              onClick={() => setSelectedId(cell.id)}
            >
              {local && <RegionTerrain state={local} x={cell.x} y={cell.y} />}
              {current ? <MapPin size={18} className="world-atlas-cell-icon" /> : !local ? (
                <span className="world-atlas-unknown-mark" aria-hidden="true">?</span>
              ) : null}
              <span className="world-atlas-cell-label">
                {cell.id === world.homeRegionId ? 'Origini' : current ? 'Qui' : local ? 'Visitata' : 'Ignoto'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="world-atlas-legend"><Compass size={14} /> Nord in alto · una regione, un chilometro</p>
      <section className="world-atlas-detail" aria-label="Regione scelta" aria-live="polite">
        <h3>{worldRegionLabel(state, selected.x, selected.y)}</h3>
        <p>
          {present ? 'Stai osservando questa regione.' : selectedState
            ? 'Un luogo già visitato: puoi osservarlo senza spostare le persone.'
            : 'Un territorio ancora sconosciuto. Il suo aspetto si rivelerà durante il viaggio.'}
        </p>
        {!!people?.length && <p className="world-atlas-presence"><Users size={14} />
          {hasWord(state, 'O_08') ? `${people.length} ${people.length === 1 ? 'compagno presente' : 'compagni presenti'}` : 'La tribù è presente in questa regione.'}
        </p>}
        {pending.length > 0 && <p>Un gruppo è in viaggio verso questa regione.</p>}
        {!present && selectedState && (
          <button className="secondary-button" type="button" onClick={() => onFocus(selected.id)}>
            <MapPin size={15} /> Osserva la regione
          </button>
        )}
        {adjacent && <>
          <p className="world-atlas-travel-mode">
            {boat ? <Ship size={16} /> : <Users size={16} />}
            {boat ? 'Traversata con la barca selezionata e il suo equipaggio.' : 'Viaggio a piedi con il gruppo selezionato.'}
          </p>
          {destination ? <button
            className="primary-button"
            type="button"
            disabled={needsHere}
            onClick={() => onPrepare(
              ['S_01', 'V_01', 'O_01'],
              destination,
              boat ? { type: 'boat', id: boat.id, x: boat.x, y: boat.y } : groupAnchor,
            )}
          >Prepara il viaggio <ArrowRight size={16} /></button> : <p className="world-atlas-travel-issue">
            {boat ? 'Questa barca non ha una rotta navigabile fino al confine.' : 'Nessun adulto può raggiungere a piedi un passaggio su questo confine. Per attraversare il mare, seleziona una barca.'}
          </p>}
          {needsHere && <p className="world-atlas-travel-issue">La tribù deve conoscere «Qui» per preparare questo viaggio.</p>}
          {destination && <small>Prepara compone la frase: il viaggio parte soltanto con Pronuncia, raggiungendo davvero il confine.</small>}
        </>}
        {!present && !adjacent && <p className="world-atlas-travel-issue">
          Per arrivare qui, attraversa una regione confinante alla volta.
        </p>}
      </section>
      <p className="world-atlas-footnote">Le scorte restano nella loro regione. Portale con le persone o caricale su una barca.</p>
    </Modal>
  );
}
