import { BUILDING_SPECS, INNATE_WORDS, RESOURCE_ORDER, WORDS } from './content';
import type { GameState } from './types';
import { TRIBE_EVENT_LIMIT } from './demography';
import { validLearnedRecipe } from './knowledgeRecovery';
import {
  REGIONAL_ROUTE_GRID,
  REGIONAL_ROUTE_LIMIT,
  REGIONAL_ROUTE_WEAR_LIMIT,
} from './regionalHistory';

type RecordValue = Record<string, unknown>;
type Check = (value: unknown) => boolean;
const record = (v: unknown): v is RecordValue => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min = 0, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown) => typeof v === 'string';
const flag = (v: unknown) => typeof v === 'boolean';
const list = (v: unknown, check: Check) => Array.isArray(v) && v.every(check);
const optional = (v: unknown, check: Check) => v === undefined || check(v);
const word = (v: unknown) => typeof v === 'string' && Object.hasOwn(WORDS, v);
const words = (v: unknown) => list(v, word);
const ids = (v: unknown) => list(v, text);
const parents = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every(text) && v[0] !== v[1];
const combatSource = (v: unknown) =>
  record(v) &&
  ['wolf', 'alpha', 'mammoth', 'deer', 'human', 'army'].includes(v.kind as string) &&
  optional(v.id, text) &&
  number(v.time);
const point = (v: unknown) => record(v) && number(v.x, 0, 500) && number(v.y, 0, 500);
const regionalRoad = (v: unknown) => {
  if (
    !record(v) ||
    typeof v.key !== 'string' ||
    v.key.length > 96 ||
    !/^-?\d+:-?\d+:\d+:\d+(?::\d+)?$/.test(v.key) ||
    !point(v.from) ||
    !point(v.to) ||
    !number(v.travelled, Number.MIN_VALUE, REGIONAL_ROUTE_WEAR_LIMIT)
  )
    return false;
  const from = v.from as { x: number; y: number },
    to = v.to as { x: number; y: number };
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return (
    length > 0 &&
    length <= REGIONAL_ROUTE_GRID * Math.SQRT2 + 0.001 &&
    (v.travelled as number) >= length - 0.001
  );
};
const inventory = (v: unknown) => record(v) && RESOURCE_ORDER.every((k) => number(v[k]));
const numericMap = (v: unknown) => record(v) && Object.values(v).every((x) => number(x, -Infinity));
const named = (v: unknown): v is RecordValue => record(v) && typeof v.id === 'string';
const unique = (v: unknown) =>
  Array.isArray(v) && v.every(named) && new Set(v.map((x) => x.id)).size === v.length;
const event = (v: unknown) =>
  record(v) && text(v.tag) && number(v.time) && number(v.weight, -Infinity) && words(v.wordIds);
const target = (v: unknown) =>
  point(v) &&
  record(v) &&
  ['point', 'entity', 'unit', 'building', 'city', 'battalion', 'caravan'].includes(
    v.type as string,
  ) &&
  optional(v.id, text);
const dogma = (v: unknown) =>
  named(v) &&
  word(v.targetId) &&
  word(v.vectorId) &&
  text(v.name) &&
  text(v.description) &&
  number(v.age) &&
  number(v.weight);
const tradition = (v: unknown) =>
  named(v) && words(v.tokens) && number(v.createdAt) && optional(v.target, target);
const faction = (v: unknown) =>
  named(v) &&
  text(v.name) &&
  words(v.words) &&
  list(v.dogmas, dogma) &&
  number(v.relation, -100, 100) &&
  flag(v.hostile) &&
  text(v.cityId) &&
  optional(v.eventMemory, (x) => list(x, event)) &&
  optional(v.tension, numericMap);
