import {
  ACTION_NAMES,
  ADULT_AGE,
  LEARNING_AGE_LIMIT,
  BUILDING_SPECS,
  RESOURCE_ORDER,
  RESOURCE_SPECS,
  WORDS,
  WORD_ORDER,
} from './content';
import { createInitialState } from './state';
import { canFitCraftOutput, canPayLocally, payLocally } from './craftMaterials';
import { validSave } from './saveValidation';
import { cognitiveSlots, compileSentence, getPredicate, resolveConstruction } from './grammar';
import { getDogmaEffects, inscribeDogma } from './dogmas';
import { recordLawWork } from './imperialLawPolicy';
import {
  activeUnits,
  adult,
  availableWords,
  canPay,
  clamp,
  copy,
  distance,
  hasBuilding,
  hasWord,
  isPlayerBuilding,
  log,
  pay,
  totalFood,
} from './runtime';
import {
  advanceTier,
  canIgnite,
  createBuilding,
  dropCarriedLoad,
  finishSeasonMemory,
  getSeason,
  initializeUnit,
  matchingEntities,
  population,
  recordEvent,
  resetUnit,
  seasonalCore,
  simulationStep,
  tryIgnite,
} from './simulation';
import {
  enforceActionLaws,
  handleImperialCommand,
  inscribeLaw,
  registerTradition,
  seasonalImperial,
  updateImperial,
} from './imperial';
import type {
  BuildingKind,
  GameState,
  Inventory,
  Objective,
  Resource,
  Spark,
  Target,
  Unit,
} from './types';

