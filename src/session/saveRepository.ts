import { parseGame, serializeGame } from '../game/engine';
import type { GameState } from '../game/types';

/** The active slot stays a plain v2 game for older releases and manual exports. */
export const SAVE_KEY = 'lingus.save.v2';
export const SAVE_HISTORY_KEY = 'lingus.save.history.v1';
export const SAVE_METADATA_KEY = 'lingus.save.metadata.v1';
export const SAVE_DAMAGED_HISTORY_KEY = 'lingus.save.history.damaged.v1';
export const SAVE_BACKUP_LIMIT = 3;
export const SAVE_ARCHIVE_LIMIT = 3;
export const SAVE_CONFLICT_MESSAGE =
  'Un’altra scheda ha cambiato la partita salvata. Questa sessione è in pausa e non la sostituirà. Esporta i progressi di questa scheda, poi riapri il gioco o recupera una copia.';

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type SaveIssue = {
  kind: 'invalid' | 'unavailable' | 'write-failed' | 'conflict';
  message: string;
  /** Original data can still be exported, even when the game cannot read it. */
  raw?: string;
};
export type SaveReason = 'auto' | 'manual' | 'restore' | 'new-story';
export type SaveCandidate = {
  id: string;
  kind: 'backup' | 'archive';
  raw: string;
  game: GameState;
  savedAt: number | null;
};
export type SaveLoadResult = {
  game: GameState | null;
  issue: SaveIssue | null;
  recoveryCandidates: SaveCandidate[];
  lastSavedAt: number | null;
  raw: string | null;
};
export type SaveWriteResult = {
  ok: boolean;
  issue: SaveIssue | null;
  lastSavedAt: number | null;
  warning?: string;
};
export type SaveWriteOptions = {
  allowReplaceInvalid?: boolean;
  reason?: SaveReason;
  /** If supplied, refuse to replace a slot changed since this session last observed it. */
  expectedRaw?: string | null;
  /** Only an explicit recovery choice may accept a changed slot in useSessionSafety. */
  resolveConflict?: boolean;
};

type StoredCopy = Omit<SaveCandidate, 'game'>;
type History = { entries: StoredCopy[]; damagedRaw?: string };
type SaveMetadata = { version: 1; fingerprint: string; savedAt: number; reason: SaveReason };

function validRawGame(game: GameState): string | null {
  try {
    const raw = serializeGame(game);
    return parseGame(raw) ? raw : null;
  } catch {
    return null;
  }
}

function fingerprint(raw: string) {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return `${raw.length}:${(hash >>> 0).toString(16)}`;
}

function readHistory(storage: SaveStorage): History {
  const raw = storage.getItem(SAVE_HISTORY_KEY);
  if (!raw) return { entries: [] };
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries))
      return { entries: [], damagedRaw: raw };
    const entries: StoredCopy[] = [];
    let damaged = false;
    for (const entry of value.entries) {
      if (
        typeof entry?.id !== 'string' ||
        !['backup', 'archive'].includes(entry.kind) ||
        typeof entry.raw !== 'string' ||
        !(entry.savedAt === null || (Number.isFinite(entry.savedAt) && entry.savedAt >= 0)) ||
        !parseGame(entry.raw)
      ) {
        damaged = true;
        continue;
      }
      if (!entries.some((other) => other.id === entry.id)) entries.push(entry);
    }
    return { entries, damagedRaw: damaged ? raw : undefined };
  } catch {
    return { entries: [], damagedRaw: raw };
  }
}

function savedAt(storage: SaveStorage, raw: string | null): number | null {
  if (!raw) return null;
  try {
    const metadata = JSON.parse(
      storage.getItem(SAVE_METADATA_KEY) ?? 'null',
    ) as SaveMetadata | null;
    return metadata?.version === 1 &&
      metadata.fingerprint === fingerprint(raw) &&
      Number.isFinite(metadata.savedAt) &&
      metadata.savedAt >= 0
      ? metadata.savedAt
      : null;
  } catch {
    return null;
  }
}

function candidates(history: History): SaveCandidate[] {
  return history.entries.flatMap((entry) => {
    const game = parseGame(entry.raw);
    return game ? [{ ...entry, game }] : [];
  });
}

function writeIssue(error: unknown): SaveIssue {
  const quota = error instanceof Error && /quota/i.test(error.name);
  return {
    kind: 'write-failed',
    message: quota
      ? 'Lo spazio del browser è esaurito. Esporta la partita per conservare i progressi attuali.'
      : 'Il browser non ha potuto salvare la partita. Le copie già presenti rimangono disponibili: puoi esportare i progressi attuali.',
  };
}

function writeHistory(storage: SaveStorage, history: History, entries: StoredCopy[]) {
  // Never discard unreadable historical data while repairing the journal.
  if (history.damagedRaw) {
    const quarantined = storage.getItem(SAVE_DAMAGED_HISTORY_KEY);
    if (quarantined !== null && quarantined !== history.damagedRaw)
      throw new Error('Another damaged history still needs to be exported');
    storage.setItem(SAVE_DAMAGED_HISTORY_KEY, history.damagedRaw);
  }
  const bounded = entries.filter((entry, index) => {
    const limit = entry.kind === 'backup' ? SAVE_BACKUP_LIMIT : SAVE_ARCHIVE_LIMIT;
    return entries.slice(0, index).filter((other) => other.kind === entry.kind).length < limit;
  });
  storage.setItem(SAVE_HISTORY_KEY, JSON.stringify({ version: 1, entries: bounded }));
}

