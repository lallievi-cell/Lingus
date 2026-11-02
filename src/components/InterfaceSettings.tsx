import { Contrast, Type } from 'lucide-react';
import type { InterfacePreferences } from './useInterfacePreferences';
import './InterfaceSettings.css';

export function InterfaceSettings({
  value,
  onChange,
}: {
  value: InterfacePreferences;
  onChange: (value: InterfacePreferences) => void;
}) {
  return (
    <section className="interface-settings" aria-label="Leggibilità dell’interfaccia">
      <h3>
        <Type size={18} aria-hidden="true" /> Leggibilità
      </h3>
      <p>Scegli testi e contrasto adatti a te. La mappa conserva i propri colori.</p>
      <label>
        <span>
          <Type size={17} aria-hidden="true" />
          <strong>Dimensione del testo</strong>
        </span>
        <select
          aria-label="Dimensione del testo"
          value={value.textSize}
          onChange={(event) =>
            onChange({ ...value, textSize: event.target.value as InterfacePreferences['textSize'] })
          }
        >
          <option value="standard">Standard</option>
          <option value="large">Grande</option>
        </select>
      </label>
      <label>
        <span>
          <Contrast size={17} aria-hidden="true" />
          <strong>Contrasto dei pannelli</strong>
        </span>
        <select
          aria-label="Contrasto dei pannelli"
          value={value.contrast}
          onChange={(event) =>
            onChange({ ...value, contrast: event.target.value as InterfacePreferences['contrast'] })
          }
        >
          <option value="standard">Standard</option>
          <option value="high">Elevato</option>
        </select>
      </label>
      <p className="interface-settings-note">
        Le preferenze valgono per tutte le storie e vengono conservate in questo browser quando lo
        spazio è disponibile.
      </p>
    </section>
  );
}
