import {
  ADULT_AGE,
  BASE_HOUSING,
  BUILDING_SPECS,
  ELDER_AGE,
  FAUNA_SPECS,
  INNATE_WORDS,
  RESOURCE_ORDER,
  RESOURCE_SPECS,
  SEASON_TEMPERATURES,
  WORDS,
  WORD_ORDER,
} from './content';
import {
  attentionPoints,
  birthProbability,
  bodyTemperatureDelta,
  cognitiveTension,
  custodianLoss,
  effectiveDamage,
  faunaGrowth,
  resourceSpoilage,
  retentionDelta,
  senileDeathProbability,
} from './math';
import {
  activeUnits,
  addResource,
  availableWords,
  buildingEfficiency,
  canPay,
  clamp,
  distance,
  freeCapacity,
  hasBuilding,
  hasWord,
  isPlayerBuilding,
  log,
  nextId,
  pay,
  random,
  totalFood,
} from './runtime';
import {
  forbiddenByDogma,
  getDogmaEffects,
  handleDogmaticDeath,
  onDogmaticUse,
  protectedByDogma,
  resourcePreservationFloor,
  sanctuaryProtected,
  updateDogmas,
  updateDogmasSeason,
} from './dogmas';
import { imperialLawEffects, recordLawWork } from './imperialLawPolicy';
import { enforceActionLaws } from './imperial';
import { canFitCraftOutput, canPayLocally, payLocally } from './craftMaterials';
import { applyCivilAssault, CIVIL_LAW_ASSUMPTIONS, updateCivilConflicts } from './civilLaw';
import { newbornName, pairFertileUnits, recordTribeEvent } from './demography';
import { combatEquipmentFor, gatheringEquipmentFor } from './unitEquipment';
import { eligibleParents, villageHousing } from './growthReadiness';
import { lethalCombatSource, rememberCombatWound } from './damageAttribution';
import { sameGroundPile } from './groundPiles';
import type {
  Building,
  BuildingKind,
  GameState,
  Inventory,
  MapEntity,
  Resource,
  Tier,
  Unit,
} from './types';

