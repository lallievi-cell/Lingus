import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { hasWord } from '../game/runtime';
import { getSyntaxSuggestions } from '../game/syntaxAssistant';
import type { GameState } from '../game/types';
import './MobileWordPalette.css';

interface Props {
  state: GameState;
  /** The prefix being completed, or the prefix before an edited word. */
  sentence: string[];
  renderWord: (id: string) => ReactNode;
  onExpand: () => void;
  onClose: () => void;
  editingLabel?: string;
  onRemoveEditingWord?: () => void;
}

/** A short, nonmodal choice row. The complete vocabulary is an explicit action;
 * a grammatical completion never implies that a target or resources exist. */
export function MobileWordPalette({
  state,
  sentence,
  renderWord,
  onExpand,
  onClose,
  editingLabel,
  onRemoveEditingWord,
}: Props) {
  const syntax = getSyntaxSuggestions(state, sentence);
  const ids = syntax.tokenIds.filter((id) => hasWord(state, id));
  const list = useRef<HTMLDivElement>(null);
  const contentId = useId();
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const tokenKey = ids.join('|');

  useEffect(() => {
    const node = list.current;
    if (!node) {
      setOverflow(false);
      setAtEnd(false);
      return;
    }
    const update = () => {
      setOverflow(node.scrollWidth > node.clientWidth + 2);
      setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 3);
    };
    node.scrollLeft = 0;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    node.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', update);
    };
  }, [tokenKey]);

  const prompt = editingLabel
    ? editingLabel
    : syntax.isComplete
      ? ids.length
        ? 'Dettagli facoltativi'
        : 'Frase pronta'
      : syntax.nextLabel === 'Frase da correggere'
        ? 'Rivedi la frase'
        : syntax.nextLabel;

  function browse() {
    const node = list.current;
    if (!node) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollTo({
      left: atEnd ? 0 : node.scrollLeft + Math.max(90, node.clientWidth - 24),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  }

  return (
    <div className="mobile-quick-palette" data-has-more={overflow && !atEnd}>
      <div className="mobile-palette-heading">
        <span className="mobile-palette-prompt" title={syntax.explanation} aria-live="polite">
          <span className={syntax.isComplete ? 'palette-cue ready' : 'palette-cue'} />
          <strong title={prompt}>{prompt}</strong>
        </span>
        <button
          className="mobile-palette-catalog"
          type="button"
          onClick={onExpand}
          aria-label="Apri catalogo delle parole"
        >
          <BookOpen size={16} />
          <span>Catalogo</span>
        </button>
        {editingLabel && onRemoveEditingWord && (
          <button
            className="mobile-palette-icon"
            type="button"
            onClick={onRemoveEditingWord}
            aria-label="Rimuovi parola selezionata"
          >
            <Trash2 size={17} />
          </button>
        )}
        <button
          className="mobile-palette-icon"
          type="button"
          onClick={onClose}
          aria-label="Chiudi parole"
        >
          <X size={19} />
        </button>
      </div>
      {ids.length ? (
        <div className="mobile-palette-choices">
          <div
            id={contentId}
            className="mobile-palette-tokens"
            role="group"
            aria-label="Parole compatibili con lo spazio"
            ref={list}
          >
            {ids.map(renderWord)}
          </div>
          {overflow && (
            <button
              className="mobile-palette-more"
              type="button"
              onClick={browse}
              aria-label={atEnd ? 'Torna alle prime parole' : 'Altre parole compatibili'}
              aria-controls={contentId}
              title={atEnd ? 'Torna alle prime parole' : 'Scorri le altre parole compatibili'}
            >
              {atEnd ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          )}
        </div>
      ) : (
        <p className="mobile-palette-empty">
          {syntax.isComplete
            ? 'Scegli sulla mappa e pronuncia.'
            : 'Modifica una parola o cerca nel catalogo.'}
        </p>
      )}
    </div>
  );
}
