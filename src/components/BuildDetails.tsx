import { useEffect, useRef, useState } from 'react';
import { Check, Download, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { BUILD_INFO, buildLabel, type BuildInfo } from '../buildInfo';
import { readBuildManifest, sameBuild } from './buildManifest';
import './BuildDetails.css';

type CheckState = 'idle' | 'checking' | 'current' | 'available' | 'unavailable' | 'save-blocked';

function buildDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Ambiente di sviluppo';
}

export function BuildDetails({ onBeforeReload }: { onBeforeReload: () => boolean }) {
  const [status, setStatus] = useState<CheckState>('idle');
  const [published, setPublished] = useState<BuildInfo | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function check() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);
    setStatus('checking');
    setPublished(null);
    try {
      const url = new URL('build.json', window.location.href);
      url.searchParams.set('releaseCheck', String(Date.now()));
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok || (response.url && new URL(response.url).origin !== window.location.origin))
        throw new Error('Release unavailable');
      const release = readBuildManifest(await response.json());
      if (!release) throw new Error('Invalid release manifest');
      if (controller.signal.aborted) return;
      setPublished(release);
      setStatus(sameBuild(BUILD_INFO, release) ? 'current' : 'available');
    } catch {
      if (!controller.signal.aborted || timedOut) setStatus('unavailable');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function update() {
    if (!published || sameBuild(BUILD_INFO, published)) return;
    let saved = false;
    try {
      saved = onBeforeReload();
    } catch {
      /* Keep the current game on screen. */
    }
    if (!saved) {
      setStatus('save-blocked');
      return;
    }
    const destination = new URL(window.location.href);
    destination.searchParams.set('release', published.commit);
    window.location.replace(destination.href);
  }

  return (
    <section
      className="build-details"
      aria-label="Versione del gioco"
      data-build-commit={BUILD_INFO.commit}
    >
      <div className="build-details-heading">
        <h3>
          <GitCommitHorizontal size={18} aria-hidden="true" /> Versione del gioco
        </h3>
        <strong className="build-details-version">{BUILD_INFO.version}</strong>
      </div>
      <div className="build-details-actions">
        <button type="button" onClick={() => void check()} disabled={status === 'checking'}>
          <RefreshCw size={16} aria-hidden="true" />
          {status === 'checking' ? 'Controllo in corso…' : 'Controlla aggiornamenti'}
        </button>
        {(status === 'available' || status === 'save-blocked') && (
          <button type="button" className="primary-button" onClick={update}>
            <Download size={16} aria-hidden="true" /> Salva e aggiorna
          </button>
        )}
      </div>
      <div className="build-details-result" role="status" aria-live="polite">
        {status === 'current' && (
          <p>
            <Check size={16} aria-hidden="true" />
            {published?.commit === 'development'
              ? 'Stai usando la stessa build di sviluppo.'
              : 'Stai usando questa build pubblicata.'}
          </p>
        )}
        {status === 'available' && published && (
          <p>
            È disponibile {buildLabel(published)}. Aggiorna quando sei pronto: prima verrà salvata
            la partita.
          </p>
        )}
        {status === 'unavailable' && (
          <p>
            Non è stato possibile controllare la versione pubblicata. La connessione potrebbe essere
            assente o l’aggiornamento ancora in corso. Puoi riprovare e continuare a giocare.
          </p>
        )}
        {status === 'save-blocked' && (
          <p>
            La pagina è rimasta aperta perché non è stato possibile salvare. Esporta la partita
            dalle impostazioni prima di ricaricare il gioco.
          </p>
        )}
      </div>
      <details className="build-details-technical">
        <summary>Dettagli della versione</summary>
        <dl className="build-details-data">
          <div>
            <dt>Build</dt>
            <dd>
              <code title={BUILD_INFO.commit}>
                {BUILD_INFO.commit === 'development' ? 'sviluppo' : BUILD_INFO.commit.slice(0, 7)}
              </code>
            </dd>
          </div>
          <div>
            <dt>Preparata il</dt>
            <dd>{buildDate(BUILD_INFO.builtAt)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