const city = (v: unknown) => {
  if (!named(v) || !point(v) || !record(v.cohorts) || !record(v.assimilation)) return false;
  return (
    text(v.name) &&
    text(v.factionId) &&
    number(v.sectorX, 0, 4) &&
    number(v.sectorY, 0, 4) &&
    ['workers', 'warriors', 'sages', 'slaves'].every((k) =>
      number((v.cohorts as RecordValue)[k]),
    ) &&
    inventory(v.resources) &&
    inventory(v.production) &&
    words(v.words) &&
    list(v.dogmas, dogma) &&
    ids(v.buildingIds) &&
    list(v.vocations, tradition) &&
    number(v.revoltTension, 0, 100) &&
    number(v.loyalty, 0, 100) &&
    number(v.housing) &&
    flag(v.assimilation.active) &&
    number(v.assimilation.delegateCount) &&
    optional(v.frontlineSageIds, ids)
  );
};
const unit = (v: unknown) =>
  named(v) &&
  point(v) &&
  text(v.name) &&
  optional(v.sex, (x) => x === 'M' || x === 'F') &&
  optional(v.parentIds, parents) &&
  optional(v.bornAt, number) &&
  optional(v.deathAt, number) &&
  number(v.hp, 0, 100) &&
  number(v.hunger, 0, 100) &&
  number(v.temp, 0, 100) &&
  number(v.age) &&
  number(v.strength, 1, 10) &&
  number(v.intelligence, 1, 10) &&
  text(v.action) &&
  number(v.progress) &&
  number(v.isolation) &&
  words(v.knows) &&
  optional(v.command, words) &&
  optional(v.restedThisSeason, flag) &&
  optional(v.pendingCombatDamage, flag) &&
  optional(v.lastCombatSource, combatSource) &&
  optional(v.craftNeedsPayment, flag) &&
  optional(v.suspendedJob, (x) => record(x) && text(x.buildingId) && words(x.command)) &&
  optional(v.eventMemory, (x) => list(x, event)) &&
  optional(v.tension, numericMap) &&
  optional(v.cooldowns, numericMap) &&
  optional(v.lastEventAt, numericMap) &&
  optional(v.tx, (x) => number(x, 0, 500)) &&
  optional(v.ty, (x) => number(x, 0, 500)) &&
  optional(v.caste, (x) => ['citizen', 'warrior', 'sage', 'slave'].includes(x as string)) &&
  optional(
    v.carry,
    (x) =>
      record(x) &&
      RESOURCE_ORDER.includes(x.resource as (typeof RESOURCE_ORDER)[number]) &&
      number(x.amount),
  );

