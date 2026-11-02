import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { AudioLevels, AudioPreferences } from '../audio/audioPreferences';
import './AudioSettings.css';

const levels: { key: keyof AudioLevels; label: string; hint: string }[] = [
  { key: 'master', label: 'Volume generale', hint: 'Regola tutti i suoni del gioco.' },
  { key: 'effects', label: 'Azioni ed eventi', hint: 'Lavoro, consegne, Scintille e avvisi.' },
  { key: 'ambience', label: 'Ambiente', hint: 'Vento, vita della valle e crepitio del Falò.' },
  { key: 'music', label: 'Musica', hint: 'Un accompagnamento discreto durante la partita.' },
];

export function AudioSettings({
  value,
  onChange,
  onUnlock,
}: {
  value: AudioPreferences;
  onChange: (value: AudioPreferences) => void;
  onUnlock: () => boolean;
}) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <section className="audio-settings" aria-label="Suoni e musica">
      <h3>
        <Volume2 size={18} aria-hidden="true" /> Suoni e musica
      </h3>
      <label className="audio-settings-toggle">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            if (enabled && !onUnlock()) {
              setUnavailable(true);
              return;
            }
            setUnavailable(false);
            onChange({ ...value, enabled });
          }}
        />
        <span>
          Attiva suoni e musica<small>Le preferenze restano salvate in questo browser.</small>
        </span>
      </label>
      {unavailable && <p role="status">L’audio non è disponibile in questo browser.</p>}
      <div className="audio-settings-levels">
        {levels.map(({ key, label, hint }) => (
          <label key={key}>
            <span>
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(value[key] * 100)}
              aria-label={label}
              aria-valuetext={`${Math.round(value[key] * 100)} per cento`}
              onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) / 100 })}
            />
            <output aria-hidden="true">{Math.round(value[key] * 100)}%</output>
          </label>
        ))}
      </div>
      {!value.enabled && <p>I livelli sono pronti per quando attiverai l’audio.</p>}
    </section>
  );
}
