import type { PlaytestSummary as Summary } from '../session/playtestRecord';
import './PlaytestSummary.css';

const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;

export function PlaytestSummary({
  summary,
  onExport,
  onStart,
  onStop,
}: {
  summary: Summary | null;
  onExport: () => void;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <details className="playtest-summary">
      <summary>Resoconto di prova volontario</summary>
      <p>
        Puoi annotare tempi, ordini ed eventi di questa prova per aiutarci a migliorare il gioco. Il
        resoconto resta in memoria: non invia dati e si perde chiudendo la pagina o cambiando
        storia. Puoi esportarlo e condividerlo tu.
      </p>
      {!summary ? (
        <button onClick={onStart}>Inizia il resoconto</button>
      ) : (
        <>
          <p role="status">
            {summary.recording ? 'Annotazione attiva' : 'Annotazione terminata'} ·{' '}
            {summary.resumedStory
              ? 'iniziata a partita già avviata'
              : 'iniziata all’alba della partita'}
            .
          </p>
          <dl>
            <div>
              <dt>Tempo di gioco osservato</dt>
              <dd>{duration(summary.observedSimulationSeconds)}</dd>
            </div>
            <div>
              <dt>Tempo reale in gioco</dt>
              <dd>{duration(summary.activeRealSeconds)}</dd>
            </div>
            <div>
              <dt>Tempo reale in pausa</dt>
              <dd>{duration(summary.pausedRealSeconds)}</dd>
            </div>
          </dl>
          <p>
            I periodi trascorsi fuori dalla pagina sono esclusi. Gli eventi precedenti all’avvio del
            resoconto non vengono ricostruiti.
          </p>
          <div className="playtest-summary-actions">
            {summary.recording ? (
              <button onClick={onStop}>Termina il resoconto</button>
            ) : (
              <button onClick={onStart}>Inizia un nuovo resoconto</button>
            )}
            <button onClick={onExport}>Esporta il resoconto</button>
          </div>
        </>
      )}
    </details>
  );
}
