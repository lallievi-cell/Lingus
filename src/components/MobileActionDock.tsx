import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ChevronUp, MapPin, X } from 'lucide-react';
import './MobileActionDock.css';

interface Props {
  children: ReactNode;
  /** Already filtered through the player's current knowledge by the caller. */
  targetLabel?: string | null;
  onClearTarget?: () => void;
  sessionKey?: string | number;
  defaultOpen?: boolean;
}

/** One word bank, shared with desktop. On a phone it opens above the composer
 * instead of increasing its height and squeezing the map out of view. */
export function MobileActionDock({
  children,
  targetLabel,
  onClearTarget,
  sessionKey,
  defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 860px)').matches : false,
  );
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const contentId = useId();

  useEffect(() => {
    setOpen(defaultOpen);
  }, [sessionKey, defaultOpen]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 860px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const workbench = root.current?.closest<HTMLElement>('.language-workbench');
    const app = workbench?.closest('.app');
    const toolbar = app?.querySelector<HTMLElement>('.map-toolbar');
    if (!workbench || !toolbar) return;
    const keepTimeControlsClear = () => {
      const clearance = Math.max(
        44,
        Math.ceil(workbench.getBoundingClientRect().top - toolbar.getBoundingClientRect().top + 4),
      );
      workbench.style.setProperty('--map-toolbar-clearance', `${clearance}px`);
    };
    const observer = new ResizeObserver(keepTimeControlsClear);
    observer.observe(workbench);
    observer.observe(toolbar);
    const map = app?.querySelector('.map-frame');
    if (map) observer.observe(map);
    keepTimeControlsClear();
    window.addEventListener('resize', keepTimeControlsClear);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', keepTimeControlsClear);
      workbench.style.removeProperty('--map-toolbar-clearance');
    };
  }, [mobile, sessionKey]);

  useEffect(() => {
    if (!mobile) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !open ||
        !(event.target instanceof Node) ||
        !root.current?.contains(event.target)
      )
        return;
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

  function toggle() {
    if (!open && mobile) {
      const workbench = root.current?.closest('.language-workbench');
      for (const details of workbench?.querySelectorAll<HTMLDetailsElement>(
        '.order-preview[open]',
      ) ?? [])
        details.open = false;
    }
    setOpen((value) => !value);
  }

  return (
    <div className="mobile-action-dock" data-open={open} ref={root}>
      <div className="mobile-dock-header">
        <button
          className="mobile-words-toggle"
          type="button"
          ref={trigger}
          onClick={toggle}
          aria-label={open ? 'Nascondi parole' : 'Mostra parole'}
          aria-expanded={open}
          aria-controls={contentId}
        >
          <BookOpen size={16} />
          <span>Parole</span>
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
        <div className="mobile-target-strip" role="status" aria-label="Bersaglio del comando">
          <MapPin size={13} aria-hidden="true" />
          <span title={targetLabel ?? undefined}>
            {targetLabel || 'Scegli il bersaglio sulla mappa'}
          </span>
          {targetLabel && onClearTarget && (
            <button
              type="button"
              onClick={onClearTarget}
              aria-label="Rimuovi bersaglio del comando"
              title="Rimuovi il bersaglio del comando"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
      <div
        ref={body}
        id={contentId}
        className="mobile-word-sheet"
        role="region"
        hidden={mobile && !open}
        aria-label="Parole per comporre"
        onClickCapture={(event) => {
          if (
            mobile &&
            event.target instanceof Element &&
            event.target.closest('.mobile-selection-controls button[data-map-selection]')
          )
            setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