function prependCopy(
  history: History,
  kind: StoredCopy['kind'],
  raw: string,
  at: number | null,
): StoredCopy[] {
  const existing = history.entries.find((entry) => entry.kind === kind && entry.raw === raw);
  if (existing) return [existing, ...history.entries.filter((entry) => entry.id !== existing.id)];
  const base = `${kind}:${at ?? 'legacy'}:${fingerprint(raw)}`;
  let id = base;
  for (let suffix = 1; history.entries.some((entry) => entry.id === id); suffix++)
    id = `${base}:${suffix}`;
  return [{ id, kind, raw, savedAt: at }, ...history.entries];
}

/** Browser storage failures are results, never exceptions escaping into gameplay. */
export function createSaveRepository(
  storageProvider: () => SaveStorage = () => localStorage,
  now: () => number = () => Date.now(),
) {
  const load = (): SaveLoadResult => {
    let raw: string | null = null;
    try {
      const storage = storageProvider();
      raw = storage.getItem(SAVE_KEY);
      const game = raw === null ? null : parseGame(raw);
      const history = readHistory(storage);
      const issue: SaveIssue | null =
        raw !== null && !game
          ? {
              kind: 'invalid',
              message:
                'Il salvataggio attuale non è leggibile. È ancora conservato: prova una copia precedente o esportalo prima di iniziare una nuova storia.',
              raw,
            }
          : history.damagedRaw
            ? {
                kind: 'invalid',
                message:
                  'Una copia di sicurezza non è leggibile. La partita attuale, se valida, rimane disponibile.',
                raw: history.damagedRaw,
              }
            : null;
      return {
        game,
        issue,
        recoveryCandidates: candidates(history),
        lastSavedAt: savedAt(storage, raw),
        raw,
      };
    } catch {
      return {
        game: null,
        issue: {
          kind: 'unavailable',
          message:
            'Il browser non consente di leggere i salvataggi. Puoi giocare ed esportare la partita, ma la conservazione automatica non è garantita.',
        },
        recoveryCandidates: [],
        lastSavedAt: null,
        raw,
      };
    }
  };

  const save = (game: GameState, options: SaveWriteOptions = {}): SaveWriteResult => {
    let previousTime: number | null = null;
    const raw = validRawGame(game);
    if (raw === null)
      return {
        ok: false,
        issue: {
          kind: 'invalid',
          message:
            'La partita attuale non supera il controllo di integrità. Il salvataggio precedente non è stato sostituito.',
        },
        lastSavedAt: null,
      };
    try {
      const storage = storageProvider();
      const previous = storage.getItem(SAVE_KEY);
      previousTime = savedAt(storage, previous);
      if (Object.hasOwn(options, 'expectedRaw') && previous !== options.expectedRaw)
        return {
          ok: false,
          issue: { kind: 'conflict', message: SAVE_CONFLICT_MESSAGE },
          lastSavedAt: previousTime,
        };
      const validPrevious = previous !== null ? parseGame(previous) : null;
      if (previous !== null && !validPrevious && !options.allowReplaceInvalid)
        return {
          ok: false,
          issue: {
            kind: 'invalid',
            message:
              'Il salvataggio non leggibile è protetto. Recupera una copia o scegli esplicitamente una nuova storia prima di sostituirlo.',
            raw: previous,
          },
          lastSavedAt: null,
        };
      if (validPrevious && previous !== raw) {
        const history = readHistory(storage);
        writeHistory(storage, history, prependCopy(history, 'backup', previous!, previousTime));
      }
      // setItem is atomic: if it throws, the active item is still the previous copy.
      storage.setItem(SAVE_KEY, raw);
      const at = now();
      try {
        const metadata: SaveMetadata = {
          version: 1,
          fingerprint: fingerprint(raw),
          savedAt: at,
          reason: options.reason ?? 'auto',
        };
        storage.setItem(SAVE_METADATA_KEY, JSON.stringify(metadata));
        return { ok: true, issue: null, lastSavedAt: at };
      } catch {
        return {
          ok: true,
          issue: null,
          lastSavedAt: at,
          warning:
            'La partita è salvata, ma non è stato possibile registrare la data dell’ultimo salvataggio.',
        };
      }
    } catch (error) {
      return { ok: false, issue: writeIssue(error), lastSavedAt: previousTime };
    }
  };

  const archive = (game: GameState): SaveWriteResult => {
    const raw = validRawGame(game);
    if (raw === null)
      return {
        ok: false,
        issue: {
          kind: 'invalid',
          message: 'Questa partita non è leggibile e non può essere archiviata.',
        },
        lastSavedAt: null,
      };
    try {
      const storage = storageProvider();
      const history = readHistory(storage);
      const at = now();
      writeHistory(storage, history, prependCopy(history, 'archive', raw, at));
      return { ok: true, issue: null, lastSavedAt: at };
    } catch (error) {
      return { ok: false, issue: writeIssue(error), lastSavedAt: null };
    }
  };

  const list = () => load().recoveryCandidates;
  const restore = (candidateId: string): SaveWriteResult & { game?: GameState } => {
    const candidate = list().find((entry) => entry.id === candidateId);
    if (!candidate)
      return {
        ok: false,
        issue: {
          kind: 'invalid',
          message:
            'Questa copia non è più disponibile. Aggiorna l’elenco e scegli un altro salvataggio.',
        },
        lastSavedAt: null,
      };
    const result = save(candidate.game, { allowReplaceInvalid: true, reason: 'restore' });
    return result.ok ? { ...result, game: candidate.game } : result;
  };
  const remove = (candidateId: string) => {
    try {
      const storage = storageProvider();
      const history = readHistory(storage);
      if (!history.entries.some((entry) => entry.id === candidateId)) return false;
      writeHistory(
        storage,
        history,
        history.entries.filter((entry) => entry.id !== candidateId),
      );
      return true;
    } catch {
      return false;
    }
  };
  return { load, save, archive, list, restore, remove };
}

export type SaveRepository = ReturnType<typeof createSaveRepository>;
