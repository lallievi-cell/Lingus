import { useState } from 'react';
import { ArrowRight, BookOpen, Heart, MapPin, MessageCircle, Users } from 'lucide-react';
import { hasWord } from '../game/runtime';
import { getKnowledgeLineage, type LineagePerson } from '../game/knowledgeLineage';
import type { GameState } from '../game/types';
import { Glyph } from './Glyph';
import './KnowledgeLineage.css';

export function KnowledgeLineage({
  state,
  wordId,
  onFocusUnit,
  onTeach,
}: {
  state: GameState;
  wordId?: string;
  onFocusUnit?: (unitId: string) => void;
  onTeach?: (wordId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const entries = getKnowledgeLineage(state, wordId);
  if (entries.length === 0) return null;
  const numbered = hasWord(state, 'O_08');
  const vulnerable = entries.some((entry) => !!entry.soleCustodian);
  const showPerson = (person: LineagePerson) =>
    onFocusUnit && person.alive ? (
      <button className="lineage-person" onClick={() => onFocusUnit(person.id)}>
        <MapPin size={13} aria-hidden="true" /> {person.label}
        <small>{person.stageLabel}</small>
      </button>
    ) : (
      <span className="lineage-person is-static">
        {person.label}{' '}
        <small>
          {person.stageLabel}
          {person.alive ? '' : ' · Nella memoria'}
        </small>
      </span>
    );
  return (
    <details className="knowledge-lineage">
      <summary>
        <span className="knowledge-lineage-mark">
          <MessageCircle size={18} aria-hidden="true" />
        </span>
        <span>
          <strong>Le voci del sapere</strong>
          <small>
            {vulnerable
              ? 'Ci sono parole affidate a una sola vita'
              : 'Il sapere vive nelle persone'}
          </small>
        </span>
      </summary>
      <div className="knowledge-lineage-content">
        <p>
          Ogni parola vive nella memoria di chi la conosce. Tramandala al Falò per affidarla a nuove
          voci.
        </p>
        {(showAll ? entries : entries.slice(0, 6)).map((entry) => (
          <details className={`lineage-word risk-${entry.risk}`} key={entry.wordId}>
            <summary>
              <Glyph id={entry.wordId} size={20} />
              <span>
                <strong>{entry.label}</strong>
                <small>
                  {entry.soleCustodian
                    ? 'Affidata a una sola voce'
                    : entry.custodians.length
                      ? numbered
                        ? `${entry.custodians.length} custodi`
                        : 'Sapere condiviso'
                      : 'Nessun custode vivente'}
                </small>
              </span>
              {entry.risk !== 'safe' && (
                <Heart
                  size={15}
                  aria-label={entry.risk === 'critical' ? 'Custode in pericolo' : 'Custode anziano'}
                />
              )}
            </summary>
            <div className="lineage-word-content">
              {entry.soleCustodian && (
                <p className="lineage-care">
                  {entry.risk === 'critical'
                    ? 'Questa voce è in pericolo. Proteggila e prepara un altro custode.'
                    : entry.risk === 'ageing'
                      ? 'Questa parola vive nella memoria di una persona anziana. Tramandala al Falò perché continui a vivere nella tribù.'
                      : 'Se questa vita si spegne, la parola può andare perduta. Tramandarla crea un altro custode.'}
                </p>
              )}
              {entry.firstCustodian && (
                <div className="lineage-origin">
                  <h4>La prima voce</h4>
                  {showPerson(entry.firstCustodian)}
                  <p className="lineage-note">Da questa scoperta è entrata nel nostro lessico.</p>
                </div>
              )}
              <h4>
                <BookOpen size={14} aria-hidden="true" /> Chi la custodisce
              </h4>
              <div className="lineage-people">
                {entry.custodians.map((person) => (
                  <div key={person.id}>{showPerson(person)}</div>
                ))}
              </div>
              {entry.transmissions.length > 0 && (
                <div className="lineage-transmissions">
                  <h4>
                    <MessageCircle size={14} aria-hidden="true" /> Le parole tramandate
                  </h4>
                  {entry.transmissions.map((lesson) => (
                    <div className="lineage-family" key={lesson.id}>
                      <div>
                        {showPerson(lesson.teacher)}
                        <ArrowRight size={14} aria-hidden="true" />
                        {showPerson(lesson.pupil)}
                      </div>
                      <small>{lesson.text}</small>
                    </div>
                  ))}
                </div>
              )}
              {entry.families.length > 0 && (
                <div className="lineage-families">
                  <h4>
                    <Users size={14} aria-hidden="true" /> Un sapere tra generazioni
                  </h4>
                  {entry.families.map((family) => (
                    <div className="lineage-family" key={`${family.parent.id}-${family.child.id}`}>
                      <div>
                        {showPerson(family.parent)}
                        <ArrowRight size={14} aria-hidden="true" />
                        {showPerson(family.child)}
                      </div>
                      <small>
                        {family.sharedWord
                          ? 'La parola è conosciuta da entrambe le generazioni.'
                          : `${family.child.label} non custodisce ancora questa parola.`}
                      </small>
                    </div>
                  ))}
                  <p className="lineage-note">
                    Anche in famiglia, una parola va tramandata con una lezione al Falò.
                  </p>
                </div>
              )}
              {entry.futureLearners.length > 0 && (
                <div className="lineage-next">
                  <h4>Voci che crescono</h4>
                  <div className="lineage-people">
                    {entry.futureLearners.map((person) => (
                      <div key={person.id}>{showPerson(person)}</div>
                    ))}
                  </div>
                  <p className="lineage-note">
                    I più giovani possono imparare al Falò anche quando non sono ancora in grado di
                    lavorare.
                  </p>
                </div>
              )}
              {entry.history.length > 0 && (
                <ul className="lineage-history" aria-label={`Memoria di ${entry.label}`}>
                  {entry.history.map((event) => (
                    <li key={event.id} data-event-kind={event.kind}>
                      {event.text}
                    </li>
                  ))}
                </ul>
              )}
              {onTeach && (
                <div className="lineage-teach">
                  <button onClick={() => onTeach(entry.wordId)} disabled={!entry.canTeach}>
                    <MessageCircle size={15} aria-hidden="true" /> Tramanda {entry.label}
                  </button>
                  {entry.teachingIssue && <small>{entry.teachingIssue}</small>}
                </div>
              )}
            </div>
          </details>
        ))}
        {entries.length > 6 && (
          <button className="lineage-show-all" onClick={() => setShowAll((all) => !all)}>
            {showAll ? 'Mostra meno parole' : 'Mostra tutte le parole'}
          </button>
        )}
      </div>
    </details>
  );
}
