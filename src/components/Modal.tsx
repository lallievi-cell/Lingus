import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const focusables = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input,select,[tabindex="0"]',
      );
      if (!focusables?.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialog}
      >
        {onClose && (
          <button
            className="icon-button modal-close"
            aria-label="Chiudi finestra"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
