import { useMemo, useState } from 'react';
import { Check, Users } from 'lucide-react';
import { WORDS } from '../game/content';
import { getOrderPreview } from '../game/orderPreview';
import { hasWord } from '../game/runtime';
import {
  customGroupAnchor,
  customGroupMembers,
  idleTribeAdults,
  isAllAdultsAnchor,
  selectableTribeAdults,
} from '../game/tribeSelection';
import type { GameState, Target } from '../game/types';
import { Modal } from './Modal';
import { UnitWorkStatus } from './WorkStatus';
import { visibleUnitName } from './unitReadability';
import './WorkTeamPicker.css';

export function groupSentence(sentence: readonly string[]) {
  const subject = sentence.findIndex((id) => WORDS[id]?.kind === 'S');
  return subject < 0
    ? ['S_01', ...sentence]
    : sentence.map((id, index) => (index === subject ? 'S_01' : id));
}

export function WorkTeamPicker({
  state,
  selection,
  sentence,
  target,
  onApply,
  onClose,
}: {
  state: GameState;
  selection: Target;
  sentence: string[];
  target?: Target;
  onApply: (anchor: Target, tokens: string[]) => void;
  onClose: () => void;
}) {
  const people = selectableTribeAdults(state);
  const [ids, setIds] = useState<string[]>(() =>
    isAllAdultsAnchor(selection)
      ? people.map((unit) => unit.id)
      : customGroupMembers(state, selection).map((unit) => unit.id),
  );
  const chosen = people.filter((unit) => ids.includes(unit.id));
  const anchor = useMemo(() => customGroupAnchor(state, ids), [state, ids]);
  const tokens = useMemo(() => groupSentence(sentence), [sentence]);
  const preview = useMemo(
    () => (tokens.length >= 2 ? getOrderPreview(state, tokens, target, undefined, anchor) : null),
    [state, tokens, target, anchor],
  );
  const actors = preview?.accepted
    ? people.filter((unit) => preview.unitIds.includes(unit.id))
    : [];
  const numbered = hasWord(state, 'O_08');
  const selectionText = !chosen.length
    ? 'Nessuno selezionato'
    : numbered
      ? `${chosen.length} ${chosen.length === 1 ? 'persona selezionata' : 'persone selezionate'}`
      : chosen.length === 1
        ? 'Una persona selezionata'
        : 'Persone selezionate';

  return (
    <Modal title="Dividi i compiti" className="work-team-picker" onClose={onClose}>
      <span className="eyebrow">UN GRUPPO PER OGNI INCARICO</span>
      <h2>Scegli chi agirà.</h2>
      <p className="modal-intro">
        Scegli più compagni e usa una frase con Gruppo. La selezione è gratuita: il lavoro comincia
        solo quando premi Pronuncia. Gli altri mantengono i propri incarichi.
      </p>
      <div className="work-team-presets" role="group" aria-label="Selezione rapida delle persone">
        <button type="button" onClick={() => setIds(idleTribeAdults(state).map((unit) => unit.id))}>
          Solo senza incarico
        </button>
        <button type="button" onClick={() => setIds(people.map((unit) => unit.id))}>
          Tutti gli adulti
        </button>
        <button type="button" onClick={() => setIds([])}>
          Nessuno
        </button>
      </div>
      <fieldset className="work-team-roster">
        <legend>Persone del gruppo</legend>
        {people.map((unit) => (
          <label key={unit.id} className={ids.includes(unit.id) ? 'is-chosen' : ''}>
            <input
              type="checkbox"
              checked={ids.includes(unit.id)}
              onChange={(event) =>
                setIds((current) =>
                  event.target.checked
                    ? [...current, unit.id]
                    : current.filter((id) => id !== unit.id),
                )
              }
              aria-label={`Includi ${visibleUnitName(state, unit)}`}
            />
            <span>
              <strong>{visibleUnitName(state, unit)}</strong>
              <UnitWorkStatus state={state} unit={unit} compact />
            </span>
            {ids.includes(unit.id) && <Check size={17} aria-hidden="true" />}
          </label>
        ))}
      </fieldset>
      <div className="work-team-result" role="status">
        <strong>{selectionText}</strong>
        {actors.length > 0 && (
          <p>
            Con la frase attuale agiranno:{' '}
            {actors.map((unit) => visibleUnitName(state, unit)).join(', ')}.
          </p>
        )}
        {actors.length > 0 && actors.length < chosen.length && (
          <p>
            Questo lavoro richiede meno esecutori del gruppo scelto. Solo le persone indicate
            riceveranno l’ordine; le altre continueranno ciò che stavano facendo.
          </p>
        )}
        {preview && !preview.accepted && (
          <p>Prepara la frase e scegli il bersaglio sulla mappa prima di Pronuncia.</p>
        )}
      </div>
      <button
        type="button"
        className="primary-button work-team-apply"
        disabled={!chosen.length || !hasWord(state, 'S_02')}
        onClick={() => onApply(anchor, tokens)}
      >
        <Users size={17} /> Usa questo gruppo
      </button>
    </Modal>
  );
}
