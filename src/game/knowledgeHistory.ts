import { INNATE_WORDS, WORDS } from './content';
import type { GameState, KnowledgeHistoryEvent, Unit } from './types';

export const KNOWLEDGE_HISTORY_LIMIT = 200;
type Entry = Omit<KnowledgeHistoryEvent, 'id'>;

function knowledgeId(entry: Entry) {
  return `knowledge:${entry.kind}:${entry.wordId}:${entry.time}:${encodeURIComponent(entry.teacherId)}:${entry.pupilId === undefined ? '' : encodeURIComponent(entry.pupilId)}`;
}

const ownLivingVoice = (unit: Unit | undefined): unit is Unit =>
  !!unit &&
  unit.hp > 0 &&
  unit.caste !== 'slave' &&
  (!unit.factionId || unit.factionId === 'player');

function canRecord(state: GameState, wordId: string, actorId: string) {
  const memory = state.words[wordId];
  const actor = state.units.find((unit) => unit.id === actorId);
  return (
    Object.hasOwn(WORDS, wordId) &&
    !INNATE_WORDS.includes(wordId) &&
    Number.isFinite(state.time) &&
    state.time >= 0 &&
    !!memory &&
    memory.retention > 0 &&
    ownLivingVoice(actor) &&
    memory.custodians.includes(actorId) &&
    actor.knows.includes(wordId)
  );
}

function record(state: GameState, entry: Entry) {
  const id = knowledgeId(entry);
  if (id.length > 1024 || state.knowledgeHistory?.some((event) => event.id === id)) return;
  state.knowledgeHistory ??= [];
  state.knowledgeHistory.unshift({ id, ...entry });
  state.knowledgeHistory.length = Math.min(state.knowledgeHistory.length, KNOWLEDGE_HISTORY_LIMIT);
}

/** Called after learnSpark has assigned actual knowledge and custody. */
export function recordKnowledgeDiscovery(state: GameState, wordId: string, actorId: string): void {
  if (!canRecord(state, wordId, actorId)) return;
  record(state, { kind: 'discovery', wordId, teacherId: actorId, time: state.time });
}

/** Called after a paid lesson has assigned the actual pupil, never from a preview. */
export function recordKnowledgeTeaching(
  state: GameState,
  wordId: string,
  teacherId: string,
  pupilId: string,
): void {
  if (
    teacherId === pupilId ||
    !canRecord(state, wordId, teacherId) ||
    !canRecord(state, wordId, pupilId)
  )
    return;
  record(state, { kind: 'teaching', wordId, teacherId, pupilId, time: state.time });
}

/** Strict import validation preserves history or rejects it; it never manufactures actors. */
export function validKnowledgeHistory(
  value: unknown,
  state: Pick<GameState, 'time' | 'units' | 'words'>,
): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > KNOWLEDGE_HISTORY_LIMIT) return false;
  const people = new Set(state.units.map((unit) => unit.id));
  const ids = new Set<string>();
  return value.every((event: unknown) => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
    const entry = event as Record<string, unknown>;
    if (
      Object.keys(entry).some(
        (key) => !['id', 'kind', 'wordId', 'time', 'teacherId', 'pupilId'].includes(key),
      ) ||
      typeof entry.id !== 'string' ||
      entry.id.length > 1024 ||
      ids.has(entry.id) ||
      !['discovery', 'teaching'].includes(entry.kind as string) ||
      typeof entry.wordId !== 'string' ||
      !Object.hasOwn(WORDS, entry.wordId) ||
      INNATE_WORDS.includes(entry.wordId) ||
      !Object.hasOwn(state.words, entry.wordId) ||
      typeof entry.time !== 'number' ||
      !Number.isFinite(entry.time) ||
      entry.time < 0 ||
      entry.time > state.time ||
      typeof entry.teacherId !== 'string' ||
      !people.has(entry.teacherId) ||
      (entry.kind === 'discovery'
        ? entry.pupilId !== undefined
        : typeof entry.pupilId !== 'string' ||
          entry.pupilId === entry.teacherId ||
          !people.has(entry.pupilId))
    )
      return false;
    if (entry.id !== knowledgeId(entry as unknown as Entry)) return false;
    ids.add(entry.id);
    return true;
  });
}
