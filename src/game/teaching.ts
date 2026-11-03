import { ADULT_AGE, LEARNING_AGE_LIMIT, WORDS } from './content';
import { getDogmaEffects } from './dogmas';
import { GUIDED_PROGRESSION } from './guidedProgression';
import { activeUnits, distance, hasBuilding, isPlayerBuilding } from './runtime';
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
  /** Simultaneous, distinct teacher/pupil pairs. Singular aliases expose pair zero. */
  teachers: Unit[];
  pupils: Unit[];
  attentionCost: number;
  pupilCap: number;
  memoryGain: number;
  retentionGain: number;
  livingCustodians: number;
}

export const GUIDED_LESSON_PUPIL_LIMIT = 3;
export const LESSON_ATTENTION_COST = 10;

const nextLessonSeed = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
function choosePupil(pool: Unit[], seed: number) {
  const children = pool.filter((unit) => unit.age < ADULT_AGE);
  const pupils = children.length ? children : pool;
  return pupils[Math.min(Math.floor((seed / 4294967296) * pupils.length), pupils.length - 1)];
}

/** Pure preview: reproduces every pupil draw, without spending seed or Attention.
 * Guided can share a paid round among existing custodians gathered at a fire;
 * each extra teacher helps one distinct pupil, with no cascading in that round. */
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
  const teacher = teachers[0];
  const pupil = choosePupil(eligible, state.seed);
  const roundTeachers = teacher && pupil ? [teacher] : [];
  const roundPupils = teacher && pupil ? [pupil] : [];
  const fires = state.buildings.filter(
    (fire) =>
      isPlayerBuilding(state, fire) &&
      fire.kind === 'campfire' &&
      fire.hp > 0 &&
      fire.active &&
      fire.completed !== false,
  );
  const extraTeachers =
    state.playMode === 'guided'
      ? teachers
          .slice(1)
          .filter(
            (unit) =>
              unit.knows.includes(wordId) && fires.some((fire) => distance(unit, fire) <= 15),
          )
      : [];
  const pupilCap = teacher ? Math.min(GUIDED_LESSON_PUPIL_LIMIT, 1 + extraTeachers.length) : 0;
  let seed = nextLessonSeed(state.seed);
  for (const extraTeacher of extraTeachers) {
    if (roundPupils.length >= pupilCap || !pupil) break;
    const candidates = eligible.filter(
      (unit) =>
        !roundPupils.some((chosen) => chosen.id === unit.id) &&
        fires.some((fire) => distance(extraTeacher, fire) <= 15 && distance(unit, fire) <= 15),
    );
    const nextPupil = choosePupil(candidates, seed);
    if (!nextPupil) continue;
    roundTeachers.push(extraTeacher);
    roundPupils.push(nextPupil);
    seed = nextLessonSeed(seed);
  }
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
                  : state.attention < LESSON_ATTENTION_COST
                    ? 'no-attention'
                    : undefined;
  return {
    allowed: !issue,
    issue,
    teacher,
    pupil,
    teachers: roundTeachers,
    pupils: roundPupils,
    attentionCost: LESSON_ATTENTION_COST,
    pupilCap,
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
