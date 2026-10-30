import { WORDS } from './content';
import { forbiddenByDogma, getDogmaEffects } from './dogmas';
import { canPayLocally } from './craftMaterials';
import { entityResource, getSeason, guidedRepeatTransport, plainToolCraft } from './simulation';
import { freeCapacity, hasWord } from './runtime';
import { COLD_RESCUE } from './thermal';
import type { GameState, Target, Unit } from './types';

export type TaskOutcomeReason =
  | 'completed'
  | 'exhausted'
  | 'full'
  | 'hunger'
  | 'cold'
  | 'rest'
  | 'forgotten'
  | 'rule'
  | 'materials'
  | 'ended';
export interface TaskOutcome {
  id: string;
  time: number;
  unitIds: string[];
  tokens: string[];
  reason: TaskOutcomeReason;
  title: string;
  detail: string;
  /** The last real work destination; resuming remains a new explicit order. */
  target?: Target;
  suspended: boolean;
}

const messages: Record<TaskOutcomeReason, { title: string; detail: string }> = {
  completed: {
    title: 'Compito completato',
    detail:
      'Il compito è concluso. Puoi preparare di nuovo la stessa frase o impartire un altro ordine.',
  },
  exhausted: {
    title: 'Fonte esaurita',
    detail:
      'La fonte di questo incarico non ha più risorse. Prepara la frase e scegli un nuovo bersaglio.',
  },
  full: {
    title: 'Scorte piene',
    detail:
      'Non c’è spazio per continuare questo lavoro. Libera le scorte o aumenta la capienza, poi verifica il nuovo ordine.',
  },
  hunger: {
    title: 'Lavoro sospeso per fame',
    detail:
      'Il compagno deve mangiare. Gli incarichi agli edifici possono riprendere nel turno previsto; gli ordini diretti vanno impartiti di nuovo.',
  },
  cold: {
    title: 'Lavoro sospeso per freddo',
    detail: 'Il compagno cerca calore. Mettilo al riparo prima di riprendere il compito.',
  },
  rest: {
    title: 'È tempo di riposare',
    detail:
      'Il turno di lavoro è finito. Gli incarichi salvati possono riprendere nel proprio turno; i compiti diretti diurni richiedono un nuovo ordine.',
  },
  forgotten: {
    title: 'Manca una parola dell’ordine',
    detail:
      'Una parola usata nel compito è stata dimenticata. Va riscoperta prima di impartire di nuovo questa frase.',
  },
  rule: {
    title: 'Il compito incontra un divieto',
    detail:
      'Un dogma vieta questa azione. Per ripeterla, devi prima cambiare le regole della comunità.',
  },
  materials: {
    title: 'Mancano materiali utilizzabili',
    detail: 'Per continuare servono altri materiali nel luogo di lavoro.',
  },
  ended: {
    title: 'Ordine non più attivo',
    detail:
      'Questo compito diretto non è più in esecuzione. Puoi rivedere la frase e il bersaglio prima di inviare un nuovo ordine.',
  },
};

function workTarget(state: GameState, unit: Unit): Target | undefined {
  const entity = state.entities.find((entry) => entry.id === unit.targetId);
  if (entity) return { type: 'entity', id: entity.id, x: entity.x, y: entity.y };
  const building = state.buildings.find(
    (entry) => entry.id === (unit.jobBuildingId ?? unit.targetId),
  );
  if (building) return { type: 'building', id: building.id, x: building.x, y: building.y };
  if (unit.tx !== undefined && unit.ty !== undefined)
    return { type: 'point', x: unit.tx, y: unit.ty };
  return undefined;
}

function completedWork(previous: GameState, next: GameState, unit: Unit, after: Unit) {
  const verb = unit.command?.find((id) => WORDS[id]?.kind === 'V');
  if (!verb || (after.lastEventAt?.[`WORK:${verb}`] ?? -Infinity) <= previous.time) return false;
  if (unit.action === 'building')
    return next.buildings.some(
      (building) =>
        !previous.buildings.some((old) => old.id === building.id) &&
        building.kind === unit.buildingKind &&
        building.completed !== false,
    );
  if (unit.action === 'planting')
    return next.entities.some(
      (entity) =>
        entity.kind === 'seedling' && !previous.entities.some((old) => old.id === entity.id),
    );
  const resource =
    unit.action === 'crafting'
      ? unit.command?.includes('O_03')
        ? 'spear'
        : 'tool'
      : unit.action === 'cooking'
        ? unit.command?.includes('O_02')
          ? 'pottery'
          : 'cooked'
        : undefined;
  if (!resource || unit.craftNeedsPayment) return false;
  const total = (state: GameState) =>
    state.resources[resource] +
    state.entities
      .filter((entity) => entity.kind === 'ground' && entity.resource === resource)
      .reduce((sum, entity) => sum + entity.amount, 0);
  return total(next) > total(previous) + 1e-8;
}

