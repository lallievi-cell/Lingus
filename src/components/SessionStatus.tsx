import { AlertTriangle, Download, History, Pause, Play, ShieldCheck } from 'lucide-react';
import type { SaveWriteResult } from '../session/saveRepository';
import './SessionStatus.css';

export function SessionStatus({
  status,
  backgroundPause = false,
  details = false,
  onExport,
  onRecovery,
  onResume,
}: {
  status: SaveWriteResult;
  backgroundPause?: boolean;
  details?: boolean;
  onExport: () => void;
  onRecovery: () => void;
  onResume: () => void;
}) {
  if (!details && !status.issue && !status.warning && !backgroundPause) return null;
  const timestamp = status.lastSavedAt === null ? NaN : new Date(status.lastSavedAt).getTime();
  const date = Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(timestamp)
    : null;
  return (
    <section
      className={`session-status ${status.issue ? 'has-issue' : ''} ${details ? 'is-detailed' : ''}`}
      role={status.issue ? 'alert' : backgroundPause ? 'status' : undefined}
      aria-label="Stato della partita"
    >
      {status.issue ? (
        <AlertTriangle size={19} aria-hidden="true" />
      ) : backgroundPause ? (
        <Pause size={19} aria-hidden="true" />
      ) : (
        <ShieldCheck size={19} aria-hidden="true" />
      )}
      <div>
        <strong>
          {status.issue
            ? 'I progressi attuali non sono ancora al sicuro'
            : backgroundPause
              ? 'La tribù ti ha aspettato'
              : date
                ? `Ultimo salvataggio riuscito: ${date}`
                : 'Data dell’ultimo salvataggio non disponibile'}
        </strong>
        <p>
          {status.issue
            ? status.issue.message
            : backgroundPause
              ? 'Il tempo si è fermato quando hai lasciato il gioco. Riprendi quando sei pronto.'
              : (status.warning ??
                'Le copie precedenti e le storie conservate sono disponibili nel recupero.')}
        </p>
      </div>
      <div className="session-status-actions">
        {status.issue && (
          <button onClick={onExport}>
            <Download size={15} /> Esporta
          </button>
        )}
        {(details || status.issue) && (
          <button onClick={onRecovery}>
            <History size={15} /> Copie e storie
          </button>
        )}
        {backgroundPause && !status.issue && (
          <button onClick={onResume}>
            <Play size={15} /> Riprendi
          </button>
        )}
      </div>
    </section>
  );
}