/** Parameters the GDD does not numerically specify; kept explicit for review. */
export const CORE_DEFAULTS = {
  workSeconds: 2,
  constructionSeconds: 5,
  deathTrauma: 18,
  attackTrauma: 5,
  famineTrauma: 8,
  traumaCooldownSeconds: 90,
  initialHousing: BASE_HOUSING,
  faunaRate: 0.2,
  adultAgeSeasons: ADULT_AGE,
  elderAgeSeasons: ELDER_AGE,
  sageDiscoveryAgeSeasons: 16,
  heavyWorkHungerPerSecond: 0.8,
  inheritance: 'parent-mean-plus-or-minus-one',
};
export const seasonOf = (s: GameState) => ({
  index: Math.floor(s.time / 90) % 4,
  isNight: s.time % 90 >= 60,
});
export function getSeason(s: GameState) {
  const p = s.time % 90,
    index = Math.floor(s.time / 90) % 4;
  return {
    name: ['Primavera', 'Estate', 'Autunno', 'Inverno'][index],
    index,
    year: Math.floor(s.time / 360) + 1,
    progress: p / 90,
    isNight: p >= 60,
    remaining: Math.ceil(p < 60 ? 60 - p : 90 - p),
  };
}
export function population(s: GameState) {
  return s.urbanized
    ? s.cities
        .filter((c) => c.factionId === 'player')
        .reduce(
          (n, c) => n + c.cohorts.workers + c.cohorts.warriors + c.cohorts.sages + c.cohorts.slaves,
          0,
        )
    : activeUnits(s).length;
}
export function initializeUnit(u: Unit) {
  u.eventMemory ??= [];
  u.tension ??= {};
  u.cooldowns ??= {};
  u.lastEventAt ??= {};
  u.caste ??= u.strength >= 7 ? 'warrior' : u.intelligence >= 7 ? 'sage' : 'citizen';
  u.factionId ??= 'player';
  u.wealth ??= 0;
  u.huntCount ??= 0;
  u.workCycles ??= 0;
}
export function recordEvent(
  s: GameState,
  u: Unit,
  tag: string,
  weight: number,
  wordIds: string[],
  interval = 0,
) {
  initializeUnit(u);
  if (interval && s.time - (u.lastEventAt![tag] ?? -Infinity) < interval) return;
  u.lastEventAt![tag] = s.time;
  u.eventMemory!.push({ tag, time: s.time, weight, wordIds });
  u.eventMemory = u.eventMemory!.filter((e) => s.time - e.time <= 60);
}
export function recordCraft(s: GameState, u: Unit, wordId: string) {
  initializeUnit(u);
  u.tension![wordId] = (u.tension![wordId] ?? 0) + 20;
  recordEvent(s, u, 'ENV_CRAFT', 0, [wordId]);
  s.lastCraftWord = wordId;
  s.lastCraftUnit = u.id;
}
export function evaluateDiscoveries(s: GameState, u: Unit) {
  if (u.hp <= 0 || u.caste === 'slave') return;
  initializeUnit(u);
  u.eventMemory = u.eventMemory!.filter((e) => s.time - e.time <= 60);
  const effects = getDogmaEffects(s, { unit: u }),
    tc = cognitiveTension(u.eventMemory, u.intelligence, s.time) * effects.cognitive;
  for (const wordId of WORD_ORDER) {
    const word = WORDS[wordId];
    if (
      word.tier === 0 ||
      hasWord(s, wordId) ||
      s.sparks.some((p) => p.wordId === wordId) ||
      (u.cooldowns![wordId] ?? 0) > s.time
    )
      continue;
    const recipes = [word.recipe, ...(word.alternatives ?? [])].filter((recipe) =>
      recipe.every((t) => hasWord(s, t)),
    );
    if (!recipes.length || !u.eventMemory.some((e) => e.wordIds.includes(wordId))) continue;
    const craft = u.tension![wordId] ?? 0,
      tension = tc + craft;
    s.tension[wordId] = Math.max(0, tension);
    if (tension < 100) continue;
    const event = u.eventMemory.filter((e) => e.wordIds.includes(wordId)).at(-1)!;
    const recipe =
      wordId === 'O_05' && event.tag === 'ENV_LIGHTNING_FIRE' && hasWord(s, 'O_03')
        ? ['O_03']
        : recipes[0];
    const craftedFire = wordId === 'O_05' && event.tag === 'ENV_CRAFT';
    s.sparks.push({
      id: nextId(s, 'spark'),
      wordId,
      unitId: u.id,
      eventLabel: craftedFire
        ? 'Sfregando e lavorando il legno, una brace nasce tra le mani.'
        : word.event,
      expiresAt: s.time + 45,
      recipe: [...recipe],
      hint: craftedFire ? 'La lavorazione della pietra incontra il legno.' : word.hint,
    });
    log(s, `${u.name} cerca un nome per un’esperienza nuova.`, 'discovery');
  }
}
export function advanceTier(s: GameState) {
  const stable = availableWords(s).filter((w) => s.words[w].retention >= 50),
    pop = population(s);
  let next = s.tier;
  if (
    next === 0 &&
    stable.filter((w) => WORDS[w].tier === 1).length >= 2 &&
    (hasWord(s, 'S_02') || hasWord(s, 'O_01'))
  )
    next = 1;
  if (next === 1 && stable.length >= 8 && (hasWord(s, 'M_02') || hasWord(s, 'O_05'))) next = 2;
  if (next === 2 && stable.length >= 16 && hasWord(s, 'C_02') && pop >= 35) next = 3;
  if (next === 3 && stable.length >= 25 && hasWord(s, 'O_07') && hasWord(s, 'C_03') && pop >= 150)
    next = 4;
  if (next === 4 && stable.length >= 35 && hasBuilding(s, 'archive') && hasBuilding(s, 'palace'))
    next = 5;
  if (next !== s.tier) {
    s.tier = next as Tier;
    s.lockedSlot = false;
    s.tierDeficitSeasons = 0;
    log(s, `Un nuovo orizzonte del linguaggio: era ${next + 1}.`, 'discovery');
  }
  const threshold = [0, 6, 8, 16, 25, 35][s.tier];
  if (stable.length >= threshold) {
    s.tierDeficitSeasons = 0;
    s.lockedSlot = false;
  }
}
export function createBuilding(
  s: GameState,
  kind: BuildingKind,
  x = s.home.x,
  y = s.home.y,
  cityId?: string,
) {
  const spec = BUILDING_SPECS[kind];
  const b: Building = {
    id: nextId(s, 'building'),
    kind,
    x: clamp(x, 0, 500),
    y: clamp(y, 0, 500),
    hp: spec.maxHp,
    active: true,
    workerIds: [],
    cityId,
    completed: true,
    livestock: kind === 'pen' ? 0 : undefined,
  };
  s.buildings.push(b);
  if (cityId) s.cities.find((c) => c.id === cityId)?.buildingIds.push(b.id);
  log(s, `${spec.label}: la costruzione è terminata.`, 'good');
  return b;
}
function localFuel(s: GameState, x: number, y: number) {
  return s.entities.filter(
    (e) =>
      e.kind === 'ground' && e.resource === 'wood' && e.amount > 0 && distance(e, { x, y }) <= 15,
  );
}
function payLocalFuel(s: GameState, required: number, x: number, y: number) {
  if (s.resources.wood + localFuel(s, x, y).reduce((n, e) => n + e.amount, 0) < required)
    return false;
  const stored = Math.min(required, s.resources.wood);
  s.resources.wood -= stored;
  let remaining = required - stored;
  for (const e of localFuel(s, x, y)) {
    const take = Math.min(e.amount, remaining);
    e.amount -= take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  return true;
}
export function canIgnite(s: GameState, x = s.home.x, y = s.home.y) {
  const fire = s.buildings.find((b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.hp > 0);
  if (fire?.active) return true;
  const location = fire ?? { x, y };
  return (
    hasWord(s, 'O_05') &&
    s.resources.wood + localFuel(s, location.x, location.y).reduce((n, e) => n + e.amount, 0) >=
      (fire ? 1 : 5)
  );
}
export function tryIgnite(s: GameState, x = s.home.x, y = s.home.y) {
  const fire = s.buildings.find((b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.hp > 0);
  if (fire?.active) return true;
  if (!canIgnite(s, x, y)) return false;
  const required = fire ? 1 : 5;
  payLocalFuel(s, required, fire?.x ?? x, fire?.y ?? y);
  s.burntWood += required;
  if (fire) fire.active = true;
  else createBuilding(s, 'campfire', x, y);
  return true;
}
function recordSurvivalTrauma(s: GameState, tag: string, penalty: number) {
  const key = `TRAUMA_COOLDOWN:${tag}`;
  if (s.time - (s.eventTimes[key] ?? -Infinity) < CORE_DEFAULTS.traumaCooldownSeconds) return false;
  s.eventTimes[key] = s.time;
  s.cohesion = clamp(s.cohesion - penalty);
  s.recentTrauma = { tag, time: s.time };
  log(
    s,
    tag === 'ENV_STARVATION'
      ? 'La fame diffusa incrina la fiducia della comunità.'
      : 'Un attacco ferisce la sicurezza della comunità.',
    'warning',
  );
  return true;
}
export function recordAttackTrauma(s: GameState) {
  return recordSurvivalTrauma(s, 'ENV_ALLY_DAMAGED', CORE_DEFAULTS.attackTrauma);
}
function witnessAnimalWound(s: GameState, victim: Unit) {
  if (victim.hp > 30) return;
  for (const observer of activeUnits(s))
    if (observer.id !== victim.id && distance(observer, victim) <= 20)
      recordEvent(s, observer, 'ENV_ALLY_DAMAGED', 60, ['M_01'], 1);
}
export function killUnit(s: GameState, u: Unit, cause = 'trauma') {
  if (u.hp <= 0 && u.action === 'dead') return;
  const own = u.factionId === undefined || u.factionId === 'player',
    wordIds = Object.entries(s.words)
      .filter(
        ([word, memory]) =>
          WORDS[word].tier > 0 && memory.retention > 0 && memory.custodians.includes(u.id),
      )
      .map(([word]) => word),
    lostWordIds: string[] = [];
  const dogmatic = handleDogmaticDeath(s, u, cause);
  u.hp = 0;
  u.action = 'dead';
  u.lastDamageCause = cause;
  u.deathAt = s.time;
  u.pendingCombatDamage = false;
  s.stats.deaths++;
  if (s.urbanized && u.cityId) {
    const city = s.cities.find((c) => c.id === u.cityId),
      cohort =
        u.caste === 'slave'
          ? 'slaves'
          : u.caste === 'warrior'
            ? 'warriors'
            : u.caste === 'sage'
              ? 'sages'
              : 'workers';
    if (city) city.cohorts[cohort] = Math.max(0, city.cohorts[cohort] - 1);
  }
  s.cohesion = clamp(
    s.cohesion + (dogmatic.handled ? dogmatic.cohesion : -CORE_DEFAULTS.deathTrauma),
  );
  s.attention = clamp(s.attention + dogmatic.attention, 0, getDogmaEffects(s).attentionCap);
  if (dogmatic.collapse) s.cohesion = 0;
  if (u.isKing && s.government === 'monarchy' && !dogmatic.collapse) {
    s.cohesion = clamp(s.cohesion - 50);
    s.kingId = null;
  }
  const cremation = getDogmaEffects(s).cremation;
  if (cremation && s.resources.wood >= 5) {
    s.resources.wood -= 5;
    s.burntWood += 5;
    s.attention = clamp(s.attention + 5, 0, getDogmaEffects(s).attentionCap);
  } else
    s.entities.push({
      id: nextId(s, 'corpse'),
      kind: 'corpse',
      x: u.x,
      y: u.y,
      amount: 1,
      hp: 0,
      maxHp: 1,
      resource: 'meat',
    });
  for (const [word, m] of Object.entries(s.words)) {
    if (WORDS[word].tier === 0 || !m.custodians.includes(u.id)) continue;
    m.retention = custodianLoss(m.retention, m.custodians.length);
    m.custodians = m.custodians.filter((id) => id !== u.id);
    if (m.retention <= 0 && wordIds.includes(word)) {
      lostWordIds.push(word);
      if (own)
        recordTribeEvent(s, {
          kind: 'word-lost',
          unitId: u.id,
          wordId: word,
          cause: 'custodian-death',
        });
      log(
        s,
        `L’ultimo custode di «${WORDS[word].label}» è morto. La parola va riscoperta.`,
        'danger',
      );
    }
  }
  if (own)
    recordTribeEvent(s, {
      kind: 'death',
      unitId: u.id,
      cause,
      wordIds,
      lostWordIds,
      combatSource: lethalCombatSource(s, u, cause),
    });
  s.sparks = s.sparks.filter((p) => p.unitId !== u.id);
  s.recentTrauma = { tag: 'ENV_CORPSE', time: s.time };
  log(s, `${u.name} è morto. La sua memoria appartiene ora alla tribù.`, 'danger');
}
export function resetUnit(u: Unit) {
  u.action = 'idle';
  u.targetId = undefined;
  u.tx = undefined;
  u.ty = undefined;
  u.command = undefined;
  u.progress = 0;
  u.jobBuildingId = undefined;
  u.suspendedJob = undefined;
  u.paidConstruction = undefined;
  u.buildingKind = undefined;
  u.craftNeedsPayment = undefined;
}
function resetKeepingJob(u: Unit) {
  const job = u.suspendedJob;
  resetUnit(u);
  u.suspendedJob = job;
}
function resetInstinct(u: Unit) {
  if (!u.command && u.suspendedJob) resetKeepingJob(u);
  else resetUnit(u);
}
function move(s: GameState, u: Unit, x: number, y: number, dt: number, speed = 4) {
  const effects = getDogmaEffects(s, { unit: u, tokens: u.command }),
    slow = u.temp <= 20 ? 0.5 : 1,
    d = distance(u, { x, y }),
    step = speed * slow * effects.movement * dt;
  if (d <= step) {
    u.x = x;
    u.y = y;
    return true;
  }
  u.x += ((x - u.x) / d) * step;
  u.y += ((y - u.y) / d) * step;
  return false;
}
function closest<T extends { x: number; y: number }>(items: T[], p: { x: number; y: number }) {
  return items.reduce<T | undefined>(
    (best, e) => (!best || distance(p, e) < distance(p, best) ? e : best),
    undefined,
  );
}
export function entityResource(e: MapEntity): Resource {
  return (
    e.resource ??
    (e.kind === 'tree'
      ? 'wood'
      : e.kind === 'stone'
        ? 'stone'
        : e.kind === 'ore'
          ? 'ore'
          : e.kind === 'berries'
            ? 'food'
            : 'meat')
  );
}
function edibleEntities(s: GameState, u: Unit) {
  const vegetarian = getDogmaEffects(s, { unit: u }).vegetarian;
  return s.entities.filter(
    (e) =>
      e.amount > 0 &&
      ((e.kind === 'berries' && seasonOf(s).index !== 3) ||
        (e.resource === 'food' && e.kind === 'ground') ||
        (!vegetarian &&
          ((['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) && e.hp <= 0) ||
            (e.kind === 'ground' && ['meat', 'cooked'].includes(e.resource ?? ''))))),
  );
}
function inventoryAt(s: GameState, u: Unit): Inventory {
  if (u.factionId !== undefined && u.factionId !== 'player') return s.resources;
  return u.cityId && s.urbanized
    ? (s.cities.find((c) => c.id === u.cityId)?.resources ?? s.resources)
    : s.resources;
}
function nearInventory(s: GameState, u: Unit) {
  if (u.factionId !== undefined && u.factionId !== 'player') return distance(u, s.home) <= 10;
  return !!(u.cityId && s.urbanized) || distance(u, s.home) <= 10;
}
function physicalStoreAccess(s: GameState, u: Unit, inventory: Inventory) {
  if (['frontline', 'frontline-returning'].includes(u.action)) return false;
  const place =
    inventory === s.resources ? s.home : s.cities.find((c) => c.resources === inventory);
  return !!place && distance(u, place) <= 10;
}
/** Explicit rationing persists independently of the next individual action.
 * Only hungry people physically sharing this store reserve its food.
 */
export function foodAccessRank(s: GameState, u: Unit): number {
  if (getDogmaEffects(s).elderFoodPrivilege && u.age >= ELDER_AGE) return 2;
  const policy = s.foodPriority;
  if (!policy) return 0;
  const own = u.factionId === undefined || u.factionId === 'player';
  const matches =
    policy.subjectId === 'S_01'
      ? own
      : policy.subjectId === 'S_02'
        ? u.id === policy.unitId && own
        : policy.subjectId === 'S_03'
          ? own && u.age >= ADULT_AGE && u.strength >= 7
          : policy.subjectId === 'S_04'
            ? own && u.intelligence >= 7
            : policy.subjectId === 'S_05'
              ? !own
              : policy.subjectId === 'S_06'
                ? own && u.caste === 'slave'
                : policy.subjectId === 'S_07'
                  ? own && u.id === s.kingId
                  : false;
  return matches ? 1 : 0;
}
function rationCandidates(s: GameState) {
  const own = activeUnits(s);
  if (s.foodPriority?.subjectId !== 'S_05') return own;
  const radius = hasBuilding(s, 'palace') ? 100 : 35;
  return [
    ...own,
    ...s.units.filter(
      (u) =>
        u.hp > 0 &&
        u.factionId !== undefined &&
        u.factionId !== 'player' &&
        distance(u, s.home) <= radius,
    ),
  ];
}
export function consume(s: GameState, u: Unit, e?: MapEntity) {
  const effects = getDogmaEffects(s, { unit: u });
  const inv = inventoryAt(s, u);
  let resource: Resource | undefined, source: Inventory | undefined;
  if (e) {
    if ((e.kind === 'berries' && seasonOf(s).index === 3) || e.amount <= 0) return false;
    resource = entityResource(e);
    if (effects.vegetarian && resource !== 'food') return false;
  } else if (nearInventory(s, u)) {
    resource = (['cooked', 'meat', 'food'] as Resource[]).find(
      (r) => inv[r] > 0 && (!effects.vegetarian || r === 'food'),
    );
    source = inv;
  }
  if (!resource) return false;
  if (source && foodAccessRank(s, u) > 0 && !physicalStoreAccess(s, u, source)) return false;
  if (
    source &&
    (s.foodPriority || effects.elderFoodPrivilege) &&
    rationCandidates(s).some(
      (other) =>
        other.id !== u.id &&
        foodAccessRank(s, other) > foodAccessRank(s, u) &&
        (other.hunger >= 60 || (other.action === 'eating' && other.hunger > 0)) &&
        nearInventory(s, other) &&
        physicalStoreAccess(s, other, source!) &&
        inventoryAt(s, other) === source &&
        (!getDogmaEffects(s, { unit: other }).vegetarian || resource === 'food') &&
        !forbiddenByDogma(s, ['S_01', 'V_02', 'O_04'], undefined, other),
    )
  )
    return false;
  if (
    e &&
    sanctuaryProtected(
      s,
      resource === 'wood'
        ? 'O_03'
        : resource === 'stone'
          ? 'O_02'
          : resource === 'ore'
            ? 'O_07'
            : 'O_04',
      e,
    )
  )
    return false;
  if (
    forbiddenByDogma(
      s,
      [
        'S_01',
        'V_02',
        resource === 'food' || resource === 'meat' || resource === 'cooked' ? 'O_04' : 'O_06',
      ],
      e ? { type: 'entity', id: e.id, x: e.x, y: e.y } : undefined,
      u,
    )
  )
    return false;
  const ration = e?.kind === 'corpse' ? 1 : imperialLawEffects(s).foodConsumptionMultiplier;
  let amount = Math.min(ration, e ? e.amount : source![resource]);
  if (e?.kind === 'corpse') {
    amount = 1;
    u.hunger = clamp(u.hunger - 50);
    if (!effects.cannibalism) s.cohesion = clamp(s.cohesion - 15);
  } else u.hunger = clamp(u.hunger - (RESOURCE_SPECS[resource].nutrition * amount) / ration);
  if (e) e.amount -= amount;
  else source![resource] -= amount;
  if (resource === 'meat' && random(s) < 0.1) {
    u.hp -= 15 * (u.caste === 'slave' ? imperialLawEffects(s).slaveMortalityMultiplier : 1);
    u.parasiteUntil = s.time + 45;
    log(s, `${u.name} si ammala dopo un pasto di carne cruda.`, 'warning');
  }
  if (e && ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) && s.time - s.lastHunt <= 60)
    recordEvent(s, u, 'ENV_HUNT_MEAL', 100, ['O_04']);
  if (u.hunger <= 0 && e && hasWord(s, 'O_01')) recordEvent(s, u, 'ENV_SURPLUS', 60, ['V_04']);
  if (hasWord(s, 'O_05')) recordCraft(s, u, 'V_07');
  return true;
}
export function matchingEntities(s: GameState, tokens: string[], u?: Unit) {
  // Pericolo changes the hunting target class, rather than merely its label.
  // The source specifically names alpha predators and mammoths, with no fallback.
  if (tokens.includes('V_03') && tokens.includes('O_04') && tokens.includes('M_01'))
    return s.entities.filter(
      (e) => ['alpha', 'mammoth'].includes(e.kind) && e.amount > 0 && (!u || distance(e, u) <= 100),
    );
  let kinds: MapEntity['kind'][] = [];
  if (tokens.includes('O_02')) kinds.push('stone');
  if (tokens.includes('O_03')) kinds.push('tree');
  if (tokens.includes('O_07')) kinds.push('ore');
  if (tokens.includes('O_04'))
    kinds.push(
      ...(tokens.includes('V_03')
        ? (['deer', 'wolf', 'alpha', 'mammoth'] as const)
        : (['berries', 'deer', 'wolf', 'alpha', 'mammoth'] as const)),
    );
  if (tokens.includes('O_06')) kinds.push('corpse');
  const resources: Resource[] = tokens.includes('O_02')
    ? ['stone']
    : tokens.includes('O_03') || tokens.includes('O_05')
      ? ['wood']
      : tokens.includes('O_07')
        ? ['ore']
        : tokens.includes('O_04')
          ? ['food', 'meat', 'cooked']
          : [];
  return s.entities.filter(
    (e) =>
      (kinds.includes(e.kind) ||
        (e.kind === 'ground' && !!e.resource && resources.includes(e.resource))) &&
      e.amount > 0 &&
      (tokens.includes('V_03') ||
        !['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) ||
        e.hp <= 0) &&
      (e.kind !== 'berries' || seasonOf(s).index !== 3) &&
      (!u || !tokens.includes('O_04') || !tokens.includes('V_03') || distance(e, u) <= 100),
  );
}
function weaponFor(s: GameState, u: Unit) {
  return combatEquipmentFor(s, u);
}
function onHuntKill(s: GameState, u: Unit, e: MapEntity) {
  e.hp = 0;
  s.stats.hunts++;
  s.lastHunt = s.time;
  recordLawWork(s, u.id, [...(u.command ?? ['S_01', 'V_03']), 'O_04']);
  u.huntCount = (u.huntCount ?? 0) + 1;
  trainStrength(u);
  const drop = FAUNA_SPECS[e.kind as keyof typeof FAUNA_SPECS];
  if (drop) e.amount = drop.meat;
  const equipment = weaponFor(s, u);
  if (equipment.kind === 'spear')
    equipment.inventory.spear = Math.max(0, equipment.inventory.spear - 0.05);
  if (e.kind === 'alpha') s.cohesion = clamp(s.cohesion + 10);
  if ((u.huntCount ?? 0) >= 10) recordEvent(s, u, 'ENV_HUNT_SUCCESS', 100, ['S_03']);
  onDogmaticUse(s, u.command ?? ['S_01', 'V_03', 'O_04'], u);
  log(s, 'La preda è abbattuta. La carne deve essere raccolta o consumata.', 'good');
}

function trainStrength(u: Unit) {
  u.workCycles = (u.workCycles ?? 0) + 1;
  if (u.workCycles % 5 === 0) u.strength = clamp(u.strength + 0.1, 1, 10);
}

function workCycle(s: GameState, u: Unit, dt: number, seconds = CORE_DEFAULTS.workSeconds) {
  const f = getDogmaEffects(s, { unit: u, tokens: u.command });
  const lawFear = (u.lastEventAt?.LAW_PRODUCTIVITY_UNTIL ?? 0) > s.time ? 1.2 : 1,
    property =
      (u.lastEventAt?.LAW_PRIVATE_BONUS ?? 0) > 0 || (hasWord(s, 'M_04') && (u.wealth ?? 0) > 0)
        ? 1.3
        : 1;
  u.progress +=
    dt *
    (u.action !== 'eating' && (u.parasiteUntil ?? 0) > s.time ? 0.5 : 1) *
    f.production *
    (u.action === 'building' ? imperialLawEffects(s).constructionMultiplier : 1) *
    (u.isKing ? 1.5 : 1) *
    (u.caste === 'slave' ? 1.2 : 1) *
    (s.government === 'republic' && u.caste !== 'slave' ? 1.25 : 1) *
    lawFear *
    property;
  if (u.progress < seconds) return false;
  u.progress -= seconds;
  const verb = u.command?.find((id) => WORDS[id]?.kind === 'V');
  if (verb) {
    initializeUnit(u);
    u.lastEventAt![`WORK:${verb}`] = s.time;
  }
  return true;
}
function drop(s: GameState, u: Unit, r: Resource, amount: number) {
  if (amount <= 0) return;
  s.entities.push({
    id: nextId(s, 'ground'),
    kind: 'ground',
    x: u.x,
    y: u.y,
    amount,
    maxAmount: amount,
    hp: 0,
    maxHp: 1,
    resource: r,
    sectorId: `sector-${Math.floor(u.x / 100)}-${Math.floor(u.y / 100)}`,
  });
}
/** An accepted replacement order leaves the old load at the carrier's real position (A-35). */
export function dropCarriedLoad(s: GameState, u: Unit) {
  const carried = u.carry;
  if (!carried) return false;
  u.carry = undefined;
  if (carried.amount <= 0) return false;
  drop(s, u, carried.resource, carried.amount);
  return true;
}
function finishConstruction(s: GameState, u: Unit) {
  if (!u.buildingKind) return;
  trainStrength(u);
  recordLawWork(s, u.id, u.command ?? []);
  const command = [...(u.command ?? [])],
    completed: Building[] = [];
  const count = u.command?.[0] === 'S_09' && u.buildingKind === 'house' ? 4 : 1;
  for (let i = 0; i < count; i++) {
    const b = createBuilding(s, u.buildingKind, u.x + i * 2, u.y, u.cityId);
    completed.push(b);
    if (b.kind === 'stele')
      b.fixedWordId =
        s.lastCraftWord && hasWord(s, s.lastCraftWord)
          ? s.lastCraftWord
          : availableWords(s)
              .filter((w) => WORDS[w].tier > 0)
              .sort((a, b) => s.words[a].retention - s.words[b].retention)[0];
    if (b.kind === 'pen') {
      const prey = closest(
        s.entities.filter((e) => e.kind === 'deer' && e.hp > 0 && !e.domesticated),
        b,
      );
      if (prey) {
        prey.domesticated = true;
        b.livestock = 1;
      }
    }
  }
  resetUnit(u);
  for (const b of completed) {
    const spec = BUILDING_SPECS[b.kind];
    if (spec.workers === 0 || b.cityId) continue;
    const candidates = [u, ...activeUnits(s).filter((v) => v.id !== u.id)];
    for (const v of candidates) {
      if ((b.workerIds ?? []).length >= spec.workers) break;
      if (
        v.age < ADULT_AGE ||
        !['idle', 'sleeping'].includes(v.action) ||
        distance(v, b) > 15 ||
        (command[0] === 'S_02' && v.id !== u.id) ||
        (command[0] === 'S_03' && v.strength < 7) ||
        (command[0] === 'S_04' && v.intelligence < 7) ||
        (command[0] === 'S_06' && v.caste !== 'slave') ||
        (command[0] === 'S_07' && !v.isKing) ||
        (spec.workerKind === 'sage' && v.intelligence < 7) ||
        (spec.workerKind === 'warrior' && v.strength < 7)
      )
        continue;
      v.action = 'working';
      v.command = [...command];
      v.jobBuildingId = b.id;
      v.targetId = b.id;
      v.tx = b.x;
      v.ty = b.y;
      b.workerIds ??= [];
      b.workerIds.push(v.id);
    }
  }
}
function assignWork(s: GameState, u: Unit, kind: BuildingKind) {
  const spec = BUILDING_SPECS[kind];
  if (
    u.age < ADULT_AGE ||
    (spec.workerKind === 'sage' && u.intelligence < 7) ||
    (spec.workerKind === 'warrior' && u.strength < 7)
  )
    return false;
  for (const b of s.buildings)
    b.workerIds = (b.workerIds ?? []).filter((id) =>
      s.units.some((v) => v.id === id && v.hp > 0 && v.jobBuildingId === b.id),
    );
  const b = closest(
    s.buildings.filter(
      (b) =>
        isPlayerBuilding(s, b) &&
        b.kind === kind &&
        b.hp > 0 &&
        b.active &&
        b.completed !== false &&
        ((b.workerIds ?? []).length < BUILDING_SPECS[kind].workers ||
          (b.workerIds ?? []).includes(u.id)),
    ),
    u,
  );
  if (!b) return false;
  u.jobBuildingId = b.id;
  u.targetId = b.id;
  u.tx = b.x;
  u.ty = b.y;
  u.action = kind === 'campfire' ? 'guarding' : 'working';
  b.workerIds ??= [];
  if (!b.workerIds.includes(u.id)) b.workerIds.push(u.id);
  return true;
}
function pauseBuildingJob(s: GameState, u: Unit) {
  const b = s.buildings.find((b) => b.id === u.jobBuildingId);
  if (!b) return;
  const command = [...(u.command ?? [])];
  b.workerIds = (b.workerIds ?? []).filter((id) => id !== u.id);
  resetUnit(u);
  u.suspendedJob = { buildingId: b.id, command };
}
function continuousFireGuard(b: Building | undefined, command: string[] = []) {
  return (
    b?.kind === 'campfire' &&
    !['C_01', 'C_02'].includes(command[0]) &&
    command.includes('V_05') &&
    command.includes('O_05')
  );
}
function resumeBuildingJob(s: GameState, u: Unit) {
  const job = u.suspendedJob;
  if (!job) return false;
  const b = s.buildings.find((b) => b.id === job.buildingId),
    spec = b && BUILDING_SPECS[b.kind];
  if (
    !b ||
    !spec ||
    !isPlayerBuilding(s, b) ||
    b.hp <= 0 ||
    b.completed === false ||
    u.age < ADULT_AGE ||
    (spec.workerKind === 'sage' && u.intelligence < 7) ||
    (spec.workerKind === 'warrior' && u.strength < 7) ||
    ((job.command[0] === 'C_02' || (job.command[0] === 'C_01' && s.tier >= 3)) &&
      !s.traditions.some((t) => t.tokens.join('|') === job.command.join('|')))
  ) {
    u.suspendedJob = undefined;
    return false;
  }
  const night = seasonOf(s).isNight,
    resting = getDogmaEffects(s, { unit: u }).nightWatch ? !night : night,
    nightShift = job.command[0] === 'C_01';
  if (
    (!b.active && b.kind !== 'campfire') ||
    (!continuousFireGuard(b, job.command) && (nightShift ? !night : resting)) ||
    u.hunger >= 75 ||
    u.temp <= 30
  )
    return false;
  const target = { type: 'building' as const, id: b.id, x: b.x, y: b.y };
  if (forbiddenByDogma(s, job.command, target, u)) {
    u.suspendedJob = undefined;
    return false;
  }
  b.workerIds = (b.workerIds ?? []).filter((id) =>
    s.units.some((v) => v.id === id && v.hp > 0 && v.jobBuildingId === b.id),
  );
  if (b.workerIds.length >= spec.workers) return false;
  if (!enforceActionLaws(s, job.command, target, [u.id])) {
    const tradition = s.traditions.find((t) => t.tokens.join('|') === job.command.join('|'));
    if (tradition) {
      initializeUnit(u);
      u.cooldowns![`law-order:${tradition.id}`] = s.time + 90;
    }
    u.suspendedJob = undefined;
    return false;
  }
  u.command = [...job.command];
  u.jobBuildingId = b.id;
  u.targetId = b.id;
  u.tx = b.x;
  u.ty = b.y;
  u.progress = 0;
  u.action = b.kind === 'campfire' ? 'guarding' : 'working';
  u.suspendedJob = undefined;
  b.workerIds.push(u.id);
  return true;
}
/** A full ordinary 60-second shift earns one seasonal yield; extra shifts cap at one. */
function recordBuildingWork(s: GameState, dt: number) {
  const start = Math.max(0, s.time - dt),
    firstSeason = Math.floor(start / 90),
    lastSeason = Math.floor(s.time / 90);
  for (const b of s.buildings) {
    const spec = BUILDING_SPECS[b.kind];
    if (b.cityId || spec.workers === 0 || !b.active || b.hp <= 0 || b.completed === false) continue;
    const workers = (b.workerIds ?? [])
      .filter((id) =>
        s.units.some(
          (u) =>
            u.id === id &&
            u.hp > 0 &&
            u.jobBuildingId === b.id &&
            distance(u, b) <= 3 &&
            u.age >= ADULT_AGE &&
            (spec.workerKind !== 'sage' || u.intelligence >= 7) &&
            (spec.workerKind !== 'warrior' || u.strength >= 7) &&
            ['working', 'farming', 'smelting', 'copying', 'researching', 'guarding'].includes(
              u.action,
            ) &&
            u.hunger < 75 &&
            u.temp > 30,
        ),
      )
      .slice(0, spec.workers);
    if (!workers.length) continue;
    b.seasonWork ??= {};
    for (const key of Object.keys(b.seasonWork))
      if (Number(key) < lastSeason - 1) delete b.seasonWork[key];
    for (let season = firstSeason; season <= lastSeason; season++) {
      const seconds = Math.max(
        0,
        Math.min(s.time, (season + 1) * 90) - Math.max(start, season * 90),
      );
      if (seconds <= 0) continue;
      const work = (b.seasonWork[season] ??= { efficiencySeconds: 0, workerSeconds: {} });
      work.efficiencySeconds = Math.min(
        90,
        work.efficiencySeconds + (seconds * workers.length) / spec.workers,
      );
      for (const id of workers) {
        work.workerSeconds[id] = Math.min(90, (work.workerSeconds[id] ?? 0) + seconds);
        const command = s.units.find((u) => u.id === id)?.command;
        if (command?.length) {
          work.commandSeconds ??= {};
          const signatures = (work.commandSeconds[id] ??= {}),
            signature = command.join('|');
          signatures[signature] = Math.min(90, (signatures[signature] ?? 0) + seconds);
        }
      }
    }
  }
}
function seasonalBuildingEfficiency(s: GameState, b: Building) {
  if (!b.active || b.hp <= 0 || b.completed === false) return 0;
  if (BUILDING_SPECS[b.kind].workers === 0) return 1;
  const ended = Math.floor(s.time / 90) - 1;
  return Math.min(1, (b.seasonWork?.[ended]?.efficiencySeconds ?? 0) / 60);
}
/** Civil blows share the real equipment and damage equation with ordinary combat. */
export function civilStrike(s: GameState, attacker: Unit, victim: Unit, requestedDamage?: number) {
  const weapon = weaponFor(s, attacker),
    armour = weaponFor(s, victim).armor,
    effect = getDogmaEffects(s, { unit: attacker, tokens: attacker.command });
  const damage =
    requestedDamage ??
    effectiveDamage(
      weapon.damage || CIVIL_LAW_ASSUMPTIONS.basicBlowDamage,
      attacker.strength,
      (s.cohesion < 30 ? 0.7 : 1) * effect.combat * effect.morale,
      armour,
    );
  return applyCivilAssault(s, attacker, victim, damage, killUnit, () => recordAttackTrauma(s));
}
function guidedDirectTask(s: GameState, u: Unit, tokens: string[]) {
  return (
    s.playMode === 'guided' &&
    tokens.length > 0 &&
    !['C_01', 'C_02'].includes(tokens[0]) &&
    u.hp > 0 &&
    u.hunger < 75 &&
    u.temp > 30 &&
    !seasonOf(s).isNight &&
    tokens.every((id) => hasWord(s, id))
  );
}
function guidedMaterialTransport(s: GameState, tokens: string[]) {
  return (
    s.playMode === 'guided' &&
    tokens.includes('V_04') &&
    tokens.some((id) => ['O_02', 'O_03', 'O_07'].includes(id)) &&
    !tokens.includes('O_04') &&
    !['C_01', 'C_02'].includes(tokens[0])
  );
}
function plainToolCraft(tokens: string[]) {
  return tokens.includes('V_06') && tokens.length === 3 && tokens[2] === 'O_02';
}
export function processWork(s: GameState, u: Unit, dt: number) {
  let e = s.entities.find((e) => e.id === u.targetId);
  const tokens = u.command ?? [],
    verb = tokens.find((t) => WORDS[t]?.kind === 'V');
  // A visible material pile may contain many extraction fragments. Another
  // carrier taking the selected fragment does not exhaust the physical pile.
  if (
    verb === 'V_04' &&
    e?.kind === 'ground' &&
    e.resource &&
    ['wood', 'stone', 'ore'].includes(e.resource) &&
    e.amount <= resourcePreservationFloor(s, e)
  ) {
    const original = e;
    const next = s.entities.find(
      (piece) =>
        sameGroundPile(original, piece) && piece.amount > resourcePreservationFloor(s, piece),
    );
    if (next) {
      e = next;
      u.targetId = next.id;
      u.tx = next.x;
      u.ty = next.y;
    }
  }
  if (u.action === 'gathering' && guidedMaterialTransport(s, tokens)) {
    if (
      !guidedDirectTask(s, u, tokens) ||
      !e ||
      !enforceActionLaws(s, tokens, { type: 'entity', id: e.id, x: e.x, y: e.y }, [u.id])
    ) {
      if (u.hp > 0) resetUnit(u);
      return;
    }
  }
  const foreign = s.units.find(
    (v) => v.id === u.targetId && v.hp > 0 && v.factionId && v.factionId !== 'player',
  );
  const citizen = s.units.find(
    (v) =>
      v.id === u.targetId &&
      v.id !== u.id &&
      v.hp > 0 &&
      (v.factionId === undefined || v.factionId === 'player'),
  );
  if (citizen && verb === 'V_03') {
    u.action = 'combat';
    if (distance(u, citizen) > 1.5) {
      move(s, u, citizen.x, citizen.y, dt);
      return;
    }
    if (!workCycle(s, u, dt, 1)) return;
    civilStrike(s, u, citizen);
    if (citizen.hp <= 0 && u.hp > 0) resetUnit(u);
    return;
  }
  if (foreign && verb === 'V_03') {
    u.action = 'combat';
    if (protectedByDogma(s, 'S_05', foreign)) {
      resetUnit(u);
      return;
    }
    if (distance(u, foreign) > 1.5) {
      move(s, u, foreign.x, foreign.y, dt);
      return;
    }
    if (!workCycle(s, u, dt, 1)) return;
    const weapon = weaponFor(s, u),
      fx = getDogmaEffects(s, {
        unit: u,
        tokens,
        againstForeign: true,
        inBorders: distance(u, s.home) <= 35,
      });
    const damage = effectiveDamage(
      weapon.damage,
      u.strength,
      (s.cohesion < 30 ? 0.7 : 1) * fx.combat * fx.morale,
    );
    const f = s.factions.find((f) => f.id === foreign.factionId);
    if (f) f.hostile = true;
    if (
      foreign.hp - damage <= 15 &&
      (tokens.includes('V_05') || tokens.includes('S_06')) &&
      !fx.slaveryForbidden
    ) {
      foreign.hp = Math.min(foreign.hp, 15);
      foreign.factionId = 'player';
      foreign.caste = 'slave';
      foreign.cityId = undefined;
      foreign.isKing = false;
      foreign.action = 'idle';
      recordEvent(s, u, 'ENV_CAPTURE', 100, ['S_06']);
      const unknown = foreign.knows.find((w) => !hasWord(s, w));
      if (unknown && !fx.isolated) {
        initializeUnit(u);
        u.tension![unknown] = (u.tension![unknown] ?? 0) + 50;
        recordEvent(s, u, 'ENV_CONTACT', 0, [unknown]);
      }
      log(
        s,
        `${foreign.name} viene catturato vivo. Una nuova divisione sociale può essere compresa.`,
        'warning',
      );
      resetUnit(u);
      return;
    }
    foreign.hp -= damage;
    if (foreign.hp <= 0) {
      foreign.hp = 0;
      foreign.action = 'dead';
      log(s, 'Un combattente straniero è caduto.', 'warning');
      resetUnit(u);
      return;
    }
    if (!fx.protected) {
      const wound = effectiveDamage(5, foreign.strength, 1, weapon.armor);
      u.hp -= wound;
      rememberCombatWound(s, u, wound, { kind: 'human', id: foreign.id });
      if (wound > 0) recordAttackTrauma(s);
      if (u.hp <= 0) killUnit(s, u, 'V_03');
    }
    return;
  }
  if (u.action === 'moving' || u.action === 'fleeing' || u.action === 'patrolling') {
    if (move(s, u, u.tx ?? s.home.x, u.ty ?? s.home.y, dt, u.action === 'fleeing' ? 4.8 : 4))
      resetInstinct(u);
    return;
  }
  if (u.action === 'returning') {
    if (!move(s, u, s.home.x, s.home.y, dt)) return;
    if (u.carry) {
      const carried = u.carry;
      u.carry = undefined;
      const n = addResource(s, carried.resource, carried.amount);
      if (n < carried.amount) drop(s, u, carried.resource, carried.amount - n);
      if (n > 0) {
        recordLawWork(s, u.id, tokens, n);
        recordCraft(s, u, 'V_08');
        recordCraft(s, u, 'V_05');
        if (tokens.includes('S_02')) {
          u.wealth = (u.wealth ?? 0) + n;
          recordCraft(s, u, 'M_04');
        }
        if (tokens.includes('S_07')) recordCraft(s, u, 'O_11');
        if (carried.resource === 'wood' && tokens.includes('O_05')) {
          if (s.resources.wood >= 1) {
            s.resources.wood--;
            s.burntWood++;
            const fire = closest(
              s.buildings.filter(
                (b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.hp > 0,
              ),
              u,
            );
            if (fire) fire.active = true;
            else tryIgnite(s);
          }
        }
      }
    }
    // Guided direct orders are a day task, not a permanent tradition. A return
    // always completes physically; only the next trip is conditional.
    if (
      verb === 'V_04' &&
      guidedMaterialTransport(s, tokens) &&
      guidedDirectTask(s, u, tokens) &&
      e &&
      e.amount > resourcePreservationFloor(s, e) &&
      ['wood', 'stone', 'ore'].includes(entityResource(e)) &&
      freeCapacity(s, entityResource(e)) > 0 &&
      matchingEntities(s, tokens, u).includes(e) &&
      !forbiddenByDogma(s, tokens, { type: 'entity', id: e.id, x: e.x, y: e.y }, u) &&
      enforceActionLaws(s, tokens, { type: 'entity', id: e.id, x: e.x, y: e.y }, [u.id])
    ) {
      u.action = 'gathering';
      u.progress = 0;
      u.tx = e.x;
      u.ty = e.y;
    } else if (u.hp > 0) resetUnit(u);
    return;
  }
  if (u.action === 'building') {
    if (!move(s, u, u.tx ?? s.home.x, u.ty ?? s.home.y, dt)) return;
    if (workCycle(s, u, dt, CORE_DEFAULTS.constructionSeconds)) finishConstruction(s, u);
    return;
  }
  if (u.action === 'crafting' || u.action === 'cooking') {
    if (u.craftNeedsPayment) {
      if (
        !plainToolCraft(tokens) ||
        !guidedDirectTask(s, u, tokens) ||
        !canFitCraftOutput(s, { stone: 1 }, 'tool') ||
        !canPayLocally(s, { stone: 1 }, u) ||
        forbiddenByDogma(s, tokens, undefined, u) ||
        !enforceActionLaws(s, tokens, undefined, [u.id])
      ) {
        if (u.hp > 0) resetUnit(u);
        return;
      }
      payLocally(s, { stone: 1 }, u);
      u.craftNeedsPayment = false;
    }
    if (!move(s, u, u.tx ?? s.home.x, u.ty ?? s.home.y, dt)) return;
    if (!workCycle(s, u, dt, 5)) return;
    if (verb === 'V_06') {
      const output = tokens.includes('O_03') ? 'spear' : 'tool';
      drop(s, u, output, 1 - addResource(s, output, 1));
      recordCraft(s, u, 'O_05');
      recordCraft(s, u, 'O_13');
    }
    if (verb === 'V_07') {
      const output = tokens.includes('O_02') ? 'pottery' : 'cooked';
      drop(s, u, output, 1 - addResource(s, output, 1));
      recordCraft(s, u, 'V_12');
    }
    recordLawWork(s, u.id, tokens);
    onDogmaticUse(s, tokens, u);
    // Do not prepay a speculative cycle: a spark or a new order may interrupt
    // before the next tick. Only the next actual work update pays its stone.
    if (plainToolCraft(tokens) && guidedDirectTask(s, u, tokens)) {
      u.progress = 0;
      u.craftNeedsPayment = true;
    } else resetUnit(u);
    return;
  }
  if (u.action === 'guarding') {
    let fire = closest(
      s.buildings.filter((b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.hp > 0),
      u,
    );
    if (!fire) {
      if (!tryIgnite(s, u.tx ?? s.home.x, u.ty ?? s.home.y)) {
        resetUnit(u);
        return;
      }
      fire = closest(
        s.buildings.filter((b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.hp > 0),
        u,
      );
    }
    if (!fire || !move(s, u, fire.x, fire.y, dt)) return;
    u.jobBuildingId = fire.id;
    fire.workerIds ??= [];
    if (!fire.workerIds.includes(u.id)) fire.workerIds.push(u.id);
    if (!fire.active && s.resources.wood >= 1) {
      s.resources.wood--;
      s.burntWood++;
      fire.active = true;
    }
    if (workCycle(s, u, dt, 5)) {
      if (
        s.resources.wood >= 10 &&
        s.entities.some((e) => e.kind === 'ore' && e.amount > 0 && distance(e, fire!) < 30)
      ) {
        s.resources.wood -= 10;
        s.burntWood += 10;
        recordEvent(s, u, 'ENV_HIGH_HEAT', 50, ['O_07'], 5);
      }
    }
    return;
  }
  if (
    u.action === 'working' ||
    u.action === 'farming' ||
    u.action === 'smelting' ||
    u.action === 'copying' ||
    u.action === 'researching'
  ) {
    let b = s.buildings.find((b) => b.id === u.jobBuildingId);
    if (!b) {
      const k: BuildingKind =
        verb === 'V_12'
          ? 'foundry'
          : tokens.includes('O_09')
            ? 'archive'
            : verb === 'V_09'
              ? 'farm'
              : verb === 'V_10'
                ? 'pen'
                : verb === 'V_14'
                  ? 'school'
                  : 'temple';
      if (!assignWork(s, u, k)) {
        resetUnit(u);
        return;
      }
      b = s.buildings.find((b) => b.id === u.jobBuildingId);
    }
    if (!b || !b.active || b.hp <= 0) {
      resetUnit(u);
      return;
    }
    if (!move(s, u, b.x, b.y, dt)) return;
    if (b.kind === 'foundry' && workCycle(s, u, dt, 5)) {
      const coin = tokens.includes('O_08'),
        arms = tokens.includes('V_03') || tokens.includes('S_08'),
        cost: Partial<Inventory> = coin ? { ingot: 1 } : arms ? { ingot: 1 } : { ore: 1, wood: 2 };
      const out: Resource = coin ? 'coin' : arms ? 'metalArms' : 'ingot';
      if (canPay(s.resources, cost) && freeCapacity(s, out) > 0) {
        pay(s.resources, cost);
        addResource(s, out, coin ? 100 : 1);
        recordLawWork(s, u.id, tokens, coin ? 100 : 1);
        recordCraft(s, u, coin ? 'O_12' : 'V_12');
        recordCraft(s, u, 'O_13');
      }
    }
    if (b.kind === 'archive' && workCycle(s, u, dt, 5)) {
      recordLawWork(s, u.id, tokens);
      recordCraft(s, u, 'O_14');
      recordCraft(s, u, 'V_14');
    }
    if (
      b.kind === 'foundry' &&
      s.resources.metalArms >= 20 &&
      s.traditions.some((t) => t.tokens.includes('S_03'))
    )
      recordEvent(s, u, 'ENV_MILITARY', 100, ['S_08'], 60);
    return;
  }
  if (u.action === 'hunting' || u.action === 'combat') {
    if (!e || e.amount <= 0) {
      resetUnit(u);
      return;
    }
    if (e.hp <= 0) {
      u.action = 'eating';
      u.progress = 0;
      return;
    }
    if (protectedByDogma(s, 'O_04') || sanctuaryProtected(s, 'O_04', e)) {
      resetUnit(u);
      return;
    }
    const weapon = weaponFor(s, u),
      range = weapon.kind === 'spear' ? 3 : 1.5;
    if (distance(u, e) > range) {
      move(s, u, e.x, e.y, dt);
      return;
    }
    if (!workCycle(s, u, dt, 1)) return;
    const fx = getDogmaEffects(s, {
      unit: u,
      tokens,
      againstForeign: !!e.factionId && e.factionId !== 'player',
      inBorders: distance(u, s.home) <= 35,
    });
    const morale = (s.cohesion < 30 ? 0.7 : 1) * fx.combat * fx.morale * (u.isKing ? 1.5 : 1);
    e.hp -= effectiveDamage(weapon.damage, u.strength, morale);
    if (e.hp <= 0) {
      onHuntKill(s, u, e);
      recordEvent(s, u, 'ENV_HUNT', 80, ['O_04']);
    } else if (e.kind !== 'deer' && !fx.protected) {
      const wound = effectiveDamage(
        FAUNA_SPECS[e.kind as keyof typeof FAUNA_SPECS]?.damage ?? 5,
        0,
        1,
        weapon.armor,
      );
      u.hp -= wound;
      if (['wolf', 'alpha', 'mammoth', 'deer'].includes(e.kind))
        rememberCombatWound(s, u, wound, {
          kind: e.kind as 'wolf' | 'alpha' | 'mammoth' | 'deer',
          id: e.id,
        });
      if (wound > 0) {
        recordAttackTrauma(s);
        witnessAnimalWound(s, u);
      }
      if (u.hp <= 0) killUnit(s, u, 'V_03');
    }
    return;
  }
  if (u.action === 'eating') {
    // Conservare restrains an autonomous meal; an explicit Mangiare order
    // still means eating to satiety, as specified by the sentence grammar.
    const conserve = verb !== 'V_02' && hasWord(s, 'V_05');
    if (conserve && u.hunger < 60) {
      resetInstinct(u);
      return;
    }
    // A delivery may have arrived since this forager chose a distant node.
    // Recheck real accessible stocks before leaving their physical reach.
    if (conserve && nearInventory(s, u) && consume(s, u)) {
      if (u.hunger < 60) resetInstinct(u);
      return;
    }
    if (!e || e.amount <= 0) {
      resetInstinct(u);
      return;
    }
    if (!move(s, u, e.x, e.y, dt)) return;
    if (!workCycle(s, u, dt, 1.5)) return;
    if (!consume(s, u, e) || u.hunger <= 0 || (conserve && u.hunger < 60)) resetInstinct(u);
    return;
  }
  if (u.action === 'domesticating') {
    if (!e || e.hp <= 0) {
      resetUnit(u);
      return;
    }
    if (!move(s, u, e.x, e.y, dt)) return;
    if (!workCycle(s, u, dt, 5)) return;
    e.domesticated = true;
    if (e.kind === 'wolf') {
      e.factionId = 'player';
      log(s, 'Il lupo diventa un cane da guardia.', 'good');
    } else {
      const pen = closest(
        s.buildings.filter(
          (b) => isPlayerBuilding(s, b) && b.kind === 'pen' && b.hp > 0 && (b.livestock ?? 0) < 10,
        ),
        u,
      );
      if (pen) {
        pen.livestock = (pen.livestock ?? 0) + 1;
        e.x = pen.x;
        e.y = pen.y;
      }
    }
    recordLawWork(s, u.id, tokens);
    recordCraft(s, u, 'V_10');
    resetUnit(u);
    return;
  }
  if (u.action === 'planting') {
    if (!move(s, u, u.tx ?? s.home.x, u.ty ?? s.home.y, dt)) return;
    if (!workCycle(s, u, dt, 5)) return;
    recordLawWork(s, u.id, tokens);
    s.entities.push({
      id: nextId(s, 'tree'),
      kind: 'tree',
      x: u.x,
      y: u.y,
      amount: 20,
      maxAmount: 20,
      hp: 100,
      maxHp: 100,
      originX: u.x,
      originY: u.y,
    });
    resetUnit(u);
    return;
  }
  if (u.action === 'gathering') {
    if (
      !e ||
      e.amount <= resourcePreservationFloor(s, e) ||
      (e.kind === 'berries' && seasonOf(s).index === 3)
    ) {
      resetUnit(u);
      return;
    }
    if (!move(s, u, e.x, e.y, dt)) return;
    const resource = entityResource(e),
      equipment = gatheringEquipmentFor(s, u, resource),
      gatherTool = equipment.kind === 'tool',
      speed = equipment.speed;
    if (
      sanctuaryProtected(
        s,
        resource === 'wood'
          ? 'O_03'
          : resource === 'stone'
            ? 'O_02'
            : resource === 'ore'
              ? 'O_07'
              : 'O_04',
        e,
      )
    ) {
      resetUnit(u);
      return;
    }
    if (!workCycle(s, u, dt, CORE_DEFAULTS.workSeconds / speed)) return;
    if (e.kind === 'tree') recordEvent(s, u, 'ENV_TREE_NODE', 50, ['O_03']);
    if (e.kind === 'stone') {
      recordEvent(s, u, 'ENV_ROCK_NODE', 50, ['O_02']);
      recordCraft(s, u, 'V_06');
    }
    if (verb === 'V_04') {
      const cap = hasWord(s, 'O_13') ? 5 : hasWord(s, 'V_05') ? 3 : 1,
        pieces =
          e.kind === 'ground' && ['wood', 'stone', 'ore'].includes(resource)
            ? [e, ...s.entities.filter((piece) => piece.id !== e.id && sameGroundPile(e, piece))]
            : [e],
        amount = Math.min(
          cap,
          freeCapacity(s, resource),
          pieces.reduce(
            (sum, piece) => sum + Math.max(0, piece.amount - resourcePreservationFloor(s, piece)),
            0,
          ),
        );
      if (amount <= 0) {
        resetUnit(u);
        return;
      }
      if (gatherTool) s.resources.tool = Math.max(0, s.resources.tool - 0.1);
      let remaining = amount;
      for (const piece of pieces) {
        const taken = Math.min(
          remaining,
          Math.max(0, piece.amount - resourcePreservationFloor(s, piece)),
        );
        piece.amount -= taken;
        remaining -= taken;
        if (remaining <= 0) break;
      }
      u.carry = { resource, amount };
      u.action = 'returning';
      if (e.kind === 'berries' && random(s) < 0.1) addResource(s, 'seed', 1);
      if (resource === 'meat' && hasWord(s, 'V_06')) {
        const pelt = FAUNA_SPECS[e.kind as keyof typeof FAUNA_SPECS]?.pelt ?? 1;
        if (!s.eventTimes[`pelt-${e.id}`]) {
          addResource(s, 'pelt', pelt);
          s.eventTimes[`pelt-${e.id}`] = s.time || 0.01;
        }
      }
      recordCraft(s, u, 'V_05');
      recordCraft(s, u, 'V_08');
      if (resource === 'food' || resource === 'meat') recordCraft(s, u, 'V_10');
    } else {
      // Material exists on the ground: striking does not teleport it into storage.
      const n = Math.min(1, e.amount - resourcePreservationFloor(s, e));
      e.amount -= n;
      recordLawWork(
        s,
        u.id,
        [
          ...tokens,
          resource === 'wood'
            ? 'O_03'
            : resource === 'stone'
              ? 'O_02'
              : resource === 'ore'
                ? 'O_07'
                : 'O_04',
        ],
        n,
      );
      drop(s, u, resource, n);
      if (gatherTool) s.resources.tool = Math.max(0, s.resources.tool - 0.1);
      if (s.sparks.some((p) => p.unitId === u.id && ['O_02', 'O_03'].includes(p.wordId)))
        resetUnit(u);
    }
    onDogmaticUse(s, tokens, u);
    return;
  }
}
function startInstinct(s: GameState, u: Unit, dt: number) {
  const fx = getDogmaEffects(s, { unit: u }),
    night = seasonOf(s).isNight,
    sleep = fx.nightWatch ? !night : night;
  if (u.hunger >= 60) {
    if (nearInventory(s, u) && consume(s, u)) return;
    const food = closest(edibleEntities(s, u), u);
    if (food) {
      u.action = 'eating';
      u.targetId = food.id;
      u.command = undefined;
      u.progress = 0;
      return;
    }
    if (totalFood(inventoryAt(s, u)) > 0) {
      u.action = 'moving';
      u.tx = s.home.x;
      u.ty = s.home.y;
      return;
    }
  }
  if (sleep) {
    if (distance(u, s.home) > 8) {
      u.action = 'moving';
      u.tx = s.home.x;
      u.ty = s.home.y;
      return;
    }
    u.action = 'sleeping';
    // Biological rest may move to daytime; Qui still requires actual nights together.
    u.sleptThisNight = night;
    u.restedThisSeason = true;
    return;
  }
  if (u.action === 'sleeping') u.action = 'idle';
  if (u.action === 'idle') {
    if (!u.tx || u.progress <= 0) {
      u.tx = s.home.x + (random(s) - 0.5) * 24;
      u.ty = s.home.y + (random(s) - 0.5) * 24;
      u.progress = 8 + random(s) * 10;
    }
    u.progress = Math.max(0, u.progress - dt);
    move(s, u, u.tx, u.ty ?? s.home.y, dt, 0.6);
  }
}
function assignTradition(s: GameState, u: Unit) {
  if (u.age < ADULT_AGE) return false;
  for (const t of s.traditions) {
    const tokens = t.tokens,
      condition = tokens[0];
    initializeUnit(u);
    if ((u.cooldowns![`law-order:${t.id}`] ?? 0) > s.time) continue;
    if (condition === 'C_01' && !seasonOf(s).isNight) continue;
    const resting = getDogmaEffects(s, { unit: u }).nightWatch
      ? !seasonOf(s).isNight
      : seasonOf(s).isNight;
    if (condition === 'C_02' && resting) continue;
    const subject = tokens[1];
    if (
      (subject === 'S_03' && u.strength < 7) ||
      (subject === 'S_04' && u.intelligence < 7) ||
      (subject === 'S_06' && u.caste !== 'slave') ||
      (subject === 'S_07' && u.id !== s.kingId)
    )
      continue;
    const verb = tokens[2],
      target = t.target,
      pool = matchingEntities(s, tokens, u),
      constrained = tokens.some((id) => ['O_02', 'O_03', 'O_04', 'O_07', 'O_06'].includes(id)),
      clicked =
        target?.type === 'entity'
          ? (constrained ? pool : s.entities).find((e) => e.id === target.id)
          : undefined,
      e = clicked ?? closest(pool, u);
    if (forbiddenByDogma(s, tokens, target, u)) continue;
    if (!enforceActionLaws(s, tokens, target, [u.id])) {
      u.cooldowns![`law-order:${t.id}`] = s.time + 90;
      if (u.hp <= 0 || u.factionId !== 'player') return false;
      continue;
    }
    u.command = [...tokens];
    u.progress = 0;
    u.targetId = e?.id;
    u.tx = e?.x ?? target?.x ?? s.home.x;
    u.ty = e?.y ?? target?.y ?? s.home.y;
    const workKind: BuildingKind | undefined =
      verb === 'V_05' && tokens.includes('O_09')
        ? 'archive'
        : verb === 'V_09'
          ? 'farm'
          : verb === 'V_12'
            ? 'foundry'
            : verb === 'V_10'
              ? 'pen'
              : undefined;
    if (workKind) {
      if (assignWork(s, u, workKind)) return true;
      resetKeepingJob(u);
      continue;
    }
    if (verb === 'V_03')
      u.action =
        e && ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) ? 'hunting' : 'gathering';
    else if (verb === 'V_04') u.action = 'gathering';
    else if (verb === 'V_01') u.action = 'moving';
    else if (verb === 'V_02') u.action = 'eating';
    else if (verb === 'V_05' && tokens.includes('O_05')) u.action = 'guarding';
    else {
      resetUnit(u);
      continue;
    }
    return true;
  }
  return false;
}
function applyEducation(s: GameState) {
  const lawBonus = imperialLawEffects(s).educationIntelligenceBonus;
  for (const u of activeUnits(s)) {
    initializeUnit(u);
    const previousLaw = u.lastEventAt!.STATE_EDUCATION_BONUS ?? 0;
    if (lawBonus > previousLaw) {
      u.intelligence = clamp(u.intelligence + lawBonus - previousLaw, 1, 10);
      u.lastEventAt!.STATE_EDUCATION_BONUS = lawBonus;
    }
    if (u.age >= ADULT_AGE) continue;
    const schoolBonus = s.buildings
      .filter((b) => isPlayerBuilding(s, b) && b.kind === 'school' && distance(u, b) <= 15)
      .reduce((best, b) => Math.max(best, 2 * buildingEfficiency(s, b)), 0);
    const previousSchool = u.lastEventAt!.SCHOOL_EDUCATION_BONUS ?? 0;
    if (schoolBonus > previousSchool) {
      u.intelligence = clamp(u.intelligence + schoolBonus - previousSchool, 1, 10);
      u.lastEventAt!.SCHOOL_EDUCATION_BONUS = schoolBonus;
    }
  }
}
export function updateUnits(s: GameState, dt: number) {
  const elderPrivilege = getDogmaEffects(s).elderFoodPrivilege;
  const ordered = rationCandidates(s);
  if (s.foodPriority || elderPrivilege)
    ordered.sort((a, b) => foodAccessRank(s, b) - foodAccessRank(s, a));
  for (const u of ordered) {
    initializeUnit(u);
    // GDD COMBAT_FLEE is an interrupt for a new wound, not a permanent injury state.
    // Capture the threshold before this update's ordinary home healing.
    const combatWound = u.pendingCombatDamage === true && u.hp <= 30;
    u.pendingCombatDamage = false;
    // The foreign selector admits visitors to our stores without simulating
    // their entire civilization or charging their distant city's inventory.
    if (u.factionId !== undefined && u.factionId !== 'player') {
      if (u.hunger >= 60 || (u.action === 'eating' && u.hunger > 0)) {
        if (nearInventory(s, u)) consume(s, u);
        else if (u.command?.includes('V_02')) move(s, u, s.home.x, s.home.y, dt);
      }
      continue;
    }
    const protectedFromFamine = elderPrivilege && u.age >= ELDER_AGE;
    if (s.urbanized && u.cityId && !u.isKing) {
      const city = s.cities.find((c) => c.id === u.cityId && c.factionId === 'player');
      if (!city) continue;
      u.hunger = clamp(u.hunger + 0.8 * dt);
      const mortality = u.caste === 'slave' ? imperialLawEffects(s).slaveMortalityMultiplier : 1;
      if (u.plagueUntil && u.plagueUntil > s.time) u.hp -= 1.5 * dt * mortality;
      if (u.hunger >= 100 && !protectedFromFamine) u.hp -= 2 * dt * mortality;
      if (u.hunger <= 20) u.hp = clamp(u.hp + 0.5 * dt);
      if (u.hp <= 0) {
        killUnit(s, u, u.hunger >= 100 && !protectedFromFamine ? 'ENV_STARVATION' : 'STAT_PLAGUE');
        continue;
      }
      if (u.hunger >= 60) consume(s, u);
      if (u.hunger >= 80 && totalFood(city.resources) <= 0)
        recordEvent(s, u, 'ENV_STARVATION', 15, ['M_02'], 1);
      evaluateDiscoveries(s, u);
      continue;
    }
    const phase = seasonOf(s),
      fx = getDogmaEffects(s, { unit: u, tokens: u.command });
    u.hunger = clamp(u.hunger + 0.8 * dt);
    const fire = s.buildings.some(
        (b) => b.kind === 'campfire' && b.active && b.hp > 0 && distance(b, u) <= 15,
      ),
      shelter = closest(
        s.buildings.filter(
          (b) => b.active && b.hp > 0 && ['hut', 'house'].includes(b.kind) && distance(b, u) <= 10,
        ),
        u,
      );
    const clothing =
        (!fx.vegetarian && s.resources.pelt >= activeUnits(s).indexOf(u) + 1 ? 1 : 0) +
        (shelter?.kind === 'house' ? 2.5 : shelter?.kind === 'hut' ? 1 : 0),
      ambient = s.disasters.blizzard
        ? -10
        : SEASON_TEMPERATURES[phase.index][phase.isNight ? 'night' : 'day'];
    u.temp = clamp(u.temp + bodyTemperatureDelta(ambient, fire ? 3 : 0, clothing) * dt);
    const mortality = u.caste === 'slave' ? imperialLawEffects(s).slaveMortalityMultiplier : 1;
    if (u.temp <= 20) u.hp -= 1.5 * dt * mortality;
    if (u.hunger >= 100 && !protectedFromFamine) u.hp -= 2 * dt * mortality;
    if (u.plagueUntil && u.plagueUntil > s.time) u.hp -= 1.5 * dt * mortality;
    if (u.hunger <= 20 && distance(u, s.home) <= 10) u.hp = clamp(u.hp + 0.5 * dt);
    if (u.hp <= 0) {
      killUnit(
        s,
        u,
        u.hunger >= 100 && !protectedFromFamine
          ? 'ENV_STARVATION'
          : u.temp <= 20
            ? 'C_01'
            : u.plagueUntil && u.plagueUntil > s.time
              ? 'STAT_PLAGUE'
              : 'trauma',
      );
      continue;
    }
    if (foodAccessRank(s, u) > 0 && u.hunger >= 60 && nearInventory(s, u)) consume(s, u);
    const ally = closest(
      activeUnits(s).filter((v) => v.id !== u.id),
      u,
    );
    u.isolation = ally && distance(u, ally) >= 50 ? u.isolation + dt : 0;
    if (u.isolation >= 30) recordEvent(s, u, 'ENV_ISOLATION', 35, ['S_02'], 1);
    if (
      phase.isNight &&
      ['moving', 'fleeing'].includes(u.action) &&
      u.lastNightEvent !== Math.floor(s.time / 90)
    ) {
      recordEvent(s, u, 'ENV_NIGHTFALL', 25, ['C_01']);
      u.lastNightEvent = Math.floor(s.time / 90);
    }
    if ((phase.isNight || phase.index === 3) && u.hunger >= 80 && totalFood(s.resources) <= 0)
      recordEvent(s, u, 'ENV_STARVATION', 15, ['M_02'], 1);
    if (s.entities.some((e) => e.kind === 'corpse' && e.amount > 0 && distance(e, u) <= 10))
      recordEvent(s, u, 'ENV_CORPSE', 80, ['O_06'], 1);
    if (
      u.hunger <= 0 &&
      edibleEntities(s, u).some((e) => distance(u, e) <= 2) &&
      hasWord(s, 'O_01')
    )
      recordEvent(s, u, 'ENV_SURPLUS', 60, ['V_04'], 1);
    if (s.cohesion < 25) recordEvent(s, u, 'ENV_COHESION_CRITICAL', 100, ['M_03'], 1);
    if (u.age >= CORE_DEFAULTS.sageDiscoveryAgeSeasons && hasWord(s, 'O_05') && hasWord(s, 'M_02'))
      recordEvent(s, u, 'ENV_ELDER', 100, ['S_04'], 30);
    const foreigners = s.cities.filter((c) => c.factionId !== 'player' && distance(u, c) <= 30);
    if (foreigners.length) recordEvent(s, u, 'ENV_OTHER_TRIBE', 70, ['S_05'], 1);
    if (
      hasWord(s, 'O_10') &&
      s.battalions.some((b) => b.factionId !== 'player' && distance(b, s.home) <= 35)
    )
      recordEvent(s, u, 'ENV_TRESPASSING', 80, ['O_10'], 1);
    const resting = fx.nightWatch ? !phase.isNight : phase.isNight,
      fireJob = s.buildings.find((b) => b.id === u.jobBuildingId),
      outsideShift = continuousFireGuard(fireJob, u.command)
        ? false
        : u.command?.[0] === 'C_01'
          ? !phase.isNight
          : resting;
    // Earlier saves could resume a fire caretaker as a generic worker.
    if (
      fireJob?.kind === 'campfire' &&
      u.action === 'working' &&
      u.command?.includes('V_05') &&
      u.command.includes('O_05')
    )
      u.action = 'guarding';
    if (u.jobBuildingId && (u.hunger >= 75 || outsideShift || (fx.nightTaboo && phase.isNight)))
      pauseBuildingJob(s, u);
    else if (u.command?.[0] === 'C_02' && resting && u.action !== 'returning') resetUnit(u);
    else if (u.command?.[0] === 'C_01' && !phase.isNight) resetUnit(u);
    if (
      u.command &&
      forbiddenByDogma(
        s,
        u.command,
        u.targetId
          ? s.entities.some((e) => e.id === u.targetId)
            ? { type: 'entity', id: u.targetId, x: u.tx ?? u.x, y: u.ty ?? u.y }
            : undefined
          : undefined,
        u,
      )
    )
      resetUnit(u);
    if (fx.nightTaboo && phase.isNight) {
      u.command = undefined;
      if (distance(u, s.home) > 4) {
        u.action = 'moving';
        u.tx = s.home.x;
        u.ty = s.home.y;
        processWork(s, u, dt);
      } else {
        u.action = 'sleeping';
        u.sleptThisNight = true;
        u.restedThisSeason = true;
        if (u.hunger >= 60) consume(s, u);
      }
      evaluateDiscoveries(s, u);
      continue;
    }
    const martial = s.laws.some((l) => l.sanctionId === 'O_06' && l.objectId === 'S_08');
    const savingFire =
      u.command?.includes('O_05') ||
      (u.jobBuildingId && s.buildings.find((b) => b.id === u.jobBuildingId)?.kind === 'campfire');
    if (!martial && (u.hunger >= 95 || (u.temp <= 15 && !savingFire))) {
      if (u.command) recordEvent(s, u, 'ENV_DISOBEDIENCE', 100, ['C_03'], 30);
      if (u.carry) {
        drop(s, u, u.carry.resource, u.carry.amount);
        u.carry = undefined;
      }
      if (u.temp <= 15 && fire === false && hasBuilding(s, 'campfire')) {
        const nearest = closest(
          s.buildings.filter((b) => b.kind === 'campfire' && b.active),
          u,
        );
        u.action = 'moving';
        u.tx = nearest?.x ?? s.home.x;
        u.ty = nearest?.y ?? s.home.y;
        u.command = undefined;
      } else if (u.action !== 'eating') {
        resetKeepingJob(u);
        startInstinct(s, u, dt);
      }
    }
    if (!martial && hasWord(s, 'M_01') && combatWound && u.hunger < 95 && u.temp > 15) {
      if (u.jobBuildingId) pauseBuildingJob(s, u);
      u.action = 'fleeing';
      u.tx = s.home.x;
      u.ty = s.home.y;
      u.command = undefined;
    }
    if (['idle', 'sleeping'].includes(u.action)) {
      const assigned =
        u.hunger < 75 && u.temp > 30 && (resumeBuildingJob(s, u) || assignTradition(s, u));
      if (u.hp <= 0 || u.factionId !== 'player') continue;
      if (assigned) processWork(s, u, dt);
      else startInstinct(s, u, dt);
    } else processWork(s, u, dt);
    const sx = Math.min(4, Math.floor(u.x / 100)),
      sy = Math.min(4, Math.floor(u.y / 100)),
      sector = s.sectors.find((z) => z.x === sx && z.y === sy);
    if (sector) sector.explored = true;
    if (!s.explored.some((p) => distance(p, u) < 20)) s.explored.push({ x: u.x, y: u.y });
    evaluateDiscoveries(s, u);
  }
  applyEducation(s);
}
export function updateAnimals(s: GameState, dt: number) {
  for (const e of s.entities.filter(
    (e) => e.hp > 0 && ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) && !e.domesticated,
  )) {
    const human = closest(activeUnits(s), e);
    if (!human) continue;
    const fa = FAUNA_SPECS[e.kind as keyof typeof FAUNA_SPECS];
    const predator = ['wolf', 'alpha'].includes(e.kind),
      attack =
        predator &&
        (seasonOf(s).isNight || human.isolation >= 30 || e.kind === 'alpha') &&
        distance(e, human) <= 20;
    if (attack) {
      if (
        getDogmaEffects(s, { unit: human }).protected ||
        (hasBuilding(s, 'palisade') && distance(human, s.home) <= 15)
      )
        continue;
      if (distance(e, human) > 1.5) {
        const d = distance(e, human),
          step = Math.min(d, fa.speed * dt);
        e.x += ((human.x - e.x) / d) * step;
        e.y += ((human.y - e.y) / d) * step;
      } else {
        const wound = fa.damage * dt;
        human.hp -= wound;
        rememberCombatWound(s, human, wound, { kind: e.kind as 'wolf' | 'alpha', id: e.id });
        if (wound > 0) {
          recordAttackTrauma(s);
          witnessAnimalWound(s, human);
        }
        if (human.hp <= 0) killUnit(s, human, 'V_03');
      }
    } else if (e.kind === 'deer' && distance(e, human) <= 15 && !e.attacked) {
      const d = distance(e, human) || 1;
      e.x = clamp(
        e.x + ((e.x - human.x) / d) * fa.speed * dt,
        Math.floor((e.originX ?? e.x) / 100) * 100 + 2,
        Math.floor((e.originX ?? e.x) / 100) * 100 + 98,
      );
      e.y = clamp(
        e.y + ((e.y - human.y) / d) * fa.speed * dt,
        Math.floor((e.originY ?? e.y) / 100) * 100 + 2,
        Math.floor((e.originY ?? e.y) / 100) * 100 + 98,
      );
    } else if (!e.attacked) {
      const phase = s.time * 0.05 + Number(e.id.split('-').at(-1));
      e.x = clamp((e.originX ?? e.x) + Math.sin(phase) * 2, 0, 500);
      e.y = clamp((e.originY ?? e.y) + Math.cos(phase) * 2, 0, 500);
    }
  }
}
export function seasonalCore(s: GameState) {
  const season = seasonOf(s),
    // Settlement runs after time crosses the boundary. Weather and spring
    // regeneration use the new season; costs, spoilage and harvest close the old one.
    endedSeason = (season.index + 3) % 4,
    live = activeUnits(s);
  s.stats.seasonsSurvived++;
  s.nightCount++;
  const slept = live.filter((u) => u.sleptThisNight && distance(u, s.home) <= 10);
  const rested = new Set(
    live
      .filter((u) => (u.sleptThisNight || u.restedThisSeason) && distance(u, s.home) <= 10)
      .map((u) => u.id),
  );
  s.nightSleeping = slept.length >= Math.ceil(live.length * 0.75) ? s.nightSleeping + 1 : 0;
  for (const u of live) {
    u.sleptThisNight = false;
    u.restedThisSeason = false;
  }
  if (s.nightSleeping >= (s.playMode === 'guided' ? 1 : 2))
    for (const u of slept) recordEvent(s, u, 'ENV_SLEEP_CLUSTER', 100, ['O_01']);
  if (
    season.index === 2 &&
    !s.buildings.some((b) => isPlayerBuilding(s, b) && b.kind === 'campfire' && b.active)
  ) {
    log(
      s,
      'L’aria si fa rigida: l’inverno gelerà la valle al secondo 270. Accendete il Falò con cinque legna prima che sia troppo tardi!',
      'warning',
    );
  }
  for (const u of live) {
    u.age++;
    if (u.age === ELDER_AGE) {
      u.strength = clamp(u.strength - 3, 1, 10);
      u.intelligence = clamp(u.intelligence + 2, 1, 10);
    }
    if (random(s) < senileDeathProbability(u.age)) killUnit(s, u, 'oldAge');
  }
  const fx = getDogmaEffects(s);
  // Upkeep determines the next season. Preserve output and bonuses already
  // earned in the season just closed, even if its building now loses upkeep.
  const villageWork = new Map(
      s.buildings
        .filter((b) => !b.cityId && isPlayerBuilding(s, b))
        .map((b) => [b.id, seasonalBuildingEfficiency(s, b)]),
    ),
    hadStorage = hasBuilding(s, 'storage'),
    hadWorkshop = hasBuilding(s, 'workshop'),
    hadDrought = s.disasters.drought,
    agricultureLaw = imperialLawEffects(s).agricultureMultiplier;
  for (const b of s.buildings.filter(
    (b) => isPlayerBuilding(s, b) && b.hp > 0 && b.completed !== false,
  )) {
    const spec = BUILDING_SPECS[b.kind],
      city = s.cities.find((c) => c.id === b.cityId),
      inv = city && !city.capital ? city.resources : s.resources;
    if (spec.upkeepSeason === undefined || spec.upkeepSeason === endedSeason) {
      const cost = Object.fromEntries(
        Object.entries(spec.upkeep).map(([r, n]) => [r, n * fx.upkeep]),
      ) as Partial<Inventory>;
      const sharedCoins = city?.factionId === 'player' && inv !== s.resources,
        materials = { ...cost };
      if (sharedCoins) delete materials.coin;
      const localFire =
        b.kind === 'campfire' && !b.cityId && payLocalFuel(s, cost.wood ?? 0, b.x, b.y);
      if (
        localFire ||
        (canPay(inv, materials) && (!sharedCoins || s.resources.coin >= (cost.coin ?? 0)))
      ) {
        if (!localFire) pay(inv, materials);
        if (sharedCoins) s.resources.coin -= cost.coin ?? 0;
        b.active = true;
        if (b.kind === 'campfire') s.burntWood += cost.wood ?? 0;
      } else {
        b.active = false;
        b.hp = Math.max(0, b.hp - spec.maxHp * 0.2);
        log(
          s,
          `${spec.label}: manutenzione insufficiente, perdita del venti per cento della salute massima.`,
          'warning',
        );
      }
    }
  }
  const spring = season.index === 0;
  s.disasters.storm = (spring || season.index === 2) && random(s) < 0.2;
  s.disasters.drought = season.index === 1 ? random(s) < 0.15 : s.disasters.drought;
  // Guided gives the first winter time to teach food and fuel management.
  // Keep the real draw, so the grace period does not shift later random events.
  const rolledBlizzard = season.index === 3 && random(s) < 0.15;
  s.disasters.blizzard = rolledBlizzard && !(s.playMode === 'guided' && s.time < 360);
  s.disasters.lightning = season.index === 1 && random(s) < 0.15;
  if (s.disasters.storm && !hasBuilding(s, 'temple'))
    for (const b of s.buildings.filter((b) => isPlayerBuilding(s, b) && b.kind === 'campfire'))
      if (
        !(b.workerIds ?? []).some((id) =>
          s.units.some((u) => u.id === id && u.hp > 0 && u.action === 'guarding'),
        )
      )
        b.active = false;
  if (s.disasters.lightning) {
    const tree = closest(
      s.entities.filter((e) => e.kind === 'tree' && e.amount > 0),
      s.home,
    );
    if (tree) {
      tree.burning = true;
      for (const u of activeUnits(s).filter((u) => distance(u, tree) <= 30))
        recordEvent(s, u, 'ENV_LIGHTNING_FIRE', 100, ['O_05']);
      log(s, 'Un fulmine incendia un albero. La luce può diventare conoscenza.', 'warning');
    }
  }
  if (s.disasters.blizzard)
    log(s, 'Una tormenta glaciale porta la temperatura ambiente a meno dieci.', 'danger');
  if (s.disasters.drought) log(s, 'La siccità dimezza bacche e raccolti di quest’anno.', 'warning');
  for (const r of RESOURCE_ORDER) {
    const spec = RESOURCE_SPECS[r];
    if (spec.spoil > 0) {
      const factor =
        spec.category === 'food'
          ? resourceSpoilage(spec.spoil, endedSeason === 1, hadStorage, s.resources.pottery > 0)
          : spec.spoil;
      s.resources[r] *= 1 - factor;
    }
  }
  for (const b of s.buildings.filter((b) => !b.cityId)) {
    const efficiency = villageWork.get(b.id) ?? 0;
    b.lastEfficiency = efficiency;
    if (efficiency <= 0) continue;
    if (b.kind === 'farm' && endedSeason === 2) {
      const workshop = hadWorkshop ? 3 : 1;
      const harvested = addResource(
        s,
        'food',
        50 *
          efficiency *
          workshop *
          fx.agriculture *
          agricultureLaw *
          fx.production *
          (hadDrought && !hadWorkshop ? 0.5 : 1),
      );
      const work = b.seasonWork?.[Math.floor(s.time / 90) - 1],
        totalWork = Object.values(work?.workerSeconds ?? {}).reduce(
          (sum, seconds) => sum + seconds,
          0,
        );
      if (harvested > 0)
        for (const [id, seconds] of Object.entries(work?.workerSeconds ?? {})) {
          const worker = s.units.find((u) => u.id === id && u.hp > 0);
          if (!worker) continue;
          const contributions = work?.commandSeconds?.[id] ?? {},
            recorded = Object.values(contributions).reduce((sum, n) => sum + n, 0);
          for (const [signature, earnedSeconds] of Object.entries(contributions))
            recordLawWork(
              s,
              worker.id,
              signature.split('|'),
              (harvested * earnedSeconds) / Math.max(1e-9, totalWork),
              Math.max(0, Math.floor(s.time / 90) * 90 - 1e-6),
            );
          // Older saves or explicit diagnostic fixtures have no phrase ledger.
          if (seconds > recorded)
            recordLawWork(
              s,
              worker.id,
              ['S_01', 'V_09', 'O_04'],
              (harvested * (seconds - recorded)) / Math.max(1e-9, totalWork),
              Math.max(0, Math.floor(s.time / 90) * 90 - 1e-6),
            );
        }
    }
    if (b.kind === 'pen' && (b.livestock ?? 0) > 0) {
      addResource(s, 'meat', 20 * efficiency * fx.herding);
      if (!fx.vegetarian) addResource(s, 'pelt', 5 * efficiency);
    }
    if (b.kind === 'grave' && efficiency > 0 && !fx.cremation)
      for (const corpse of s.entities.filter(
        (e) => e.kind === 'corpse' && e.amount > 0 && distance(e, b) <= 100,
      )) {
        corpse.amount = 0;
        s.cohesion = clamp(s.cohesion + 5);
      }
    if (b.kind === 'temple') s.attention = clamp(s.attention + 20 * efficiency, 0, fx.attentionCap);
  }
  if (hasBuilding(s, 'campfire')) {
    const hunger =
        activeUnits(s).reduce((n, u) => n + u.hunger, 0) / Math.max(1, activeUnits(s).length),
      elders = activeUnits(s).filter((u) => u.age >= ELDER_AGE).length;
    const temple = s.buildings
      .filter((b) => isPlayerBuilding(s, b) && b.kind === 'temple')
      .reduce((n, b) => n + 20 * (villageWork.get(b.id) ?? 0), 0);
    s.attention = clamp(
      attentionPoints(s.burntWood, elders * fx.elderAttention, hunger, fx.attentionCap) + temple,
      0,
      fx.attentionCap,
    );
    s.campfirePending = true;
  } else s.attention = 0;
  s.burntWood = 0;
  if (spring) {
    s.disasters.drought = false;
    for (const sector of s.sectors) {
      const animals = s.entities.filter(
        (e) =>
          ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) &&
          e.hp > 0 &&
          Math.floor(e.x / 100) === sector.x &&
          Math.floor(e.y / 100) === sector.y,
      );
      const fractionKey = `FAUNA_FRACTION:${sector.id}`;
      const expected =
        animals.length === 0
          ? 0
          : Math.max(
              0,
              faunaGrowth(animals.length, CORE_DEFAULTS.faunaRate, 20) +
                (s.eventTimes[fractionKey] ?? 0),
            );
      const growth = Math.min(Math.max(0, 20 - animals.length), Math.floor(expected));
      s.eventTimes[fractionKey] = animals.length === 0 ? 0 : expected - Math.floor(expected);
      for (let i = 0; i < growth; i++) {
        const parent = animals[i % animals.length];
        if (parent)
          s.entities.push({
            ...parent,
            id: nextId(s, 'fauna'),
            attacked: false,
            amount: FAUNA_SPECS[parent.kind as keyof typeof FAUNA_SPECS].meat,
          });
      }
    }
    if (s.resources.food > 0 && !hasBuilding(s, 'storage')) {
      for (const u of activeUnits(s).filter((u) => distance(u, s.home) <= 20))
        recordEvent(s, u, 'ENV_SEED_SPROUT', 60, ['V_09']);
    }
    for (const e of s.entities) {
      const preserve = resourcePreservationFloor(s, e) > 0 ? 2 : 1;
      if (e.kind === 'berries')
        e.amount = Math.min(e.maxAmount ?? 20, e.amount + 10 * 1.5 * preserve);
      if (e.kind === 'tree') e.amount = Math.min(e.maxAmount ?? 20, e.amount + 2 * 1.5 * preserve);
      if (e.kind === 'ground' && e.resource === 'food' && distance(e, s.home) < 10) {
        for (const u of activeUnits(s).filter((u) => distance(u, e) <= 20))
          recordEvent(s, u, 'ENV_SEED_SPROUT', 60, ['V_09']);
      }
    }
  }
  if (!s.urbanized) {
    const housing = villageHousing(s),
      fertile = eligibleParents(s, { restedIds: rested, celibateSages: fx.celibateSages });
    const chance =
      birthProbability(
        activeUnits(s).length,
        housing,
        hasBuilding(s, 'hut') ? 0.25 : 0,
        fx.birthAdd,
      ) *
      fx.growth *
      imperialLawEffects(s).birthMultiplier;
    const pairs = pairFertileUnits(fertile);
    for (let pair = 0; pair < pairs.length && activeUnits(s).length < housing; pair++)
      if (random(s) < chance) {
        const [p, q] = pairs[pair],
          u: Unit = {
            id: nextId(s, 'unit'),
            name: '',
            parentIds: [p.id, q.id],
            bornAt: s.time,
            x: s.home.x,
            y: s.home.y,
            hp: 60,
            hunger: 10,
            temp: 100,
            age: 0,
            strength: clamp((p.strength + q.strength) / 2 + (random(s) < 0.5 ? -1 : 1), 1, 10),
            intelligence: clamp(
              (p.intelligence + q.intelligence) / 2 + (random(s) < 0.5 ? -1 : 1),
              1,
              10,
            ),
            action: 'idle',
            progress: 0,
            knows: [...INNATE_WORDS],
            isolation: 0,
            caste: 'citizen',
            factionId: 'player',
            eventMemory: [],
            tension: {},
            cooldowns: {},
          };
        u.sex = random(s) < 0.5 ? 'M' : 'F';
        u.name = newbornName(s, u.sex);
        s.units.push(u);
        for (const w of INNATE_WORDS) s.words[w].custodians.push(u.id);
        s.stats.births++;
        recordTribeEvent(s, { kind: 'birth', unitId: u.id, parentIds: u.parentIds });
        log(s, `${u.name} nasce nella comunità, da ${p.name} e ${q.name}.`, 'good');
      }
  }
  const corpses = s.entities.filter(
    (e) => e.kind === 'corpse' && e.amount > 0 && distance(e, s.home) <= 30,
  );
  if (
    (corpses.length > 2 || (population(s) > 100 && !hasBuilding(s, 'workshop'))) &&
    random(s) < 0.25
  ) {
    const infected = activeUnits(s).slice(0, Math.ceil(activeUnits(s).length * 0.3));
    for (const u of infected) u.plagueUntil = s.time + 60;
    s.cohesion = clamp(s.cohesion - 20);
    s.recentTrauma = { tag: 'STAT_PLAGUE', time: s.time };
    log(s, 'Un’epidemia colpisce il trenta per cento della comunità.', 'danger');
  }
  updateDogmasSeason(s);
  const threshold = [0, 6, 8, 16, 25, 35][s.tier],
    stable = availableWords(s).filter((w) => s.words[w].retention >= 50).length;
  if (stable < threshold) {
    s.tierDeficitSeasons++;
    if (s.tierDeficitSeasons > 2) s.lockedSlot = true;
  } else {
    s.tierDeficitSeasons = 0;
    s.lockedSlot = false;
  }
  log(s, `${getSeason(s).name}, anno ${getSeason(s).year}: una nuova stagione.`);
}
export function finishSeasonMemory(s: GameState) {
  const fx = getDogmaEffects(s);
  for (const [id, m] of Object.entries(s.words)) {
    const w = WORDS[id];
    if (w.tier === 0) {
      m.retention = 100;
      m.uses = 0;
      m.investment = 0;
      continue;
    }
    let support = 0;
    for (const b of s.buildings.filter((b) => isPlayerBuilding(s, b) && b.hp > 0 && b.active)) {
      if (b.kind === 'stele' && b.fixedWordId === id) support = Math.max(support, 0.95);
      if (b.kind === 'archive')
        support = Math.max(
          support,
          b.cityId ? Math.min(1, b.lastEfficiency ?? 0) : buildingEfficiency(s, b),
        );
    }
    m.support = support;
    const remembered = m.retention > 0;
    m.retention = clamp(
      m.retention + retentionDelta(m.uses, 0, w.complexity, support, fx.gamma * fx.decay),
    );
    m.uses = 0;
    m.investment = 0;
    if (remembered && m.retention <= 0) {
      recordTribeEvent(s, { kind: 'word-lost', wordId: id, cause: 'forgetting' });
      log(s, `«${w.label}» è stata dimenticata.`, 'danger');
    }
  }
  advanceTier(s);
}
export function simulationStep(s: GameState, dt: number) {
  for (const city of s.cities.filter(
    (c) => c.factionId !== 'player' && activeUnits(s).some((u) => distance(u, c) <= 30),
  )) {
    if (s.units.some((u) => u.id === `envoy-${city.id}`)) continue;
    const foreign: Unit = {
      id: `envoy-${city.id}`,
      name: `Pattuglia di ${city.name}`,
      x: city.x,
      y: city.y,
      hp: 100,
      hunger: 20,
      temp: 100,
      age: 8,
      strength: 5,
      intelligence: 5,
      action: 'idle',
      progress: 0,
      knows: [...city.words],
      isolation: 0,
      caste: 'warrior',
      factionId: city.factionId,
      cityId: city.id,
      eventMemory: [],
      tension: {},
      cooldowns: {},
    };
    s.units.push(foreign);
  }
  recordBuildingWork(s, dt);
  updateCivilConflicts(s, dt, civilStrike);
  updateUnits(s, dt);
  updateAnimals(s, dt);
  updateDogmas(s, dt);
  const survivors = activeUnits(s);
  if (
    survivors.length > 0 &&
    survivors.filter((u) => u.hunger >= 100).length >= Math.ceil(survivors.length / 2)
  )
    recordSurvivalTrauma(s, 'ENV_STARVATION', CORE_DEFAULTS.famineTrauma);
  const corpseCount = s.entities.filter(
    (e) => e.kind === 'corpse' && e.amount > 0 && distance(e, s.home) <= 30,
  ).length;
  s.cohesion = clamp(s.cohesion - ((corpseCount * 2) / 60) * dt);
  for (const spark of [...s.sparks])
    if (spark.expiresAt < s.time || !s.units.some((u) => u.id === spark.unitId && u.hp > 0)) {
      s.sparks = s.sparks.filter((p) => p.id !== spark.id);
      const u = s.units.find((u) => u.id === spark.unitId);
      if (u) {
        initializeUnit(u);
        u.tension![spark.wordId] = 50;
      }
      s.tension[spark.wordId] = 50;
    }
  if (s.resources.wood >= 5 && hasWord(s, 'O_05') && !hasBuilding(s, 'campfire')) tryIgnite(s);
  const sum = RESOURCE_ORDER.filter((r) => r !== 'coin').reduce((n, r) => n + s.resources[r], 0),
    erosion = availableWords(s).reduce((n, w) => n + 3 * WORDS[w].complexity, 0);
  for (const u of activeUnits(s)) {
    if (sum > 500) recordEvent(s, u, 'ENV_ACCOUNTING', 100, ['O_08'], 30);
    // P is normalized to blocks of ten Attention in the final teaching rule.
    if (erosion > getDogmaEffects(s).attentionCap)
      recordEvent(s, u, 'ENV_ORAL_OVERFLOW', 100, ['O_09'], 30);
    if (hasWord(s, 'M_02') && hasWord(s, 'M_03') && (s.words.M_02?.uses ?? 0) >= 2)
      recordEvent(s, u, 'ENV_REPEATED_PROMISE', 100, ['C_02'], 60);
    if (
      hasWord(s, 'S_05') &&
      hasWord(s, 'M_04') &&
      hasWord(s, 'O_01') &&
      s.cities.some((c) => c.factionId !== 'player' && distance(u, c) <= 35)
    )
      recordEvent(s, u, 'ENV_TERRITORY', 80, ['O_10'], 10);
    if (hasWord(s, 'C_02') && hasWord(s, 'M_03') && u.isKing)
      recordEvent(s, u, 'ENV_AUTHORITY', 100, ['S_07'], 60);
    if (hasWord(s, 'O_09') && hasWord(s, 'O_10') && population(s) >= 150)
      recordEvent(s, u, 'ENV_URBAN', 100, ['S_09'], 60);
    if (
      s.battalions.some(
        (b) =>
          b.factionId === 'player' &&
          b.action === 'moving' &&
          Math.floor(b.x / 100) !== Math.floor(s.home.x / 100),
      )
    )
      recordEvent(s, u, 'ENV_MARCH', 100, ['V_13'], 60);
    evaluateDiscoveries(s, u);
  }
  advanceTier(s);
  if (population(s) <= 0) s.gameOver = 'La tribù si è estinta.';
  else if (s.cohesion <= 0) s.gameOver = 'La coesione è esaurita: la comunità si disperde.';
}