export {
  compileSentence,
  cognitiveSlots,
  getPredicate,
  resolveConstruction,
  getSeason,
  hasWord,
  ACTION_NAMES,
  WORD_ORDER,
};
export { getDogmaVectors, previewDogma, inscribeDogma, removeDogma } from './dogmas';
export function createGame(seed = 6842, playMode: 'guided' | 'classic' = 'classic') {
  return createInitialState(seed, playMode);
}
function chooseSubjects(
  s: GameState,
  subject: string,
  target?: Target,
  executorId?: string,
  selectionCenter?: Target,
) {
  const living = activeUnits(s);
  const units = living.filter(adult);
  if (subject === 'S_02') {
    const chosen = units.find((u) => u.id === executorId) ?? units.find((u) => u.id === target?.id);
    return chosen ? [chosen] : [];
  }
  if (subject === 'S_03') return units.filter((u) => u.strength >= 7);
  if (subject === 'S_04') return units.filter((u) => u.intelligence >= 7);
  if (subject === 'S_06') return units.filter((u) => u.caste === 'slave');
  if (subject === 'S_07') return units.filter((u) => u.id === s.kingId);
  if (subject === 'S_05')
    return s.units.filter(
      (u) =>
        u.hp > 0 &&
        u.factionId !== undefined &&
        u.factionId !== 'player' &&
        distance(u, s.home) <= (hasBuilding(s, 'palace') ? 100 : 35),
    );
  const anchor = selectionCenter ?? { ...s.home, type: 'point' as const };
  if (
    anchor.type === 'building' &&
    s.buildings.some(
      (b) => b.id === anchor.id && b.kind === 'campfire' && b.hp > 0 && isPlayerBuilding(s, b),
    )
  )
    return units;
  return units.filter((u) => distance(u, anchor) <= 15);
}
function nearest<T extends { x: number; y: number }>(items: T[], p: { x: number; y: number }) {
  return items.reduce<T | undefined>(
    (a, b) => (!a || distance(p, b) < distance(p, a) ? b : a),
    undefined,
  );
}
function assignBuildingJob(
  s: GameState,
  u: Unit,
  kind: BuildingKind,
  tokens: string[],
  buildingId?: string,
) {
  const spec = BUILDING_SPECS[kind];
  if (
    !adult(u) ||
    spec.workers === 0 ||
    (spec.workerKind === 'sage' && u.intelligence < 7) ||
    (spec.workerKind === 'warrior' && u.strength < 7)
  )
    return false;
  const b = nearest(
    s.buildings.filter(
      (b) =>
        isPlayerBuilding(s, b) &&
        (!buildingId || b.id === buildingId) &&
        b.kind === kind &&
        b.hp > 0 &&
        b.active &&
        b.completed !== false &&
        (b.workerIds ?? []).filter(
          (id) =>
            id !== u.id && s.units.find((u) => u.id === id && u.hp > 0)?.jobBuildingId === b.id,
        ).length < BUILDING_SPECS[kind].workers,
    ),
    u,
  );
  if (!b) return false;
  for (const old of s.buildings) old.workerIds = old.workerIds?.filter((id) => id !== u.id);
  dropCarriedLoad(s, u);
  resetUnit(u);
  u.action = 'working';
  u.jobBuildingId = b.id;
  u.targetId = b.id;
  u.tx = b.x;
  u.ty = b.y;
  u.command = [...tokens];
  u.progress = 0;
  b.workerIds ??= [];
  b.workerIds.push(u.id);
  return true;
}
export function issueCommand(
  state: GameState,
  tokens: string[],
  target?: Target,
  executorId?: string,
  selectionCenter?: Target,
): GameState {
  let s = copy(state);
  const compiled = compileSentence(s, tokens, target);
  if (!compiled.valid) {
    log(s, compiled.message, 'warning');
    return s;
  }
  if (compiled.requiresTarget) {
    log(s, 'Indica un bersaglio sulla mappa.', 'warning');
    return s;
  }
  if (compiled.kind === 'law') return inscribeLaw(s, tokens);
  if (compiled.kind === 'dogma') {
    const args = compiled.args ?? tokens.filter((t) => t !== 'M_03');
    return inscribeDogma(s, args[0], args[1]);
  }
  if (compiled.kind === 'tradition' && tokens.join('|') !== 'C_02|S_01|M_05') {
    const registered = registerTradition(s, tokens, target);
    if (registered.traditions.length > s.traditions.length) {
      const p = getPredicate(tokens);
      if (
        p.verb === 'V_02' &&
        p.args.includes('O_04') &&
        p.args.includes('M_04') &&
        /^S_0[1-7]$/.test(p.subject)
      ) {
        const chosen = chooseSubjects(registered, p.subject, target, executorId, selectionCenter);
        if (p.subject !== 'S_02' || chosen[0])
          registered.foodPriority = {
            subjectId: p.subject,
            unitId: p.subject === 'S_02' ? chosen[0].id : undefined,
          };
      }
    }
    return registered;
  }
  if (s.voice < 1) {
    log(s, 'La voce è esaurita: un punto si rigenera ogni dieci secondi.', 'warning');
    return s;
  }
  const { subject, verb, args, condition } = getPredicate(tokens);
  if (condition === 'C_01' && !getSeason(s).isNight) {
    log(s, 'Questo ordine attende la notte.', 'warning');
    return s;
  }
  const workers = chooseSubjects(s, subject, target, executorId, selectionCenter);
  const selectedIds =
    ['S_08', 'S_09'].includes(subject) && executorId ? [executorId] : workers.map((u) => u.id);
  if (!enforceActionLaws(s, tokens, target, selectedIds)) return s;
  const imperial = handleImperialCommand(s, tokens, target, executorId);
  if (imperial.handled) {
    if (imperial.valid) {
      s.voice--;
      s.stats.commands++;
      for (const id of tokens) s.words[id].uses++;
      log(s, imperial.message ?? 'L’ordine è stato compreso.', 'good');
    } else log(s, imperial.message ?? 'L’ordine non può essere eseguito.', 'warning');
    return s;
  }
  if (!workers.length) {
    log(
      s,
      subject === 'S_02'
        ? 'Seleziona prima l’individuo che deve agire.'
        : 'Non ci sono adulti del gruppo nel raggio di quindici metri: scegli il punto da cui chiamarli.',
      'warning',
    );
    return s;
  }
  const recipe = resolveConstruction(tokens);
  // Repeating the building's own phrase on that building assigns its real workers.
  // Material payment remains attached to actual construction, not reassigning a job.
  const workplace =
    target?.type === 'building' &&
    recipe &&
    s.buildings.find(
      (b) =>
        b.id === target.id &&
        b.kind === recipe.kind &&
        b.hp > 0 &&
        b.active &&
        b.completed !== false &&
        isPlayerBuilding(s, b),
    );
  if (workplace && BUILDING_SPECS[workplace.kind].workers > 0) {
    let assigned = 0,
      droppedCargo = false;
    for (const u of workers) {
      const loaded = (u.carry?.amount ?? 0) > 0;
      if (assignBuildingJob(s, u, workplace.kind, tokens, workplace.id)) {
        assigned++;
        droppedCargo ||= loaded;
      }
    }
    if (!assigned) {
      log(s, 'Non ci sono posti liberi o persone con le competenze richieste.', 'warning');
      return s;
    }
    s.voice--;
    s.stats.commands++;
    for (const id of tokens) s.words[id].uses++;
    if (droppedCargo) log(s, 'Il carico è rimasto a terra dopo il nuovo ordine.', 'warning');
    log(
      s,
      `${BUILDING_SPECS[workplace.kind].label}: ${assigned} persone hanno ricevuto il lavoro.`,
      'good',
    );
    return s;
  }
  let cost: Partial<Inventory> = { ...compiled.cost },
    kind: BuildingKind | undefined = compiled.buildingKind;
  if (recipe) {
    kind = recipe.kind;
    cost = { ...recipe.cost };
    if (kind === 'storage' && !canPay(s.resources, cost) && canPay(s.resources, { stone: 10 }))
      cost = { stone: 10 };
  }
  const existing =
    kind && s.buildings.find((b) => isPlayerBuilding(s, b) && b.kind === kind && b.hp > 0);
  if (
    kind &&
    ['farm', 'pen', 'foundry'].includes(kind) &&
    existing &&
    (!target || target.type === 'building' || compiled.kind === 'tradition')
  ) {
    kind = undefined;
    cost = {};
  }
  if (kind && BUILDING_SPECS[kind].unique && existing) {
    log(s, 'Questa costruzione è già presente.', 'warning');
    return s;
  }
  if (verb === 'V_07') cost = args.includes('O_02') ? { stone: 1 } : { meat: 1 };
  if (
    verb === 'V_06' &&
    !kind &&
    !canFitCraftOutput(s, cost, args.includes('O_03') ? 'spear' : 'tool')
  ) {
    log(s, 'Non c’è spazio per un nuovo manufatto.', 'warning');
    return s;
  }
  const localCraft = ['V_06', 'V_07'].includes(verb) && !kind;
  if (!canPay(s.resources, cost) && !(localCraft && canPayLocally(s, cost, workers[0]))) {
    log(
      s,
      `Materiali insufficienti: ${Object.entries(cost)
        .map(([r, n]) => `${n} ${RESOURCE_SPECS[r as Resource].label}`)
        .join(', ')}.`,
      'warning',
    );
    return s;
  }
  if (verb === 'V_05' && args.includes('O_05')) {
    if (!canIgnite(s, target?.x ?? s.home.x, target?.y ?? s.home.y)) {
      log(s, 'Accendere il primo falò richiede cinque legna effettivamente raccolte.', 'warning');
      return s;
    }
  }
  if (verb === 'V_06' && args.includes('O_09') && target?.id?.startsWith('word:'))
    s.lastCraftWord = target.id.slice(5);
  if (localCraft) payLocally(s, cost, workers[0]);
  else pay(s.resources, cost);
  if (
    verb === 'V_02' &&
    args.includes('O_04') &&
    args.includes('M_04') &&
    /^S_0[1-7]$/.test(subject)
  ) {
    s.foodPriority = {
      subjectId: subject,
      unitId: subject === 'S_02' ? workers[0]?.id : undefined,
    };
    log(s, 'La priorità delle scorte viene assegnata al soggetto della frase.', 'info');
  }
  let droppedCargo = false,
    assigned = 0;
  if (kind) {
    const builder = workers[0];
    assigned++;
    droppedCargo = dropCarriedLoad(s, builder);
    resetUnit(builder);
    builder.action = 'building';
    builder.command = [...tokens];
    builder.buildingKind = kind;
    builder.paidConstruction = cost;
    builder.tx = target?.type === 'point' ? target.x : s.home.x + 5 + (s.buildings.length % 5) * 3;
    builder.ty =
      target?.type === 'point' ? target.y : s.home.y + 5 + Math.floor(s.buildings.length / 5) * 3;
    builder.progress = 0;
  } else
    for (const u of workers) {
      let e = target?.type === 'entity' ? s.entities.find((e) => e.id === target.id) : undefined;
      const pool = matchingEntities(s, tokens, u);
      if (
        args.some((t) => ['O_02', 'O_03', 'O_04', 'O_07', 'O_06'].includes(t)) &&
        (!e || !pool.includes(e))
      )
        e = nearest(pool, u);
      // A failed workplace assignment does not interrupt an existing transport.
      const buildingJob: BuildingKind | undefined =
        verb === 'V_05' && args.includes('O_09')
          ? 'archive'
          : verb === 'V_09' && !args.includes('O_03')
            ? 'farm'
            : verb === 'V_10' && !e
              ? 'pen'
              : verb === 'V_12'
                ? 'foundry'
                : undefined;
      if (buildingJob) {
        const loaded = (u.carry?.amount ?? 0) > 0;
        if (assignBuildingJob(s, u, buildingJob, tokens)) {
          assigned++;
          u.lastOrderAt = s.time;
          droppedCargo ||= loaded;
        }
        continue;
      }
      droppedCargo = dropCarriedLoad(s, u) || droppedCargo;
      assigned++;
      resetUnit(u);
      u.command = [...tokens];
      u.lastOrderAt = s.time;
      if (verb === 'V_01') {
        u.action = 'moving';
        const destination = args.includes('O_01')
          ? s.home
          : args.includes('S_05')
            ? nearest(
                s.cities.filter((c) => c.factionId !== 'player'),
                u,
              )
            : target;
        u.tx = destination?.x ?? s.home.x;
        u.ty = destination?.y ?? s.home.y;
      } else if (verb === 'V_02') {
        u.action = 'eating';
        if (!e)
          e = nearest(
            s.entities.filter(
              (e) =>
                e.amount > 0 &&
                ((e.kind === 'berries' && getSeason(s).index !== 3) ||
                  (['deer', 'wolf', 'alpha', 'mammoth', 'corpse'].includes(e.kind) && e.hp <= 0)),
            ),
            u,
          );
        u.targetId = e?.id;
        u.tx = e?.x;
        u.ty = e?.y;
      } else if (verb === 'V_03') {
        u.action =
          e && ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) ? 'hunting' : 'gathering';
        u.targetId =
          e?.id ?? (target?.type === 'unit' || target?.type === 'city' ? target.id : undefined);
        u.tx = e?.x ?? target?.x;
        u.ty = e?.y ?? target?.y;
        if (e) e.attacked = true;
      } else if (verb === 'V_04') {
        if (args.includes('O_05'))
          e = nearest(
            s.entities.filter(
              (e) =>
                (e.kind === 'tree' && e.amount > 0) ||
                (e.kind === 'ground' && e.resource === 'wood' && e.amount > 0),
            ),
            u,
          );
        u.action = 'gathering';
        u.targetId = e?.id;
        u.tx = e?.x;
        u.ty = e?.y;
      } else if (verb === 'V_05' && args.includes('O_05')) {
        tryIgnite(s, target?.x ?? s.home.x, target?.y ?? s.home.y);
        u.action = 'guarding';
        u.tx = target?.x ?? s.home.x;
        u.ty = target?.y ?? s.home.y;
      } else if (verb === 'V_05' && args.includes('O_12')) {
        u.action = 'saving';
        u.command = [...tokens];
      } else if (verb === 'V_05' && args.includes('O_01')) {
        u.action = 'patrolling';
        u.tx = s.home.x;
        u.ty = s.home.y;
      } else if (verb === 'V_06' || verb === 'V_07') {
        u.action = verb === 'V_06' ? 'crafting' : 'cooking';
        u.tx = u.x;
        u.ty = u.y;
        break;
      } else if (verb === 'V_09') {
        if (args.includes('O_03')) {
          u.action = 'planting';
          u.tx = target?.x ?? u.x;
          u.ty = target?.y ?? u.y;
        }
      } else if (verb === 'V_10') {
        if (e) {
          u.action = 'domesticating';
          u.targetId = e.id;
          u.tx = e.x;
          u.ty = e.y;
        }
      }
    }
  if (!assigned) {
    log(s, 'Non ci sono posti liberi o persone con le competenze richieste.', 'warning');
    return s;
  }
  s.voice--;
  s.stats.commands++;
  for (const id of tokens) s.words[id].uses++;
  if (droppedCargo) log(s, 'Il carico è rimasto a terra dopo il nuovo ordine.', 'warning');
  log(
    s,
    `«${tokens.map((w) => WORDS[w].label).join(' · ')}»: ${workers.length === 1 ? workers[0].name : 'il gruppo'} ha compreso.`,
    'good',
  );
  return s;
}
export function solveSpark(state: GameState, id: string, chosen: string[]): GameState {
  const s = copy(state),
    spark = s.sparks.find((p) => p.id === id),
    u = s.units.find((u) => u.id === spark?.unitId && u.hp > 0);
  if (!spark || !u || spark.expiresAt < s.time) return s;
  initializeUnit(u);
  s.sparks = s.sparks.filter((p) => p.id !== id);
  const expected = [...spark.recipe].sort(),
    actual = [...chosen].sort();
  if (expected.length !== actual.length || expected.some((w, i) => actual[i] !== w)) {
    const tension = s.tension[spark.wordId] ?? 100;
    u.tension![spark.wordId] = Math.max(0, (u.tension![spark.wordId] ?? 0) - 35);
    s.tension[spark.wordId] = Math.max(0, tension - 35);
    u.cooldowns![spark.wordId] = s.time + 15;
    s.cooldowns[spark.wordId] = s.time + 15;
    s.eventTimes[`correct-${spark.wordId}`] = chosen.filter((w) => expected.includes(w)).length;
    // Frustration is an instantaneous −35 contribution to the real event buffer.
    u.eventMemory!.push({
      tag: 'FRUSTRATION',
      time: s.time,
      weight: -35 / (u.intelligence / 5),
      wordIds: [spark.wordId],
    });
    log(
      s,
      `${
        chosen
          .filter((w) => expected.includes(w))
          .map((w) => WORDS[w].label)
          .join(', ') || 'Nessun concetto'
      } era nella direzione giusta. Tensione −35; attesa quindici secondi.`,
      'warning',
    );
    return s;
  }
  s.words[spark.wordId] = { retention: 50, custodians: [u.id], uses: 0, investment: 0, support: 0 };
  if (!u.knows.includes(spark.wordId)) u.knows.push(spark.wordId);
  s.stats.discoveries++;
  s.bornWords ??= {};
  s.bornWords[spark.wordId] = s.time;
  if (spark.wordId === 'S_07') {
    s.government = 'monarchy';
    s.kingId = u.id;
    u.isKing = true;
  }
  if (spark.wordId === 'O_05') {
    if (s.playMode === 'guided') tryIgnite(s);
    else tryIgnite(s, u.x, u.y);
  }
  if (spark.wordId === 'C_02' && hasWord(s, 'S_02') && hasWord(s, 'M_03'))
    recordEvent(s, u, 'ENV_AUTHORITY', 100, ['S_07']);
  if (spark.wordId === 'M_04') u.wealth = Math.max(1, u.wealth ?? 0);
  log(
    s,
    `«${WORDS[spark.wordId].label}» ha un nome; ${u.name} ne è il primo custode.`,
    'discovery',
  );
  advanceTier(s);
  return s;
}
export function teachWord(state: GameState, id: string): GameState {
  const s = copy(state),
    m = s.words[id];
  if (
    !m ||
    WORDS[id].tier === 0 ||
    m.retention <= 0 ||
    !hasBuilding(s, 'campfire') ||
    s.attention < 10
  )
    return s;
  const eligible = activeUnits(s).filter(
    (u) => u.age < LEARNING_AGE_LIMIT && u.caste !== 'slave' && !m.custodians.includes(u.id),
  );
  const children = eligible.filter((u) => u.age < ADULT_AGE);
  const pupils = children.length ? children : eligible;
  if (!pupils.length) {
    log(s, 'Nessun giovane può ancora apprendere questa parola.', 'warning');
    return s;
  }
  const index = Math.floor((s.seed / 4294967296) * pupils.length),
    pupil = pupils[Math.min(index, pupils.length - 1)];
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  s.attention -= 10;
  const efficacy = getDogmaEffects(s).teaching;
  m.retention = clamp(m.retention + 10 * efficacy);
  m.investment = (m.investment ?? 0) + efficacy;
  s.stats.taught++;
  m.custodians.push(pupil.id);
  pupil.knows.push(id);
  pupil.intelligence = clamp(pupil.intelligence + 0.2, 1, 10);
  if (id === 'O_09') recordLawWork(s, pupil.id, ['S_01', 'V_05', 'O_09', 'M_02']);
  log(
    s,
    `«${WORDS[id].label}» viene tramandata a ${pupil.name}: ${10 * efficacy} memoria e un nuovo custode.`,
    'good',
  );
  advanceTier(s);
  return s;
}