/** Validate imported nested state before simulation or rendering can consume it. */
export function validSave(value: unknown): value is GameState {
  if (!record(value)) return false;
  const s = value;
  if (!optional(s.playMode, (x) => x === 'guided' || x === 'classic')) return false;
  if (
    !optional(s.foreignPolicy, (value) => {
      if (
        !record(value) ||
        !Array.isArray(value.raids) ||
        !Array.isArray(value.ultimata) ||
        !Array.isArray(value.relations)
      )
        return false;
      if (value.raids.length > 12 || value.ultimata.length > 16 || value.relations.length > 64)
        return false;
      if (!unique(value.raids) || !unique(value.ultimata)) return false;
      if (
        !value.raids.every(
          (raid) =>
            named(raid) &&
            text(raid.factionId) &&
            text(raid.originCityId) &&
            ids(raid.memberIds) &&
            (raid.memberIds as unknown[]).length >= 2 &&
            (raid.memberIds as unknown[]).length <= 3 &&
            new Set(raid.memberIds as string[]).size === (raid.memberIds as unknown[]).length &&
            ['approaching', 'raiding', 'returning', 'ended'].includes(raid.phase as string) &&
            inventory(raid.resources) &&
            number(raid.startedAt, 0, s.time as number) &&
            point(raid.target) &&
            number(raid.progress, 0, 1.001) &&
            optional(raid.finishedAt, (time) =>
              number(time, raid.startedAt as number, s.time as number),
            ) &&
            optional(raid.engagedAt, (time) =>
              number(time, raid.startedAt as number, s.time as number),
            ),
        )
      )
        return false;
      if (
        !value.ultimata.every(
          (ultimatum) =>
            named(ultimatum) &&
            text(ultimatum.factionId) &&
            text(ultimatum.cityId) &&
            number(ultimatum.createdAt, 0, s.time as number) &&
            number(
              ultimatum.expiresAt,
              ultimatum.createdAt as number,
              (ultimatum.createdAt as number) + 3600,
            ) &&
            ['religious', 'tribute'].includes(ultimatum.kind as string) &&
            RESOURCE_ORDER.includes(ultimatum.resource as never) &&
            number(ultimatum.amount, Number.MIN_VALUE, 100) &&
            ['pending', 'dispatched', 'paid', 'refused', 'expired', 'cancelled'].includes(
              ultimatum.status as string,
            ) &&
            optional(ultimatum.dogmaTargetId, word) &&
            optional(ultimatum.paymentCaravanId, text) &&
            (ultimatum.status !== 'dispatched' || text(ultimatum.paymentCaravanId)),
        )
      )
        return false;
      if (
        !value.relations.every(
          (pair) =>
            record(pair) &&
            text(pair.leftId) &&
            text(pair.rightId) &&
            (pair.leftId as string) < (pair.rightId as string) &&
            number(pair.relation, -100, 100) &&
            flag(pair.atWar),
        )
      )
        return false;
      return (
        new Set(
          value.relations.map(
            (pair) => `${(pair as RecordValue).leftId}|${(pair as RecordValue).rightId}`,
          ),
        ).size === value.relations.length
      );
    })
  )
    return false;
  if (
    !optional(
      s.regionalRoutes,
      (routes) =>
        Array.isArray(routes) &&
        routes.length <= REGIONAL_ROUTE_LIMIT &&
        routes.every(regionalRoad) &&
        new Set(routes.map((route) => (route as RecordValue).key)).size === routes.length,
    )
  )
    return false;
  if (
    !optional(
      s.mapGeneration,
      (value) =>
        record(value) &&
        ['seed-zero', 'random'].includes(value.mode as string) &&
        number(value.seed, 0, 4294967295) &&
        Number.isInteger(value.seed) &&
        value.version === 1,
    )
  )
    return false;
  if (
    !optional(
      s.tribeEvents,
      (events) =>
        Array.isArray(events) &&
        events.length <= TRIBE_EVENT_LIMIT &&
        unique(events) &&
        events.every(
          (event) =>
            named(event) &&
            number(event.time) &&
            ['birth', 'death', 'word-lost'].includes(event.kind as string) &&
            optional(event.unitId, text) &&
            optional(event.parentIds, parents) &&
            optional(event.wordId, word) &&
            optional(event.cause, text) &&
            optional(event.combatSource, combatSource) &&
            (event.combatSource === undefined ||
              (event.kind === 'death' &&
                event.cause === 'V_03' &&
                (event.combatSource as RecordValue).time === event.time)) &&
            optional(event.wordIds, words) &&
            optional(event.lostWordIds, words) &&
            (event.kind !== 'birth' || (text(event.unitId) && parents(event.parentIds))) &&
            (event.kind !== 'death' || text(event.unitId)) &&
            (event.kind !== 'word-lost' || word(event.wordId)),
        ),
    )
  )
    return false;
  if (
    s.version !== 2 ||
    !number(s.time) ||
    !number(s.seed, 0, 4294967295) ||
    !number(s.revision) ||
    ![0, 1, 2, 3, 4, 5].includes(s.tier as number) ||
    ![1, 2, 4].includes(s.speed as number) ||
    !point(s.home) ||
    !inventory(s.resources) ||
    !number(s.voice, 0, 5) ||
    !number(s.voiceProgress, 0, 10) ||
    !number(s.cohesion, 0, 100) ||
    !number(s.attention, 0, 250)
  )
    return false;
  if (
    !optional(
      s.foodPriority,
      (v) =>
        record(v) &&
        ['S_01', 'S_02', 'S_03', 'S_04', 'S_05', 'S_06', 'S_07'].includes(v.subjectId as string) &&
        optional(v.unitId, text) &&
        (v.subjectId !== 'S_02' || text(v.unitId)),
    )
  )
    return false;
  if (
    [
      'started',
      'paused',
      'campfirePending',
      'milestone',
      'urbanized',
      'lockedSlot',
      'emancipated',
      'philosophy',
    ].some((k) => !flag(s[k]))
  )
    return false;
  if (
    [
      'units',
      'entities',
      'buildings',
      'sparks',
      'dogmas',
      'logs',
      'cities',
      'factions',
      'battalions',
      'caravans',
      'laws',
      'traditions',
      'sectors',
    ].some((k) => !unique(s[k]))
  )
    return false;
  if (
    !list(s.units, unit) ||
    !list(s.cities, city) ||
    !list(s.factions, faction) ||
    !list(s.dogmas, dogma) ||
    !list(s.traditions, tradition)
  )
    return false;
  if (
    !record(s.words) ||
    INNATE_WORDS.some((w) => !Object.hasOwn(s.words as RecordValue, w)) ||
    Object.entries(s.words).some(
      ([w, m]) =>
        !word(w) ||
        !record(m) ||
        !number(m.retention, 0, 100) ||
        !number(m.uses) ||
        !ids(m.custodians) ||
        !optional(m.learnedRecipe, (recipe) => validLearnedRecipe(w, recipe)),
    )
  )
    return false;
  if (
    !optional(
      s.bornWords,
      (value) =>
        record(value) &&
        Object.entries(value).every(([id, time]) => word(id) && number(time, 0, s.time as number)),
    )
  )
    return false;
  if (
    !list(
      s.entities,
      (v) =>
        named(v) &&
        point(v) &&
        number(v.amount) &&
        number(v.hp) &&
        number(v.maxHp) &&
        [
          'berries',
          'tree',
          'stone',
          'deer',
          'wolf',
          'alpha',
          'mammoth',
          'corpse',
          'ore',
          'seedling',
          'ground',
        ].includes(v.kind as string) &&
        (v.kind !== 'ground' ||
          RESOURCE_ORDER.includes(v.resource as (typeof RESOURCE_ORDER)[number])),
    )
  )
    return false;
  if (
    !list(
      s.buildings,
      (v) =>
        named(v) &&
        point(v) &&
        typeof v.kind === 'string' &&
        Object.hasOwn(BUILDING_SPECS, v.kind) &&
        number(v.hp) &&
        flag(v.active) &&
        optional(v.workerIds, ids) &&
        optional(v.productionMode, (mode) =>
          ['ingot', 'metalArms', 'coin'].includes(mode as string),
        ) &&
        optional(
          v.seasonWork,
          (x) =>
            record(x) &&
            Object.entries(x).every(
              ([season, work]) =>
                /^\d+$/.test(season) &&
                record(work) &&
                number(work.efficiencySeconds, 0, 90) &&
                record(work.workerSeconds) &&
                Object.values(work.workerSeconds).every((seconds) => number(seconds, 0, 90)) &&
                optional(
                  work.commandSeconds,
                  (commands) =>
                    record(commands) &&
                    Object.values(commands).every(
                      (signatures) =>
                        record(signatures) &&
                        Object.entries(signatures).every(
                          ([signature, seconds]) =>
                            words(signature.split('|')) && number(seconds, 0, 90),
                        ),
                    ),
                ),
            ),
        ),
    )
  )
    return false;
  if (
    !list(
      s.sparks,
      (v) =>
        named(v) &&
        word(v.wordId) &&
        text(v.unitId) &&
        words(v.recipe) &&
        text(v.hint) &&
        text(v.eventLabel) &&
        number(v.expiresAt),
    )
  )
    return false;
  if (
    !list(
      s.logs,
      (v) =>
        named(v) &&
        text(v.text) &&
        number(v.time) &&
        ['info', 'good', 'warning', 'danger', 'discovery'].includes(v.tone as string),
    )
  )
    return false;
  if (
    !list(
      s.battalions,
      (v) =>
        named(v) &&
        point(v) &&
        text(v.name) &&
        text(v.cityId) &&
        text(v.factionId) &&
        number(v.hp) &&
        number(v.maxHp, 1) &&
        number(v.morale) &&
        text(v.action) &&
        flag(v.catapult) &&
        number(v.occupation) &&
        optional(v.frontlineSageIds, ids) &&
        optional(
          v.lastSiegeShot,
          (shot) =>
            record(shot) &&
            number(shot.time, 0, s.time as number) &&
            text(shot.cityId) &&
            text(shot.wallId) &&
            number(shot.fromX, 0, 500) &&
            number(shot.fromY, 0, 500) &&
            number(shot.damage, Number.MIN_VALUE, 200),
        ) &&
        optional(v.target, target),
    )
  )
    return false;
  if (
    !list(
      s.caravans,
      (v) =>
        named(v) &&
        point(v) &&
        text(v.fromCityId) &&
        text(v.factionId) &&
        ['trade', 'tax', 'colonists', 'delegate'].includes(v.kind as string) &&
        inventory(v.resources) &&
        number(v.population) &&
        number(v.hp) &&
        target(v.target) &&
        optional(v.customsPaid, number) &&
        optional(v.customsRefused, flag) &&
        optional(
          v.delegateUnitId,
          (id) =>
            text(id) &&
            v.kind === 'delegate' &&
            v.population === 1 &&
            (s.units as unknown[]).some((unit) => record(unit) && unit.id === id),
        ) &&
        optional(v.words, words) &&
        optional(v.dogmas, (x) => list(x, dogma)),
    )
  )
    return false;
  const delegateIdentities = (s.caravans as Record<string, unknown>[])
    .map((caravan) => caravan.delegateUnitId)
    .filter((id) => id !== undefined);
  if (new Set(delegateIdentities).size !== delegateIdentities.length) return false;
  if (
    !list(
      s.laws,
      (v) =>
        named(v) &&
        text(v.name) &&
        words(v.tokens) &&
        (v.tokens as unknown[]).length === 6 &&
        ['subjectId', 'verbId', 'objectId', 'modifierId', 'sanctionId'].every((k) => word(v[k])) &&
        flag(v.prohibitive) &&
        number(v.age),
    )
  )
    return false;
  if (
    !list(
      s.sectors,
      (v) =>
        named(v) &&
        number(v.x, 0, 4) &&
        number(v.y, 0, 4) &&
        flag(v.explored) &&
        number(v.faunaCapacity) &&
        ['forest', 'plain', 'mountain', 'river'].includes(v.biome as string),
    ) ||
    (s.sectors as unknown[]).length !== 25 ||
    !list(s.explored, point)
  )
    return false;
  if (
    !record(s.stats) ||
    ['commands', 'discoveries', 'hunts', 'deaths', 'births', 'taught', 'seasonsSurvived'].some(
      (k) => !number((s.stats as RecordValue)[k]),
    )
  )
    return false;
  if (
    !record(s.victoryProgress) ||
    !number(s.victoryProgress.imperialSeasons) ||
    !record(s.disasters) ||
    ['storm', 'drought', 'blizzard', 'lightning'].some(
      (k) => !flag((s.disasters as RecordValue)[k]),
    ) ||
    !['tribe', 'monarchy', 'republic'].includes(s.government as string) ||
    ![null, 'imperial', 'cultural', 'philosophical'].includes(s.victory as null | string) ||
    !(s.gameOver === null || text(s.gameOver)) ||
    !(s.kingId === null || text(s.kingId))
  )
    return false;
  if (
    !number(s.inequality, 0, 100) ||
    !number(s.revoltTension, 0, 100) ||
    !number(s.corruption, 0, 1) ||
    !number(s.tierDeficitSeasons) ||
    !number(s.burntWood) ||
    !number(s.nightCount) ||
    !number(s.nightSleeping) ||
    !number(s.seasonIndex) ||
    !number(s.lastHunt, -Infinity) ||
    ['tension', 'cooldowns', 'eventTimes'].some((k) => !numericMap(s[k]))
  )
    return false;
  return true;
}
