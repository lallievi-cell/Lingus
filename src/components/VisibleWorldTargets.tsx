import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Search, X } from 'lucide-react';
import type { WorldTarget } from '../game/types';
import {
  VISIBLE_TARGET_CATEGORIES,
  type VisibleTargetCategory,
  type VisibleWorldTarget,
} from './visibleWorldTargets';
import './VisibleWorldTargets.css';

const PAGE_SIZE = 8;

export function VisibleWorldTargets({
  entries,
  onChoose,
  onClose,
}: {
  entries: VisibleWorldTarget[];
  onChoose: (target: WorldTarget) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<VisibleTargetCategory | 'all'>('all');
  const [page, setPage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const results = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (category === 'all' || entry.category === category) &&
          `${entry.label} ${entry.detail}`
            .toLocaleLowerCase('it')
            .includes(query.trim().toLocaleLowerCase('it')),
      ),
    [entries, category, query],
  );
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1));
  return (
    <section
      id="visible-world-targets"
      className="visible-world-targets"
      aria-label="Elementi visibili sulla mappa"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="visible-world-targets-heading">
        <strong>Elementi visibili</strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Chiudi elementi visibili"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>Scegli un elemento inquadrato. L’ordine parte solo con Pronuncia.</p>
      <label className="visible-world-targets-search">
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Cerca tra gli elementi visibili"
          placeholder="Cerca nella visuale…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
      </label>
      <label className="visible-world-targets-filter">
        <span>Mostra</span>
        <select
          aria-label="Tipo di elemento visibile"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as VisibleTargetCategory | 'all');
            setPage(0);
          }}
        >
          <option value="all">Tutti gli elementi</option>
          {VISIBLE_TARGET_CATEGORIES.filter((item) =>
            entries.some((entry) => entry.category === item.id),
          ).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="visible-world-targets-list">
        {results.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE).map((entry) => (
          <button key={entry.key} type="button" onClick={() => onChoose(entry.target)}>
            <MapPin size={16} aria-hidden="true" />
            <span>
              <strong>{entry.label}</strong>
              <small>{entry.detail}</small>
            </span>
          </button>
        ))}
        {!results.length && (
          <p className="visible-world-targets-empty">
            Nessun elemento inquadrato corrisponde alla ricerca. Puoi spostare la mappa o cambiare
            filtro.
          </p>
        )}
      </div>
      {results.length > PAGE_SIZE && (
        <div className="visible-world-targets-pages">
          <button type="button" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>
            <ChevronLeft size={16} /> Precedenti
          </button>
          <button
            type="button"
            disabled={(pageIndex + 1) * PAGE_SIZE >= results.length}
            onClick={() => setPage(pageIndex + 1)}
          >
            Altri elementi <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
