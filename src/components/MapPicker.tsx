import { RotateCcw } from 'lucide-react';
import './MapPicker.css';

export type MapChoice = 'seed-zero' | 'random';
const MAX_SEED = 4294967295;

export function freshMapSeed(previous?: number) {
  const value = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * (MAX_SEED + 1));
  return value === previous ? (value + 1) >>> 0 : value;
}

export function parseMapSeed(value: string) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const seed = Number(text);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= MAX_SEED ? seed : undefined;
}

export function mapSeedValid(value: string) {
  return value.trim() === '' || parseMapSeed(value) !== undefined;
}

export function MapPicker({
  value,
  seed,
  onChange,
  onSeedChange,
  onNewSeed,
}: {
  value: MapChoice;
  seed: string;
  onChange: (mode: MapChoice) => void;
  onSeedChange: (seed: string) => void;
  onNewSeed: () => void;
}) {
  const invalid = value === 'random' && !mapSeedValid(seed);
  return (
    <div className="map-picker" role="group" aria-label="Mappa della nuova partita">
      <div className="map-picker-heading">La valle</div>
      <div className="map-picker-options">
        <button type="button" aria-pressed={value === 'random'} onClick={() => onChange('random')}>
          <strong>Casuale</strong>
          <small>
            Una valle diversa, con nuovi paesaggi e una nuova disposizione di risorse, animali e
            villaggi.
          </small>
        </button>
        <button
          type="button"
          aria-pressed={value === 'seed-zero'}
          onClick={() => onChange('seed-zero')}
        >
          <strong>Seed Zero</strong>
          <small>
            La valle originaria: paesaggi, risorse e villaggi nelle posizioni dello scenario
            iniziale.
          </small>
        </button>
      </div>
      {value === 'random' && (
        <div className="map-seed-control">
          <label htmlFor="new-map-seed">Seed della mappa</label>
          <div className="map-seed-entry">
            <input
              id="new-map-seed"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              placeholder="Automatico: una nuova mappa"
              value={seed}
              onChange={(event) => onSeedChange(event.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'map-seed-error' : 'map-seed-hint'}
            />
            <button type="button" className="text-button" onClick={onNewSeed}>
              <RotateCcw size={14} /> Nuovo seed
            </button>
          </div>
          {invalid ? (
            <small id="map-seed-error" className="map-seed-error" role="alert">
              Inserisci un numero intero tra 0 e 4294967295.
            </small>
          ) : (
            <small id="map-seed-hint">
              Il seed è il codice della valle: usa lo stesso numero per ritrovarla. Lascia il campo
              vuoto per una nuova mappa.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
