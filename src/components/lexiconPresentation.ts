import { INNATE_WORDS, WORD_ORDER, WORDS } from '../game/content';
import { getCustodianStatuses } from '../game/custodianStatus';
import { activeUnits, hasWord } from '../game/runtime';
import type { GameState, WordKind, WordMemory } from '../game/types';

export type LexiconView = 'known' | 'risk' | 'lost' | 'all';
export type LexiconCondition =
  | 'innate'
  | 'safe'
  | 'sole'
  | 'fragile'
  | 'critical'
  | 'lost'
  | 'unknown';
export interface LexiconEntry {
  id: string;
  kind: WordKind;
  label: string;
  known: boolean;
  innate: boolean;
  lost: boolean;
  atRisk: boolean;
  condition: LexiconCondition;
  status: string;
  memory?: WordMemory;
  custodianIds: string[];
}

export const LEXICON_KIND_NAMES: Record<WordKind, string> = {
  S: 'Soggetto',
  V: 'Azione',
  O: 'Materia',
  M: 'Concetto',
  C: 'Condizione',
};

/** A view of actual living custody: innate words never acquire a fictitious
 * custody risk, and an undiscovered meaning is not exposed by search. */
export function getLexiconEntries(
  state: GameState,
  {
    view = 'known',
    kind = 'all',
    search = '',
  }: {
    view?: LexiconView;
    kind?: WordKind | 'all';
    search?: string;
  } = {},
): LexiconEntry[] {
  const living = new Set(activeUnits(state).map((person) => person.id));
  const risks = new Map(getCustodianStatuses(state).map((entry) => [entry.unitId, entry.risk]));
  const query = search.trim().toLocaleLowerCase('it');
  const entries = WORD_ORDER.map((id): LexiconEntry => {
    const word = WORDS[id],
      memory = state.words[id],
      known = hasWord(state, id);
    const innate = INNATE_WORDS.includes(id);
    const lost = !innate && !!memory && memory.retention <= 0;
    const custodianIds = [...new Set(memory?.custodians ?? [])].filter((unitId) =>
      living.has(unitId),
    );
    const soleRisk = custodianIds.length === 1 ? risks.get(custodianIds[0]) : undefined;
    const condition: LexiconCondition = innate
      ? 'innate'
      : lost
        ? 'lost'
        : !known
          ? 'unknown'
          : !custodianIds.length || memory.retention < 30 || soleRisk === 'critical'
            ? 'critical'
            : memory.retention <= 70 || soleRisk === 'ageing'
              ? 'fragile'
              : custodianIds.length === 1
                ? 'sole'
                : 'safe';
    const status =
      condition === 'innate'
        ? 'Innata'
        : condition === 'unknown'
          ? 'Da scoprire'
          : condition === 'lost'
            ? 'Perduta'
            : condition === 'critical'
              ? 'In pericolo'
              : condition === 'fragile'
                ? 'Da proteggere'
                : condition === 'sole'
                  ? 'Una sola voce'
                  : 'Condivisa';
    return {
      id,
      kind: word.kind,
      label: known || lost ? word.label : 'Un’idea da scoprire',
      known,
      innate,
      lost,
      atRisk: ['critical', 'fragile', 'sole'].includes(condition),
      condition,
      status,
      memory,
      custodianIds,
    };
  }).filter((entry) => {
    if (view === 'known' && !entry.known) return false;
    if (view === 'risk' && !entry.atRisk) return false;
    if (view === 'lost' && !entry.lost) return false;
    if (kind !== 'all' && entry.kind !== kind) return false;
    const word = WORDS[entry.id];
    const searchable =
      entry.known || entry.lost
        ? `${word.label} ${word.description} ${word.event}`
        : `${word.event} ${word.hint}`;
    return searchable.toLocaleLowerCase('it').includes(query);
  });
  const priority: Record<LexiconCondition, number> = {
    critical: 0,
    fragile: 1,
    sole: 2,
    lost: 3,
    safe: 4,
    innate: 5,
    unknown: 6,
  };
  return entries.sort((a, b) => priority[a.condition] - priority[b.condition]);
}
