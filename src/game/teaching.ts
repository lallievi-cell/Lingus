import { ADULT_AGE, LEARNING_AGE_LIMIT, WORDS } from './content';
import { getDogmaEffects } from './dogmas';
import { GUIDED_PROGRESSION } from './guidedProgression';
import { activeUnits, hasBuilding } from './runtime';
import { teachingMemoryGain } from './learningBalance';
import type { GameState, Unit } from './types';

export type LessonIssue =
  | 'unknown'
  | 'innate'
  | 'forgotten'
  | 'ended'
  | 'no-fire'
  | 'no-teacher'
  | 'no-pupil'
  | 'no-attention';
export interface LessonPreview {
  allowed: boolean;
  issue?: LessonIssue;
  teacher?: Unit;
  pupil?: Unit;
  memoryGain: number;
  retentionGain: number;
  livingCustodians: number;
}

/** Pure preview: uses exactly the pupil ordering and seed sample of teachWord. */
export function getLessonPreview(state: GameState, wordId: string): LessonPreview {
  const memory = state.words[wordId];
  const people = activeUnits(state);
  const teachers = memory
    ? people.filter((unit) => unit.caste !== 'slave' && memory.custodians.includes(unit.id))
    : [];
  const eligible = memory
    ? people.filter(
        (unit) =>
          unit.age < LEARNING_AGE_LIMIT &&
          unit.caste !== 'slave' &&
          !memory.custodians.includes(unit.id),
      )
    : [];
  const children = eligible.filter((unit) => unit.age < ADULT_AGE);
  const pupils = children.length ? children : eligible;
  const pupil =
    pupils[Math.min(Math.floor((state.seed / 4294967296) * pupils.length), pupils.length - 1)];
  const memoryGain = teachingMemoryGain(
    state,
    wordId,
    10 *
      getDogmaEffects(state).teaching *
      (state.playMode === 'guided' ? GUIDED_PROGRESSION.teachingMultiplier : 1),
  );
  const issue: LessonIssue | undefined =
    !memory || !WORDS[wordId]
      ? 'unknown'
      : WORDS[wordId].tier === 0
        ? 'innate'
        : memory.retention <= 0
          ? 'forgotten'
          : state.gameOver || state.victory
            ? 'ended'
            : !hasBuilding(state, 'campfire')
              ? 'no-fire'
              : !teachers.length
                ? 'no-teacher'
                : !pupil
                  ? 'no-pupil'
                  : state.attention < 10
                    ? 'no-attention'
                    : undefined;
  return {
    allowed: !issue,
    issue,
    teacher: teachers[0],
    pupil,
    memoryGain,
    retentionGain: memory
      ? Math.max(0, Math.min(100, memory.retention + memoryGain) - memory.retention)
      : 0,
    livingCustodians: teachers.length,
  };
}

export function lessonIssueText(issue?: LessonIssue) {
  switch (issue) {
    case 'unknown':
      return 'Questa parola non è ancora stata scoperta.';
    case 'innate':
      return 'La tribù conosce già le parole innate.';
    case 'forgotten':
      return 'La parola è perduta: rivivi l’esperienza e segui la nuova Scintilla.';
    case 'ended':
      return 'Questa storia è conclusa.';
    case 'no-fire':
      return 'Serve un falò della tribù completato e acceso.';
    case 'no-teacher':
      return 'Nessun custode vivo e libero può insegnare questa parola.';
    case 'no-pupil':
      return 'Nessun nuovo allievo è disponibile per questa parola. Serve un compagno abbastanza giovane che non la conosca già.';
    case 'no-attention':
      return 'Manca Attenzione per una lezione. In Guidata puoi ottenerla bruciando il legno delle scorte.';
    default:
      return '';
  }
}

/** A brief Guided lesson funds ordinary Attention, never seasonal burntWood. */
export function briefLessonIssue(state: GameState) {
  if (state.playMode !== 'guided')
    return 'In Classica l’Attenzione si prepara durante il consiglio stagionale al Falò.';
  if (state.campfirePending) return 'Il consiglio stagionale è già aperto: alimenta il suo Falò.';
  if (state.gameOver || state.victory) return 'Questa storia è conclusa.';
  if (!hasBuilding(state, 'campfire')) return 'Serve un falò della tribù acceso e completato.';
  const teachable = Object.keys(state.words).some((id) => {
    const preview = getLessonPreview(state, id);
    return preview.allowed || preview.issue === 'no-attention';
  });
  if (!teachable) return 'Non c’è una parola che possa essere insegnata a un nuovo allievo.';
  if (state.attention >= getDogmaEffects(state).attentionCap)
    return 'L’Attenzione è già al massimo.';
  if (state.resources.wood < GUIDED_PROGRESSION.councilWoodCost)
    return 'Manca legno nelle scorte. Porta al campo quello rimasto a terra prima di preparare il racconto.';
  return undefined;
}

export const canPrepareBriefLesson = (state: GameState) => briefLessonIssue(state) === undefined;

export function councilPreparationIssue(state: GameState) {
  if (state.playMode !== 'guided')
    return 'Puoi alimentare il Falò in questo modo solo in modalità Guidata.';
  if (!state.campfirePending)
    return 'Attendi il consiglio stagionale oppure prepara una breve lezione.';
  if (state.gameOver || state.victory) return 'Questa storia è conclusa.';
  if (!hasBuilding(state, 'campfire')) return 'Il Falò è spento, distrutto o incompleto.';
  if (state.attention >= getDogmaEffects(state).attentionCap)
    return 'L’Attenzione è già al massimo.';
  if (state.resources.wood < GUIDED_PROGRESSION.councilWoodCost)
    return 'Manca legno nelle scorte: riportalo al campo con Portare.';
  return undefined;
}
