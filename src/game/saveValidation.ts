import { BUILDING_SPECS, INNATE_WORDS, RESOURCE_ORDER, WORDS } from './content';
import type { GameState } from './types';

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
const point = (v: unknown) => record(v) && number(v.x, 0, 500) && number(v.y, 0, 500);
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
    number(v.assimilation.delegateCount)
  );
};
const unit = (v: unknown) =>
  named(v) &&
  point(v) &&
  text(v.name) &&
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
        !ids(m.custodians),
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
        optional(v.workerIds, ids),
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
        optional(v.words, words) &&
        optional(v.dogmas, (x) => list(x, dogma)),
    )
  )
    return false;
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
