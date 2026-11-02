import { ADULT_AGE, INNATE_WORDS, LEARNING_AGE_LIMIT, WORD_ORDER, WORDS } from './content';
import { getCustodianStatuses } from './custodianStatus';
import { getLifeStage, resolveUnitSex, type LifeStage } from './demography';
import { activeUnits, hasWord } from './runtime';
import { getLessonPreview, lessonIssueText } from './teaching';
import type { GameState, KnowledgeHistoryEvent, TribeEvent, Unit } from './types';

export interface LineagePerson {
  id: string;
  label: string;
  stage: LifeStage;
  stageLabel: string;
  knowsWord: boolean;
  alive: boolean;
}

export interface KnowledgeFamily {
  parent: LineagePerson;
  child: LineagePerson;
  sharedWord: boolean;
}

export interface KnowledgeMemory {
  id: string;
  kind: TribeEvent['kind'] | KnowledgeHistoryEvent['kind'];
  text: string;
  time: number;
}

export interface KnowledgeLineageEntry {
  wordId: string;
  label: string;
  custodians: LineagePerson[];
  soleCustodian?: LineagePerson;
  firstCustodian?: LineagePerson;
  transmissions: {
    id: string;
    teacher: LineagePerson;
    pupil: LineagePerson;
    time: number;
    text: string;
  }[];
  risk: 'safe' | 'ageing' | 'critical';
  families: KnowledgeFamily[];
  futureLearners: LineagePerson[];
  history: KnowledgeMemory[];
  enteredAt?: number;
  canTeach: boolean;
  teachingIssue?: string;
}

/** Physical life stages remain observable before the individual pronoun. */
export function lineagePersonLabel(state: GameState, unit: Unit): string {
  if (hasWord(state, 'S_02')) return unit.name;
  const female = resolveUnitSex(unit) === 'F';
  switch (getLifeStage(unit)) {
    case 'newborn':
      return female ? 'Una neonata' : 'Un neonato';
    case 'child':
      return female ? 'Una bambina' : 'Un bambino';
    case 'elder':
      return female ? 'Un’anziana' : 'Un anziano';
    default:
      return female ? 'Una compagna' : 'Un compagno';
  }
}

function person(state: GameState, unit: Unit, custodians: Set<string>): LineagePerson {
  const stage = getLifeStage(unit);
  const female = resolveUnitSex(unit) === 'F';
  return {
    id: unit.id,
    label: lineagePersonLabel(state, unit),
    stage,
    stageLabel:
      stage === 'newborn'
        ? female
          ? 'Neonata'
          : 'Neonato'
        : stage === 'child'
          ? female
            ? 'Bambina'
            : 'Bambino'
          : stage === 'elder'
            ? female
              ? 'Anziana'
              : 'Anziano'
            : female
              ? 'Adulta'
              : 'Adulto',
    knowsWord: custodians.has(unit.id),
    alive: unit.hp > 0,
  };
}

function recordedMemory(state: GameState, event: KnowledgeHistoryEvent): KnowledgeMemory | null {
  if (event.time < 0 || event.time > state.time || !WORDS[event.wordId]) return null;
  const teacher = state.units.find((unit) => unit.id === event.teacherId);
  if (!teacher) return null;
  const label = (unit: Unit, start = false) => {
    const name = lineagePersonLabel(state, unit);
    return !start && !hasWord(state, 'S_02') ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  };
  if (event.kind === 'discovery')
    return {
      id: event.id,
      kind: event.kind,
      time: event.time,
      text: `${label(teacher, true)} ha compreso «${WORDS[event.wordId].label}».`,
    };
  const pupil = state.units.find((unit) => unit.id === event.pupilId);
  return pupil && pupil.id !== teacher.id
    ? {
        id: event.id,
        kind: event.kind,
        time: event.time,
        text: `${label(teacher, true)} ha insegnato «${WORDS[event.wordId].label}» a ${label(pupil)}.`,
      }
    : null;
}

function eventMemory(
  state: GameState,
  event: TribeEvent,
  wordId: string,
  custodians: Set<string>,
): KnowledgeMemory | null {
  if (!Number.isFinite(event.time) || event.time > state.time) return null;
  const unit = state.units.find((candidate) => candidate.id === event.unitId);
  if (unit?.factionId && unit.factionId !== 'player') return null;
  if (event.kind === 'word-lost' && event.wordId === wordId)
    return {
      id: event.id,
      kind: event.kind,
      time: event.time,
      text: 'Questa parola è stata perduta. Ora torna a vivere nel nostro lessico.',
    };
  if (
    event.kind === 'death' &&
    (event.wordIds?.includes(wordId) || event.lostWordIds?.includes(wordId))
  ) {
    const name = unit ? lineagePersonLabel(state, unit) : 'Una voce della tribù';
    return {
      id: event.id,
      kind: event.kind,
      time: event.time,
      text: `${name} custodiva questa parola. La sua vita si è spenta.`,
    };
  }
  if (
    event.kind === 'birth' &&
    unit &&
    (event.parentIds ?? unit.parentIds)?.some((id) => custodians.has(id))
  ) {
    const name = hasWord(state, 'S_02')
      ? unit.name
      : resolveUnitSex(unit) === 'F'
        ? 'Una figlia'
        : 'Un figlio';
    return {
      id: event.id,
      kind: event.kind,
      time: event.time,
      text: `${name}: una nuova vita nella famiglia di chi custodisce questa parola.`,
    };
  }
  return null;
}

