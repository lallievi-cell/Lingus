import { useState } from 'react';
import { Archive, Clock3, Download, History, RotateCcw, ShieldCheck } from 'lucide-react';
import { getCalendar } from '../game/calendar';
import { hasWord } from '../game/runtime';
import type { SaveCandidate, SaveLoadResult } from '../session/saveRepository';
import './SaveRecoveryPanel.css';

const seasons = ['Primavera', 'Estate', 'Autunno', 'Inverno'];

function copyDescription(candidate: SaveCandidate) {
  const game = candidate.game;
  const calendar = getCalendar(game);
  const season = seasons[calendar.season];
  const stage = game.urbanized
    ? 'Una civiltà di città'
    : game.tier >= 3
      ? 'Il villaggio cresce'
      : 'Le prime voci';
  return `${game.playMode === 'guided' ? 'Guidata' : 'Classica'} · ${stage} · ${season}${hasWord(game, 'O_08') ? `, anno ${calendar.year}` : ''}`;
}

function copyDate(at: number | null) {
  return at === null || !Number.isFinite(new Date(at).getTime())
    ? 'Data non disponibile per questa copia precedente'
    : new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(at);
}

/** Recovery is an explicit choice; simply opening the list never replaces a game. */
export function SaveRecoveryPanel({
  load,
  candidates,
  onRestore,
  onExportRaw,
  onDismiss,
}: {
  load: SaveLoadResult;
  candidates: SaveCandidate[];
  onRestore: (id: string) => void;
  onExportRaw: (raw: string) => void;
  onDismiss?: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const damagedRaw = load.issue?.raw ?? (!load.game ? load.raw : null);
  return (
    <section className="save-recovery" aria-label="Recupero e storie conservate">
      <div className="save-recovery-heading">
        <ShieldCheck size={24} aria-hidden="true" />
        <div>
          <h2>La storia può continuare.</h2>
          <p>
            Riprendi una copia precedente o una storia conservata. Ogni copia viene aperta in pausa.
          </p>
        </div>
      </div>

      {load.issue && (
        <div className="save-recovery-issue" role="alert">
          <strong>Controlla il salvataggio</strong>
          <p>{load.issue.message}</p>
          {damagedRaw && (
            <button type="button" onClick={() => onExportRaw(damagedRaw)}>
              <Download size={17} aria-hidden="true" /> Esporta il file originale
            </button>
          )}
        </div>
      )}

      {(['backup', 'archive'] as const).map((kind) => {
        const copies = candidates.filter((candidate) => candidate.kind === kind);
        const Icon = kind === 'backup' ? History : Archive;
        return (
          <section
            className="save-recovery-group"
            key={kind}
            aria-label={kind === 'backup' ? 'Copie automatiche' : 'Storie conservate'}
          >
            <h3>
              <Icon size={17} aria-hidden="true" />
              {kind === 'backup' ? 'Copie automatiche' : 'Storie conservate'}
            </h3>
            {copies.length === 0 ? (
              <p className="save-recovery-empty">
                {kind === 'backup'
                  ? 'Non ci sono ancora copie precedenti disponibili.'
                  : 'Le storie archiviate prima di un nuovo inizio compariranno qui.'}
              </p>
            ) : (
              <ul className="save-recovery-list">
                {copies.map((candidate) => (
                  <li key={candidate.id} className="save-recovery-copy" data-save-id={candidate.id}>
                    <div className="save-recovery-copy-title">
                      <Clock3 size={17} aria-hidden="true" />
                      <strong>{copyDate(candidate.savedAt)}</strong>
                    </div>
                    <p>{copyDescription(candidate)}</p>
                    {candidate.game.mapGeneration && (
                      <small>
                        Mappa{' '}
                        {candidate.game.mapGeneration.mode === 'random' ? 'casuale' : 'Seed Zero'} ·
                        seed {candidate.game.mapGeneration.seed}
                      </small>
                    )}
                    {pendingId === candidate.id ? (
                      <div
                        className="save-recovery-confirm"
                        role="group"
                        aria-label="Conferma ripristino"
                      >
                        <p>
                          {!load.game && load.raw
                            ? 'Il file attuale non leggibile verrà sostituito. Puoi esportarlo prima di continuare.'
                            : 'Riprenderai da questa copia. La storia attuale verrà conservata prima del ripristino.'}
                        </p>
                        <div>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => {
                              onRestore(candidate.id);
                              setPendingId(null);
                            }}
                          >
                            <RotateCcw size={16} aria-hidden="true" /> Ripristina questa storia
                          </button>
                          <button type="button" onClick={() => setPendingId(null)}>
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="save-recovery-restore"
                        onClick={() => setPendingId(candidate.id)}
                      >
                        <RotateCcw size={16} aria-hidden="true" /> Scegli questa copia
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <p className="save-recovery-note">
        Le copie restano in questo browser. Esporta una partita per conservarla anche fuori dal
        dispositivo.
      </p>
      {onDismiss && (
        <button type="button" className="save-recovery-dismiss" onClick={onDismiss}>
          {load.game ? 'Torna alla partita disponibile' : 'Chiudi recupero'}
        </button>
      )}
    </section>
  );
}