export function dismissCampfire(state: GameState) {
  const s = copy(state);
  if (s.campfirePending) finishSeasonMemory(s);
  s.campfirePending = false;
  s.pendingSeason = false;
  return s;
}
export function tick(state: GameState, dt: number): GameState {
  if (
    !state.started ||
    state.paused ||
    state.gameOver ||
    state.campfirePending ||
    state.victory ||
    !Number.isFinite(dt) ||
    dt <= 0
  )
    return state;
  const s = copy(state);
  let remaining = Math.min(60, dt) * s.speed;
  while (remaining > 1e-8 && !s.gameOver && !s.campfirePending && !s.victory) {
    const d = Math.min(0.25, remaining),
      previous = Math.floor(s.time / 90),
      archiveBefore = s.buildings.some(
        (b) => isPlayerBuilding(s, b) && b.kind === 'archive' && b.hp > 0,
      );
    s.time += d;
    remaining -= d;
    s.seasonIndex = Math.floor(s.time / 90);
    s.voiceProgress += d;
    while (s.voiceProgress >= 10) {
      s.voice = Math.min(hasWord(s, 'S_07') ? 5 : 3, s.voice + 1);
      s.voiceProgress -= 10;
    }
    simulationStep(s, d);
    updateImperial(s, d);
    if (Math.floor(s.time / 90) > previous) {
      seasonalCore(s);
      seasonalImperial(s);
      if (!s.campfirePending) finishSeasonMemory(s);
    }
    if (
      archiveBefore &&
      !s.buildings.some((b) => isPlayerBuilding(s, b) && b.kind === 'archive' && b.hp > 0)
    ) {
      for (const m of Object.values(s.words)) if (m.uses === 0) m.retention *= 0.3;
      log(
        s,
        'L’Archivio è distrutto: le parole non usate perdono il settanta per cento della memoria.',
        'danger',
      );
    }
    if (
      s.time >= 360 &&
      population(s) >= 4 &&
      hasBuilding(s, 'campfire') &&
      hasBuilding(s, 'storage')
    )
      s.milestone = true;
  }
  return s;
}
export function getObjective(s: GameState): Objective {
  const known = availableWords(s),
    stable = known.filter((w) => s.words[w].retention >= 50).length;
  if (s.victory)
    return {
      title: 'La storia è compiuta',
      description: 'Una delle tre condizioni finali del mondo è stata raggiunta.',
      progress: 1,
      current: 1,
      total: 1,
    };
  if (s.tier >= 4)
    return {
      title: s.tier === 4 ? 'La memoria oltre la vita' : 'Una civiltà di parole',
      description:
        s.tier === 4
          ? 'Sostieni la memoria con archivi e stele, governa le città e prepara le leggi.'
          : 'Domina, diffondi la tua lingua o supera i dogmi attraverso la filosofia.',
      progress: known.length / 45,
      current: known.length,
      total: 45,
    };
  if (s.tier === 3)
    return {
      title: 'Una frase che dura',
      description:
        'Fissa una tradizione con Sempre. Coltiva, alleva e incontra popoli che parlano altre lingue.',
      progress: stable / 25,
      current: stable,
      total: 25,
    };
  if (s.stats.commands === 0)
    return {
      title: 'Dare forma a un pensiero',
      description:
        'Componi Gruppo + Colpire, scegli un ostacolo e pronuncia. Il gruppo selezionato parte dal campo.',
      progress: 0,
      current: 0,
      total: 1,
    };
  if (!hasWord(s, 'O_03') || !hasWord(s, 'O_02'))
    return {
      title: 'Le mani conoscono la materia',
      description:
        'Colpisci alberi e rocce. Le esperienze vicine nel tempo si sommano nella mente di ciascuno.',
      progress: known.length / 6,
      current: known.length,
      total: 6,
    };
  if (!hasWord(s, 'S_02') && !hasWord(s, 'O_01')) {
    if (s.playMode === 'guided')
      return {
        title: 'Il luogo a cui torniamo (Qui)',
        description:
          'Prima del buio, usa Gruppo + Andare sul giaciglio. Dormire vicini per una notte fa nascere Qui e apre il terzo spazio.',
        progress: Math.min(1, s.nightSleeping),
        current: Math.min(1, s.nightSleeping),
        total: 1,
      };
    const maxIso = s.units.reduce((max, u) => Math.max(max, u.isolation ?? 0), 0);
    return {
      title: 'La voce dell’individuo (Io)',
      description:
        'Allontana un compagno dal gruppo a oltre cinquanta metri per trenta secondi. Chi resta solo scopre «Io» e sblocca il terzo spazio prima dell’inverno.',
      progress: Math.min(1, maxIso / 30),
      current: Math.min(30, Math.floor(maxIso)),
      total: 30,
    };
  }
  if (!hasWord(s, 'O_01'))
    return {
      title: 'Il luogo a cui torniamo (Qui)',
      description:
        s.playMode === 'guided'
          ? 'Almeno tre quarti della tribù devono dormire vicino al giaciglio per una notte.'
          : 'Almeno tre quarti della tribù devono dormire entro dieci metri dalla tana per due notti consecutive.',
      progress: s.nightSleeping / (s.playMode === 'guided' ? 1 : 2),
      current: s.nightSleeping,
      total: s.playMode === 'guided' ? 1 : 2,
    };
  if (!hasWord(s, 'O_05'))
    return {
      title: 'La luce nella materia (Fuoco)',
      description:
        s.playMode === 'guided'
          ? 'Porta legna e pietra al campo. Gruppo + Scheggiare + Pietra crea utensili ripetuti: ogni lavorazione reale avvicina il Fuoco. Servono cinque legna al campo per accenderlo.'
          : 'Lavora la selce con Io + Scheggiare + Pietra. Unire Scheggiare e Legno farà intuire il Fuoco prima del gelo.',
      progress: (s.tension.O_05 ?? 0) / 100,
      current: Math.floor(s.tension.O_05 ?? 0),
      total: 100,
    };
  if (!hasBuilding(s, 'campfire')) {
    const nearbyWood =
      s.resources.wood +
      s.entities
        .filter(
          (e) =>
            e.kind === 'ground' &&
            e.resource === 'wood' &&
            Math.hypot(e.x - s.home.x, e.y - s.home.y) <= 15,
        )
        .reduce((sum, e) => sum + e.amount, 0);
    return {
      title: 'Accendere il primo Falò',
      description:
        'Servono cinque legna vicino alla tana per accendere il Falò e proteggere la tribù dal freddo dell’inverno.',
      progress: Math.min(1, nearbyWood / 5),
      current: Math.min(5, Math.floor(nearbyWood)),
      total: 5,
    };
  }
  if (!hasWord(s, 'M_02'))
    return {
      title: 'La fame che deve ancora arrivare',
      description: 'La fame vissuta durante notte o inverno permette di pensare a Domani.',
      progress: (s.tension.M_02 ?? 0) / 100,
      current: Math.floor(s.tension.M_02 ?? 0),
      total: 100,
    };
  return {
    title: 'Il sapere attraversa le generazioni',
    description:
      'Tramanda il lessico al Falò. Per il Neolitico occorrono sedici parole stabili, Sempre e trentacinque persone.',
    progress: stable / 16,
    current: stable,
    total: 16,
  };
}
export function serializeGame(s: GameState) {
  return JSON.stringify(s);
}
export function parseGame(raw: string): GameState | null {
  try {
    const s: unknown = JSON.parse(raw);
    // Older idle countdowns could expire between browser ticks and be saved
    // slightly below zero. Recover only that known case; work progress and
    // the rest of the imported world still pass the full validator.
    if (s && typeof s === 'object' && 'units' in s && Array.isArray(s.units))
      for (const u of s.units)
        if (
          u &&
          typeof u === 'object' &&
          u.action === 'idle' &&
          u.command === undefined &&
          typeof u.progress === 'number' &&
          u.progress >= -0.25 &&
          u.progress < 0
        )
          u.progress = 0;
    return validSave(s) ? { ...s, paused: true } : null;
  } catch {
    return null;
  }
}
export function availableResources(s: GameState) {
  return RESOURCE_ORDER.filter((r) => s.resources[r] > 0);
}
export function createReadyBuilding(s: GameState, kind: BuildingKind) {
  return createBuilding(s, kind);
}
export const canWork = (u: Unit) => u.age >= ADULT_AGE && u.hp > 0;
export const getFood = (s: GameState) => totalFood(s.resources);
export type { Spark };