/** Observes actual simulation transitions. No reason is fabricated from an idle
 * unit alone, and no future work or free automatic restart is scheduled. */
export function observeTaskOutcomes(previous: GameState, next: GameState): TaskOutcome[] {
  if (next.time <= previous.time || next.stats.commands !== previous.stats.commands) return [];
  const grouped = new Map<string, TaskOutcome>();
  for (const before of previous.units) {
    if (
      before.hp <= 0 ||
      before.age < 4 ||
      (before.factionId && before.factionId !== 'player') ||
      !before.command?.length
    )
      continue;
    if (
      [
        'delegating',
        'frontline',
        'frontline-returning',
        'colonizing',
        'assimilating',
        'trading',
      ].includes(before.action)
    )
      continue;
    const after = next.units.find((unit) => unit.id === before.id);
    if (!after || after.hp <= 0 || (after.factionId && after.factionId !== 'player')) continue;
    const signature = before.command.join('|');
    if (after.command?.join('|') === signature) continue;
    // A resumed/changed autonomous command is not an event about the old job.
    if (after.command?.length) continue;
    const suspended = after.suspendedJob?.command.join('|') === signature;
    const target = workTarget(previous, before);
    const source = next.entities.find((entity) => entity.id === before.targetId);
    const endedDirectDayTask =
      previous.playMode === 'guided' &&
      (guidedRepeatTransport(previous, before.command) || plainToolCraft(before.command));
    const night = getSeason(next).isNight;
    const outsideShift =
      before.command[0] === 'C_01'
        ? !night
        : getDogmaEffects(next, { unit: after }).nightWatch
          ? !night
          : night;
    let reason: TaskOutcomeReason = 'ended';
    if (before.command.some((id) => !hasWord(next, id))) reason = 'forgotten';
    else if (forbiddenByDogma(next, before.command, target, after)) reason = 'rule';
    else if (
      (suspended || endedDirectDayTask || ['eating', 'resting'].includes(after.action)) &&
      after.hunger >= 75
    )
      reason = 'hunger';
    else if (
      (suspended || endedDirectDayTask || ['resting', 'fleeing'].includes(after.action)) &&
      after.temp <=
        (next.playMode === 'guided' ? COLD_RESCUE.guidedWarning : COLD_RESCUE.classicWarning)
    )
      reason = 'cold';
    else if ((suspended && outsideShift) || (endedDirectDayTask && night)) reason = 'rest';
    else if (
      source &&
      source.amount <= 0 &&
      ['gathering', 'returning', 'hunting', 'domesticating'].includes(before.action)
    )
      reason = 'exhausted';
    else if (
      before.command.includes('V_04') &&
      source &&
      freeCapacity(next, entityResource(source)) <= 0
    )
      reason = 'full';
    else if (before.craftNeedsPayment && !canPayLocally(next, { stone: 1 }, after))
      reason = 'materials';
    else if (before.craftNeedsPayment && freeCapacity(next, 'tool') <= 0) reason = 'full';
    else if (completedWork(previous, next, before, after)) reason = 'completed';
    // A routine daytime household return is too small to interrupt the player.
    if (reason === 'ended' && before.action === 'moving') continue;
    const key = `${next.time.toFixed(3)}:${signature}:${reason}:${target?.id ?? ''}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.unitIds.push(after.id);
      continue;
    }
    grouped.set(key, {
      id: `task:${key}:${after.id}`,
      time: next.time,
      unitIds: [after.id],
      tokens: [...before.command],
      reason,
      ...messages[reason],
      target,
      suspended,
    });
  }
  return [...grouped.values()];
}

/** Bounded local interface history; nothing is inserted into the game save. */
export function appendTaskOutcomes(current: TaskOutcome[], incoming: TaskOutcome[], limit = 8) {
  const existing = new Set(current.map((event) => event.id));
  return [...incoming.filter((event) => !existing.has(event.id)), ...current].slice(0, limit);
}

export function taskPhraseLabel(outcome: TaskOutcome) {
  return outcome.tokens.map((id) => WORDS[id]?.label ?? '…').join(' · ');
}