/** Living custody and actual kinship, never an invented chain of teachers. */
export function getKnowledgeLineage(state: GameState, wordId?: string): KnowledgeLineageEntry[] {
  const people = activeUnits(state);
  const living = new Map(people.map((unit) => [unit.id, unit]));
  const risks = new Map(getCustodianStatuses(state).map((status) => [status.unitId, status.risk]));
  const entries: KnowledgeLineageEntry[] = [];
  for (const id of WORD_ORDER) {
    if (wordId && id !== wordId) continue;
    const memory = state.words[id];
    if (!memory || memory.retention <= 0 || INNATE_WORDS.includes(id)) continue;
    const custodianIds = new Set(memory.custodians.filter((unitId) => living.has(unitId)));
    const custodians = [...custodianIds].map((unitId) =>
      person(state, living.get(unitId)!, custodianIds),
    );
    const soleCustodian = custodians.length === 1 ? custodians[0] : undefined;
    const families = people.flatMap((child) =>
      (child.parentIds ?? []).flatMap((parentId) => {
        const parent = living.get(parentId);
        if (!parent || !custodianIds.has(parentId) || parentId === child.id) return [];
        return [
          {
            parent: person(state, parent, custodianIds),
            child: person(state, child, custodianIds),
            sharedWord: custodianIds.has(child.id),
          },
        ];
      }),
    );
    const preview = getLessonPreview(state, id);
    const enteredAt = state.bornWords?.[id];
    const recorded = (state.knowledgeHistory ?? []).filter(
      (event) =>
        event.wordId === id &&
        Number.isFinite(event.time) &&
        event.time >= 0 &&
        event.time <= state.time,
    );
    // Bounded history can lose its oldest record. A later rediscovery must never
    // be presented as the first discovery recorded by bornWords.
    const firstDiscoveries = recorded.filter(
      (event) => event.kind === 'discovery' && event.time === enteredAt,
    );
    const firstDiscovery = firstDiscoveries.length === 1 ? firstDiscoveries[0] : undefined;
    const firstVoice =
      firstDiscovery && state.units.find((unit) => unit.id === firstDiscovery.teacherId);
    const transmissions = recorded
      .flatMap((event) => {
        if (event.kind !== 'teaching') return [];
        const teacher = state.units.find((unit) => unit.id === event.teacherId);
        const pupil = state.units.find((unit) => unit.id === event.pupilId);
        return teacher && pupil && teacher.id !== pupil.id
          ? [
              {
                id: event.id,
                teacher: person(state, teacher, custodianIds),
                pupil: person(state, pupil, custodianIds),
                time: event.time,
                text: recordedMemory(state, event)!.text,
              },
            ]
          : [];
      })
      .sort((a, b) => b.time - a.time)
      .slice(0, 3);
    entries.push({
      wordId: id,
      label: WORDS[id].label,
      custodians,
      soleCustodian,
      firstCustodian: firstVoice ? person(state, firstVoice, custodianIds) : undefined,
      transmissions,
      risk: soleCustodian ? (risks.get(soleCustodian.id) ?? 'safe') : 'safe',
      families,
      futureLearners: people
        .filter(
          (unit) =>
            unit.age < Math.min(ADULT_AGE, LEARNING_AGE_LIMIT) &&
            unit.caste !== 'slave' &&
            !custodianIds.has(unit.id),
        )
        .map((unit) => person(state, unit, custodianIds)),
      history: [
        ...(state.tribeEvents ?? []).map((event) => eventMemory(state, event, id, custodianIds)),
        ...recorded
          .filter((event) => event.kind === 'discovery')
          .map((event) => recordedMemory(state, event)),
      ]
        .filter((event): event is KnowledgeMemory => event !== null)
        .sort((a, b) => b.time - a.time)
        .slice(0, 3),
      enteredAt:
        typeof enteredAt === 'number' &&
        Number.isFinite(enteredAt) &&
        enteredAt >= 0 &&
        enteredAt <= state.time
          ? enteredAt
          : undefined,
      canTeach: preview.allowed,
      teachingIssue: preview.allowed ? undefined : lessonIssueText(preview.issue),
    });
  }
  const priority = (entry: KnowledgeLineageEntry) =>
    entry.risk === 'critical'
      ? 0
      : entry.risk === 'ageing'
        ? 1
        : entry.soleCustodian
          ? 2
          : entry.custodians.length === 0
            ? 3
            : 4;
  return entries.sort((a, b) => priority(a) - priority(b));
}
