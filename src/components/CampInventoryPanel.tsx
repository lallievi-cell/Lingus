import {
  Apple,
  Coins,
  CookingPot,
  Drumstick,
  Gem,
  Hammer,
  Layers,
  MapPin,
  Mountain,
  MoveUpRight,
  PackageCheck,
  Sprout,
  Swords,
  TreePine,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { hasWord } from '../game/runtime';
import type { GameState, Resource } from '../game/types';
import { describeStockQuantity, getCampStockCapacity, getInventoryEntries } from './campInventory';
import './CampInventoryPanel.css';

const resourceIcons: Record<Resource, LucideIcon> = {
  food: Apple,
  meat: Drumstick,
  cooked: CookingPot,
  wood: TreePine,
  stone: Mountain,
  pelt: Layers,
  seed: Sprout,
  ore: Gem,
  ingot: Layers,
  tool: Hammer,
  spear: MoveUpRight,
  pottery: CookingPot,
  metalArms: Swords,
  coin: Coins,
};

export function CampInventoryPanel({
  state,
  onFocusCamp,
}: {
  state: GameState;
  onFocusCamp: () => void;
}) {
  const numbered = hasWord(state, 'O_08');
  const entries = getInventoryEntries(state);
  const capacities = getCampStockCapacity(state);
  const delivered = entries.some((entry) => entry.amount > 0);
  const hasIncoming = entries.some((entry) => entry.incoming > 0);
  return (
    <div className="camp-inventory">
      <div className="camp-inventory-intro">
        <span className="camp-inventory-seal" aria-hidden="true">
          <PackageCheck size={24} />
        </span>
        <div>
          <h2>{state.urbanized ? 'Le scorte della capitale' : 'Le scorte della tribù'}</h2>
          <p>
            {delivered
              ? 'Queste risorse sono già consegnate e disponibili.'
              : state.urbanized
                ? 'Nella capitale non ci sono scorte disponibili.'
                : 'Al campo non ci sono scorte disponibili.'}{' '}
            {hasIncoming
              ? 'I carichi in arrivo sono indicati a parte.'
              : 'Le risorse rimaste sul terreno vanno ancora raccolte e portate qui.'}
          </p>
          {state.urbanized && (
            <p>Qui vedi solo le scorte della capitale. Le altre città hanno depositi propri.</p>
          )}
        </div>
      </div>

      <div className="camp-inventory-list-heading">
        <h3>{state.urbanized ? 'Già nella capitale' : 'Già al campo'}</h3>
        <button className="camp-inventory-focus" onClick={onFocusCamp}>
          <MapPin size={16} aria-hidden="true" />
          {state.urbanized ? 'Mostra capitale' : 'Mostra scorte'}
        </button>
      </div>
      <dl className="camp-inventory-list" aria-label="Scorte disponibili">
        {entries.map((entry) => {
          const Icon = resourceIcons[entry.resource];
          return (
            <div
              className={`camp-inventory-row${entry.amount > 0 ? '' : ' is-empty'}`}
              key={entry.resource}
              data-resource={entry.resource}
            >
              <dt>
                <span className={`camp-inventory-icon resource-${entry.resource}`}>
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span>{entry.label}</span>
              </dt>
              <dd>
                <span className="camp-inventory-quantity">{entry.quantity}</span>
                <span className="camp-inventory-level" aria-hidden="true">
                  {[1, 2, 3].map((level) => (
                    <i key={level} className={level <= entry.level ? 'filled' : ''} />
                  ))}
                </span>
                {entry.incoming > 0 && (
                  <span className="camp-inventory-incoming">
                    <Truck size={13} aria-hidden="true" />
                    In arrivo: {describeStockQuantity(entry.incoming, numbered)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      <section className="camp-inventory-capacity" aria-label="Spazio per le scorte">
        <h3>
          <Warehouse size={17} aria-hidden="true" /> Dove conserviamo le risorse
        </h3>
        <p>
          {capacities.length === 1
            ? 'Senza magazzini, alimenti e materiali condividono lo spazio al campo.'
            : 'Alimenti e materiali hanno spazi separati. Dove manca un deposito, resta lo spazio a terra.'}
        </p>
        {capacities.map((pool) => {
          const occupied = pool.stored + pool.reserved;
          const ratio = occupied / pool.capacity;
          const status =
            pool.available <= 0
              ? 'Pieno'
              : ratio >= 0.8
                ? 'Quasi pieno'
                : ratio >= 0.5
                  ? 'C’è ancora spazio'
                  : 'Molto spazio libero';
          const band = occupied === 0 ? 0 : ratio < 0.5 ? 1 : ratio < 0.8 ? 2 : 3;
          return (
            <div
              key={pool.id}
              data-capacity={pool.id}
              className={`camp-inventory-capacity-pool${pool.available <= 0 ? ' is-full' : ''}`}
            >
              <div className="camp-inventory-capacity-heading">
                <strong>{pool.label}</strong>
                <span>{status}</span>
              </div>
              <span className="camp-inventory-capacity-bands" aria-hidden="true">
                {[1, 2, 3].map((level) => (
                  <i key={level} className={level <= band ? 'filled' : ''} />
                ))}
              </span>
              {numbered && (
                <p className="camp-inventory-capacity-numbers">
                  {describeStockQuantity(pool.stored, true)} consegnati
                  {pool.reserved > 0 &&
                    ` + ${describeStockQuantity(pool.reserved, true)} riservati ai carichi`}
                  {' · '}
                  {describeStockQuantity(pool.available, true)} liberi su {pool.capacity}
                </p>
              )}
            </div>
          );
        })}
        <p className="camp-inventory-note">
          I carichi già raccolti occupano spazio, ma diventano disponibili solo alla consegna.
          {entries.some((entry) => entry.resource === 'coin') &&
            ' La moneta non occupa spazio nei depositi.'}
        </p>
      </section>
    </div>
  );
}
