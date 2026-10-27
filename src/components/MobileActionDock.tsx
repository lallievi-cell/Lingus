import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronUp, MapPin, Trash2, X } from 'lucide-react';
import './MobileActionDock.css';

interface Props {
  children: ReactNode;
  /** Already filtered through the player's current knowledge by the caller. */
  targetLabel?: string | null;
  onClearTarget?: () => void;
  sessionKey?: string | number;
  defaultOpen?: boolean;
  /** Incremented by a slot tap; a request never changes the sentence itself. */
  openRequest?: number;
  closeRequest?: number;
  onOpenChange?: (open: boolean) => void;
  compactStatus?: ReactNode;
  returnToMapLabel?: string;
  editingLabel?: string;
  onRemoveEditingWord?: () => void;
  compactChildren?: (controls: { expand: () => void; close: () => void }) => ReactNode;
  onModeChange?: (mode: 'closed' | 'compact' | 'catalog') => void;
}

/** Everyday composition shares the layout with the map. The larger catalogue
 * is an explicit choice; neither view captures input outside its own bounds. */
export function MobileActionDock({
  children,
  targetLabel,
  onClearTarget,
  sessionKey,
  defaultOpen = false,
  openRequest,
  closeRequest,
  onOpenChange,
  compactStatus,
  returnToMapLabel,
  editingLabel,
  onRemoveEditingWord,
  compactChildren,
  onModeChange,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false,
  );
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const priorOpenRequest = useRef(openRequest);
  const priorCloseRequest = useRef(closeRequest);
  const contentId = useId();

  useEffect(() => {
    setOpen(defaultOpen);
    setExpanded(false);
  }, [sessionKey, defaultOpen]);
  useEffect(() => {
    if (openRequest !== priorOpenRequest.current) {
      setExpanded(false);
      setOpen(true);
    }
    priorOpenRequest.current = openRequest;
  }, [openRequest]);
  useEffect(() => {
    if (closeRequest !== priorCloseRequest.current) setOpen(false);
    priorCloseRequest.current = closeRequest;
  }, [closeRequest]);
  useEffect(() => onOpenChange?.(mobile && open), [mobile, open, onOpenChange]);
  const compact = !!compactChildren && !expanded;
  useEffect(
    () => onModeChange?.(!mobile || !open ? 'closed' : compact ? 'compact' : 'catalog'),
    [mobile, open, compact, onModeChange],
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const workbench = root.current?.closest<HTMLElement>('.language-workbench');
    const app = workbench?.closest<HTMLElement>('.app');
    const toolbar = app?.querySelector<HTMLElement>('.map-toolbar');
    if (!workbench || !app || !toolbar) return;
    const keepEditorInView = () => {
      const workbenchBox = workbench.getBoundingClientRect();
      const toolbarBox = toolbar.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const visibleTop = Math.max(app.getBoundingClientRect().top, viewportTop);
      const clearance = Math.max(44, Math.ceil(workbenchBox.top - toolbarBox.top + 4));
      const mapHeight = app.querySelector('.map-frame')?.getBoundingClientRect().height;
      workbench.style.setProperty('--map-toolbar-clearance', `${clearance}px`);
      workbench.style.setProperty(
        '--word-sheet-available',
        `${Math.max(80, Math.floor(Math.min(mapHeight ?? Infinity, workbenchBox.top - clearance - visibleTop - 8)))}px`,
      );
    };
    const observer = new ResizeObserver(keepEditorInView);
    observer.observe(workbench);
    observer.observe(toolbar);
    observer.observe(app);
    keepEditorInView();
    window.addEventListener('resize', keepEditorInView);
    window.visualViewport?.addEventListener('resize', keepEditorInView);
    window.visualViewport?.addEventListener('scroll', keepEditorInView);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', keepEditorInView);
      window.visualViewport?.removeEventListener('resize', keepEditorInView);
      window.visualViewport?.removeEventListener('scroll', keepEditorInView);
      workbench.style.removeProperty('--map-toolbar-clearance');
      workbench.style.removeProperty('--word-sheet-available');
    };
  }, [mobile, sessionKey]);

  useEffect(() => {
    if (!mobile || !open) return;
    const workbench = root.current?.closest('.language-workbench');
    for (const details of workbench?.querySelectorAll<HTMLDetailsElement>('.order-preview[open]') ??
      [])
      details.open = false;
    // Focus a region, not the search input: opening words must not summon the keyboard.
    body.current?.focus({ preventScroll: true });
  }, [mobile, open, expanded]);

  useEffect(() => {
    if (!mobile) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    const showOrderDetails = (event: Event) => {
      if (
        event.target instanceof HTMLDetailsElement &&
        event.target.matches('.order-preview') &&
        event.target.open
      )
        setOpen(false);
    };
    document.addEventListener('keydown', closeWithEscape, true);
    document.addEventListener('toggle', showOrderDetails, true);
    return () => {
      document.removeEventListener('keydown', closeWithEscape, true);
      document.removeEventListener('toggle', showOrderDetails, true);
    };
  }, [mobile, open]);

  function close() {
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <div className="mobile-action-dock" data-open={open} ref={root}>
      <div
        ref={body}
        id={contentId}
        className="mobile-word-sheet"
        data-mode={compact ? 'compact' : 'catalog'}
        role="region"
        tabIndex={mobile ? -1 : undefined}
        hidden={mobile && !open}
        aria-label="Parole per comporre"
        onClickCapture={(event) => {
          if (!mobile || !(event.target instanceof Element)) return;
          if (event.target.closest('.mobile-selection-controls button[data-map-selection]'))
            setOpen(false);
          if (
            event.target.closest('.word-tile:not(:disabled)') &&
            document.activeElement instanceof HTMLInputElement
          )
            document.activeElement.blur();
        }}
      >
        {mobile && compactChildren && compact ? (
          compactChildren({ expand: () => setExpanded(true), close })
        ) : (
          <>
            <header className="mobile-word-sheet-heading">
              <div>
                {compactChildren ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (document.activeElement instanceof HTMLInputElement)
                        document.activeElement.blur();
                      setExpanded(false);
                    }}
                    aria-label="Torna ai suggerimenti"
                  >
                    <ChevronLeft size={20} />
                  </button>
                ) : (
                  <BookOpen size={17} />
                )}
                <strong>{editingLabel || 'Catalogo delle parole'}</strong>
              </div>
              <div className="mobile-sheet-heading-actions">
                {editingLabel && onRemoveEditingWord && (
                  <button
                    type="button"
                    onClick={onRemoveEditingWord}
                    aria-label="Rimuovi parola selezionata"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button type="button" onClick={close} aria-label="Chiudi parole">
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="mobile-word-sheet-content">{children}</div>
            {!compactChildren && (
              <footer className="mobile-word-sheet-footer">
                <span>La frase resta negli spazi qui sotto.</span>
                <button type="button" onClick={close}>
                  <MapPin size={16} />
                  {returnToMapLabel || (targetLabel ? 'Torna alla mappa' : 'Scegli il bersaglio')}
                  <ArrowRight size={16} />
                </button>
              </footer>
            )}
          </>
        )}
      </div>
      <div className="mobile-dock-header">
        <button
          className="mobile-words-toggle"
          type="button"
          ref={trigger}
          onClick={() => {
            setExpanded(false);
            setOpen((value) => !value);
          }}
          aria-label={open ? 'Nascondi parole' : 'Mostra parole'}
          aria-expanded={open}
          aria-controls={contentId}
        >
          <BookOpen size={17} />
          <span>Parole</span>
          <ChevronUp size={14} className={open ? 'is-open' : ''} />
        </button>
        <div className="mobile-target-strip" role="status" aria-label="Bersaglio del comando">
          <MapPin size={14} aria-hidden="true" />
          <span title={targetLabel ?? undefined}>{targetLabel || 'Scegli sulla mappa'}</span>
          {targetLabel && onClearTarget && (
            <button
              type="button"
              onClick={onClearTarget}
              aria-label="Rimuovi bersaglio del comando"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {compactStatus && <div className="mobile-dock-status">{compactStatus}</div>}
      </div>
    </div>
  );
}
