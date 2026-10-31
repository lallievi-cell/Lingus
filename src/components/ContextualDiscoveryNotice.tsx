import { BookOpen, Sparkles, X } from 'lucide-react';
import { WORDS } from '../game/content';
import './ContextualDiscoveryNotice.css';

const consequences: Record<string, string> = {
  O_03: 'Ora riconosci gli alberi e il legno che il lavoro lascia a terra.',
  O_02: 'Ora riconosci la roccia e le schegge di pietra lasciate dal lavoro.',
  M_01: 'La tribù riconosce la minaccia. Chi è ferito sa quando fuggire.',
};

/** A completed elementary discovery stays readable without stopping the world. */
export function ContextualDiscoveryNotice({
  wordId,
  rediscovered = false,
  onInspect,
  onDismiss,
}: {
  wordId: string;
  rediscovered?: boolean;
  onInspect: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="contextual-discovery-notice" role="status" aria-live="polite">
      <Sparkles size={18} aria-hidden="true" />
      <div>
        <strong>
          La tribù {rediscovered ? 'ritrova' : 'comprende'} «{WORDS[wordId].label}»
        </strong>
        <p>{consequences[wordId]}</p>
        <button className="text-button" onClick={() => onInspect(wordId)}>
          <BookOpen size={13} /> Che cosa cambia?
        </button>
      </div>
      <button
        className="icon-button"
        aria-label={`Nascondi scoperta di ${WORDS[wordId].label}`}
        onClick={onDismiss}
      >
        <X size={17} />
      </button>
    </aside>
  );
}
