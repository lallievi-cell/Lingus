import {
  BASE_HOUSING,
  BUILDING_SPECS,
  ELDER_AGE,
  INNATE_WORDS,
  RESOURCE_SPECS,
  SPEC_ASSUMPTIONS,
  WORDS,
} from './content';
import { rememberCombatWound } from './damageAttribution';
import { recordCaravanTravel } from './regionalHistory';
import { guidedBirthMultiplier } from './guidedProgression';
import {
  areFactionsHostile,
  completeForeignExpansion,
  dispatchForeignPolicy,
  takeForeignForgeWork,
} from './foreignPolicy';
import { newbornName, pairFertileUnits, recordTribeEvent } from './demography';
import {
  birthProbability,
  cognitiveTension,
  corruptionRate,
  effectiveDamage,
  mutualIntelligibility,
  resourceSpoilage,
} from './math';
import {
  activeUnits,
  adult,
  canPay,
  clamp,
  copy,
  distance,
  hasWord,
  log,
  nextId,
  pay,
  random,
  totalFood,
} from './runtime';
import {
  dogmaDiplomaticPenalty,
  forbiddenByDogma,
  getDogmaEffects,
  onDogmaticUse,
  protectedByDogma,
  resourcePreservationFloor,
  sanctuaryProtected,
} from './dogmas';
import {
  evaluateDiscoveries,
  killUnit,
  recordAttackTrauma,
  recordCraft,
  recordEvent,
} from './simulation';
import {
  imperialLawEffects,
  lawArchetype,
  lawSubjectMatches,
  recordLawWork,
  seasonalDutyFulfilled,
} from './imperialLawPolicy';
import {
  canInterceptCaravan,
  completeForeignMerchant,
  dispatchForeignMerchants,
  inspectForeignCustoms,
} from './foreignCommerce';
import type {
  Battalion,
  Building,
  BuildingKind,
  Caravan,
  City,
  Cohorts,
  Faction,
  GameState,
  Inventory,
  Law,
  Resource,
  Target,
  Tradition,
  Unit,
} from './types';
import {
  chooseDelegateIdentity,
  departDelegateIdentity,
  settleDelegateIdentity,
  strandDelegateIdentity,
  synchronizeDelegateIdentities,
  travellingDelegate,
} from './delegateIdentity';

/** These parameters are deliberately explicit: the source gives no prices or AI policy. */
export const IMPERIAL_ASSUMPTIONS = {
  barterRatio: 1,
  coinPrice: { ingot: 100, food: 1, slave: 100 },
  extractionPerWorkerCycle: 1,
  extractionCycleSeconds: 2,
  delegationSize: 1,
  foreignRecruitmentMinimum: 20,
  cohortAdultShare: 1,
  militaryStrength: 7,
  foreignRepresentativeIntelligence: 5,
  firstGiftUnits: 1,
  firstGiftContactWeight: 100,
  fiscalValuePerBondedCitizen: 100,
  recruitmentCooldownSeconds: 10,
  frontlineCallRadiusMetres: 15,
  peacefulDelegationRelation: 30,
  maximumLivingUrbanIdentities: 200,
} as const;

const PLAYER = 'player';
const RESOURCES: Resource[] = [
  'food',
  'meat',
  'cooked',
  'wood',
  'stone',
  'pelt',
  'seed',
  'ore',
  'ingot',
  'tool',
  'spear',
  'pottery',
  'metalArms',
  'coin',
];
const FOOD: Resource[] = ['cooked', 'meat', 'food'];
const INCENTIVES = ['M_05', 'M_04', 'S_03', 'S_04'];
const SANCTIONS = ['O_06', 'S_06', 'V_03', 'O_12', 'O_11', 'O_10', 'M_03', 'O_05', ...INCENTIVES];
const known = (s: GameState) => Object.keys(s.words).filter((w) => hasWord(s, w));
const emptyInventory = (): Inventory =>
  Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Inventory;
const ownCities = (s: GameState) => s.cities.filter((c) => c.factionId === PLAYER);
const playerHas = (s: GameState, kind: BuildingKind) =>
  s.buildings.some(
    (b) =>
      b.kind === kind &&
      b.hp > 0 &&
      b.active &&
      b.completed !== false &&
      (!b.cityId || s.cities.some((c) => c.id === b.cityId && c.factionId === PLAYER)),
  );
const cityBuildings = (s: GameState, c: City) =>
  s.buildings.filter((b) => b.cityId === c.id && b.hp > 0 && b.completed !== false);
const cityHas = (s: GameState, c: City, k: BuildingKind) =>
  cityBuildings(s, c).some((b) => b.kind === k && b.active);
const capital = (s: GameState) => ownCities(s).find((c) => c.capital) ?? ownCities(s)[0];
const phase = (s: GameState) => ({ season: Math.floor(s.time / 90) % 4, night: s.time % 90 >= 60 });
const endedSeason = (s: GameState) => (phase(s).season + 3) % 4;
export const cityPopulation = (c: City) =>
  c.cohorts.workers + c.cohorts.warriors + c.cohorts.sages + c.cohorts.slaves;
export const playerPopulation = (s: GameState) =>
  s.urbanized
    ? ownCities(s).reduce((n, c) => n + cityPopulation(c), 0) +
      s.battalions
        .filter((b) => b.factionId === PLAYER)
        .reduce((n, b) => n + Math.max(0, b.hp) / 100, 0) +
      s.caravans
        .filter(
          (c) =>
            c.factionId === PLAYER &&
            ['colonists', 'delegate'].includes(c.kind) &&
            !c.arrived &&
            c.hp > 0,
        )
        .reduce((n, c) => n + c.population, 0)
    : activeUnits(s).length;
export const getIntelligibility = (s: GameState, words: Iterable<string>) =>
  mutualIntelligibility(known(s), words);

function inventoryFor(s: GameState, c?: City): Inventory {
  return !c || c.capital ? s.resources : c.resources;
}
function bindCapital(s: GameState) {
  const c = capital(s);
  if (c) c.resources = s.resources;
}
function addLog(
  s: GameState,
  message: string,
  tone: 'info' | 'good' | 'warning' | 'danger' | 'discovery' = 'info',
) {
  log(s, message, tone);
}
function foodCost(r: Inventory, quantity: number): boolean {
  return totalFood(r) + 1e-9 >= quantity;
}
function takeFood(r: Inventory, quantity: number): number {
  let need = quantity;
  for (const key of FOOD) {
    const n = Math.min(r[key], need);
    r[key] -= n;
    need -= n;
    if (need <= 1e-9) break;
  }
  return quantity - need;
}
function consumeNutrition(r: Inventory, hunger: number): number {
  let need = hunger;
  for (const key of FOOD) {
    const nutrition = RESOURCE_SPECS[key].nutrition,
      n = Math.min(r[key], need / nutrition);
    r[key] -= n;
    need -= n * nutrition;
    if (need <= 1e-9) break;
  }
  return hunger - need;
}
function resourceFromTokens(tokens: string[]): Resource {
  if (tokens.includes('O_12')) return 'coin';
  if (tokens.includes('O_07')) return 'ingot';
  if (tokens.includes('O_02')) return 'stone';
  if (tokens.includes('O_03')) return 'wood';
  return 'food';
}
function removePopulation(c: City, amount: number): number {
  let left = amount;
  for (const k of ['workers', 'slaves', 'warriors', 'sages'] as const) {
    const removed = Math.min(c.cohorts[k], left);
    c.cohorts[k] -= removed;
    left -= removed;
    if (left <= 0) break;
  }
  return amount - left;
}
function changePopulation(c: City, amount: number, cohort: keyof Cohorts) {
  c.cohorts[cohort] = Math.max(0, c.cohorts[cohort] + amount);
}
/** Materials stay local; a player city's monetary expenses use the sole imperial treasury. */
function canPayCity(s: GameState, c: City, cost: Partial<Inventory>) {
  return Object.entries(cost).every(
    ([r, n]) =>
      (r === 'coin' && c.factionId === PLAYER
        ? s.resources.coin
        : inventoryFor(s, c)[r as Resource]) +
        1e-9 >=
      n,
  );
}
function payCity(s: GameState, c: City, cost: Partial<Inventory>) {
  for (const [r, n] of Object.entries(cost)) {
    const inv = r === 'coin' && c.factionId === PLAYER ? s.resources : inventoryFor(s, c);
    inv[r as Resource] -= n;
  }
}
function findCity(s: GameState, target?: Target, foreign = false): City | undefined {
  const explicit = target?.type === 'city' ? s.cities.find((c) => c.id === target.id) : undefined;
  if (explicit) return explicit;
  const pool = foreign ? s.cities.filter((c) => c.factionId !== PLAYER) : ownCities(s);
  if (target) return pool.slice().sort((a, b) => distance(a, target) - distance(b, target))[0];
  return foreign ? pool[0] : capital(s);
}
function moveTo(
  point: { x: number; y: number },
  target: { x: number; y: number },
  speed: number,
  dt: number,
): boolean {
  const d = distance(point, target),
    step = speed * dt;
  if (d <= step) {
    point.x = target.x;
    point.y = target.y;
    return true;
  }
  point.x += ((target.x - point.x) / d) * step;
  point.y += ((target.y - point.y) / d) * step;
  return false;
}

export function condenseCities(s: GameState) {
  if (s.urbanized || !hasWord(s, 'S_09') || activeUnits(s).length < 150) return;
  const cohorts: Cohorts = { workers: 0, warriors: 0, sages: 0, slaves: 0 };
  const home = s.home;
  for (const u of activeUnits(s)) {
    const cohort =
      u.caste === 'slave'
        ? 'slaves'
        : u.strength >= 7 && adult(u)
          ? 'warriors'
          : u.intelligence >= 7 && adult(u)
            ? 'sages'
            : 'workers';
    cohorts[cohort]++;
    // Condensation assigns the same real person to their new macro-role.
    // Later identities retain that counted role until an explicit transfer.
    u.caste =
      cohort === 'slaves'
        ? 'slave'
        : cohort === 'warriors'
          ? 'warrior'
          : cohort === 'sages'
            ? 'sage'
            : 'citizen';
  }
  const c: City = {
    id: nextId(s, 'city'),
    name: 'La Capitale',
    x: home.x,
    y: home.y,
    sectorX: Math.floor(home.x / 100),
    sectorY: Math.floor(home.y / 100),
    factionId: PLAYER,
    cohorts,
    resources: s.resources,
    words: known(s),
    dogmas: copy(s.dogmas),
    revoltTension: s.revoltTension,
    housing: Math.max(
      BASE_HOUSING,
      s.buildings
        .filter((b) => b.hp > 0)
        .reduce((n, b) => n + (BUILDING_SPECS[b.kind].housing ?? 0), BASE_HOUSING),
    ),
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { delegateCount: 0, active: false },
    production: emptyInventory(),
    capital: true,
    garrisonHp: cohorts.warriors * 100,
    occupation: 0,
    foundedAt: s.time,
  };
  s.cities.push(c);
  for (const b of s.buildings.filter((b) => !b.cityId)) {
    b.cityId = c.id;
    c.buildingIds.push(b.id);
  }
  for (const u of activeUnits(s)) {
    u.cityId = c.id;
    u.action = 'idle';
    u.command = undefined;
    u.jobBuildingId = undefined;
  }
  const sector = s.sectors.find((z) => z.x === c.sectorX && z.y === c.sectorY);
  if (sector) sector.cityId = c.id;
  s.urbanized = true;
  addLog(
    s,
    'La comunità raggiunge centocinquanta abitanti. Ora puoi governare intere città e i loro gruppi sociali.',
    'discovery',
  );
  allocateCityWorkers(s, c);
}

function buildingSelector(s: GameState, c: City, b: Building) {
  const scoped = doctrineFor(s, c.factionId, c),
    spec = BUILDING_SPECS[b.kind];
  const monopolies = scoped.dogmas.filter(
    (d) =>
      d.vectorId.startsWith('S_') &&
      d.vectorId !== 'S_01' &&
      (spec.recipe.includes(d.targetId) || (d.targetId === 'O_05' && b.kind === 'foundry')),
  );
  const selectors = [...new Set(monopolies.map((d) => d.vectorId))];
  if (selectors.length > 1) return 'unavailable';
  return (
    selectors[0] ??
    (spec.workerKind === 'sage' ? 'S_04' : spec.workerKind === 'warrior' ? 'S_03' : 'S_01')
  );
}
/** Named children remain in population counts, but cannot supply a worker slot. */
function workingCityCohorts(s: GameState, c: City): Cohorts {
  const pools = { ...c.cohorts };
  for (const unit of s.units.filter((u) => u.hp > 0 && u.cityId === c.id && !adult(u))) {
    const cohort = unitCohort(unit);
    pools[cohort] = Math.max(0, pools[cohort] - 1);
  }
  return pools;
}

export function allocateCityWorkers(s: GameState, c: City) {
  const buildings = cityBuildings(s, c),
    vocation = c.vocations.flatMap((v) => v.tokens);
  const pools = workingCityCohorts(s, c);
  pools.sages = Math.max(
    0,
    pools.sages -
      activeUnits(s).filter(
        (u) =>
          u.cityId === c.id &&
          unitCohort(u) === 'sages' &&
          ['frontline', 'frontline-returning'].includes(u.action),
      ).length,
  );
  // Cohort workers and named monopolists share the same finite residents.
  // Reserve represented identities even when an ordinary cohort takes a slot,
  // so an individual or royal monopoly cannot reuse them in another building.
  const residents = activeUnits(s).filter(
    (u) =>
      u.cityId === c.id && adult(u) && !['frontline', 'frontline-returning'].includes(u.action),
  );
  const reserved = new Set<string>();
  const takeCohort = (cohort: keyof Cohorts, slots: number) => {
    const count = Math.min(slots, pools[cohort]);
    pools[cohort] -= count;
    for (const u of residents
      .filter((u) => unitCohort(u) === cohort && !reserved.has(u.id))
      .slice(0, Math.floor(count)))
      reserved.add(u.id);
    return count;
  };
  const primary = vocation.includes('V_09')
    ? 'farm'
    : vocation.includes('V_12')
      ? 'foundry'
      : vocation.includes('V_11')
        ? 'market'
        : vocation.includes('O_09')
          ? 'archive'
          : null;
  const ordered = buildings
    .slice()
    .sort((a, b) => Number(b.kind === primary) - Number(a.kind === primary));
  const grainWorkers =
    primary === 'farm' ? Math.floor((pools.workers + pools.slaves) * 0.8) : Infinity;
  let primaryAllocated = 0;
  for (const b of ordered) {
    const spec = BUILDING_SPECS[b.kind];
    const previouslyReserved = new Set(reserved);
    b.workerIds = [];
    if (!b.active) {
      b.lastEfficiency = 0;
      continue;
    }
    if (spec.workers === 0) {
      b.lastEfficiency = 1;
      continue;
    }
    let slots = spec.workers,
      weighted = 0;
    const selector = buildingSelector(s, c, b);
    if (['unavailable', 'S_05', 'S_08'].includes(selector)) {
      b.lastEfficiency = 0;
      continue;
    }
    if (selector === 'S_04') {
      weighted = takeCohort('sages', slots);
    } else if (selector === 'S_03') {
      weighted = takeCohort('warriors', slots);
    } else if (selector === 'S_06') {
      weighted = takeCohort('slaves', slots) * 1.2;
    } else if (['S_02', 'S_07'].includes(selector)) {
      const people = residents.filter(
        (u) => (selector !== 'S_07' || u.id === s.kingId) && u.age >= 4 && !reserved.has(u.id),
      );
      let assigned = 0;
      for (const u of people) {
        if (assigned >= slots) break;
        const cohort = unitCohort(u);
        if (pools[cohort] < 1) continue;
        pools[cohort]--;
        reserved.add(u.id);
        assigned++;
        weighted += cohort === 'slaves' ? 1.2 : 1;
      }
    } else {
      if (b.kind === 'farm' && primary === 'farm')
        slots = Math.min(slots, Math.max(0, grainWorkers - primaryAllocated));
      const slaves = takeCohort('slaves', slots);
      slots -= slaves;
      weighted = slaves * 1.2;
      const workers = takeCohort('workers', slots);
      slots -= workers;
      weighted += workers;
      primaryAllocated += b.kind === 'farm' ? slaves + workers : 0;
    }
    b.lastEfficiency = Math.min(1.2, weighted / spec.workers);
    b.workerIds = residents
      .filter((u) => adult(u) && reserved.has(u.id) && !previouslyReserved.has(u.id))
      .map((u) => u.id);
  }
}
export function cityBuildingEfficiency(s: GameState, c: City, kind: BuildingKind) {
  return cityBuildings(s, c)
    .filter((b) => b.kind === kind && b.active)
    .reduce((n, b) => n + (b.lastEfficiency ?? 0), 0);
}

function cityCapacity(s: GameState, c: City, r: Resource): number {
  if (r === 'coin') return Infinity;
  const food = RESOURCE_SPECS[r].category === 'food';
  const b = cityBuildings(s, c);
  const stores = b.filter((z) => z.kind === (food ? 'storage' : 'depot')).length;
  if (stores) return stores * (food ? 200 : 500);
  return Math.max(
    0,
    30 -
      RESOURCES.filter(
        (k) => k !== 'coin' && RESOURCE_SPECS[k].category !== RESOURCE_SPECS[r].category,
      ).reduce((n, k) => n + inventoryFor(s, c)[k], 0),
  );
}
function addCityResource(s: GameState, c: City, r: Resource, amount: number): number {
  const inv = r === 'coin' && c.factionId === PLAYER ? s.resources : inventoryFor(s, c),
    category = RESOURCE_SPECS[r].category,
    total = RESOURCES.filter((k) => RESOURCE_SPECS[k].category === category).reduce(
      (n, k) => n + inv[k],
      0,
    ),
    room = r === 'coin' ? Infinity : Math.max(0, cityCapacity(s, c, r) - total);
  const n = Math.min(room, Math.max(0, amount));
  inv[r] += n;
  c.production[r] += n;
  return n;
}
function cityConstruction(
  s: GameState,
  c: City,
  tokens: string[],
): { valid: boolean; message: string } {
  let kind: BuildingKind | undefined;
  const tail = tokens.slice(2);
  if (tail.includes('O_02') && tail.includes('O_01')) kind = 'house';
  else if (tail.includes('O_03') && tail.includes('O_01')) kind = 'hut';
  else if (tail.includes('O_03') && tail.includes('M_01')) kind = 'palisade';
  else if (tail.includes('O_02') && tail.includes('O_06')) kind = 'grave';
  else if (tail.includes('O_02') && tail.includes('M_03')) kind = 'temple';
  else if (tail.includes('O_02') && tail.includes('O_10')) kind = 'walls';
  else if (tail.includes('O_02') && tail.includes('O_09')) kind = 'archive';
  else if (tail.includes('O_02') && tail.includes('S_07')) kind = 'palace';
  else if (tail.includes('O_12') && tail.includes('V_11')) kind = 'market';
  else if (tail.includes('O_02') && tail.includes('O_14')) kind = 'court';
  else if (tail.includes('O_02') && tail.includes('S_04')) kind = 'school';
  else if (tail.includes('O_13') && tail.includes('O_01')) kind = 'workshop';
  if (!kind) return { valid: false, message: 'La frase non identifica un edificio urbano.' };
  const spec = BUILDING_SPECS[kind],
    quantity = kind === 'house' ? 4 : 1;
  if (spec.unique && cityBuildings(s, c).some((b) => b.kind === kind))
    return { valid: false, message: `${spec.label} è già presente in questa città.` };
  const cost = Object.fromEntries(
    Object.entries(spec.cost).map(([key, n]) => [key, n * quantity]),
  ) as Partial<Inventory>;
  if (!canPayCity(s, c, cost))
    return { valid: false, message: `La città non possiede i materiali per ${spec.label}.` };
  if (cityPopulation(c) <= 0)
    return { valid: false, message: 'La città non ha abitanti in grado di costruire.' };
  payCity(s, c, cost);
  for (let i = 0; i < quantity; i++) {
    const b: Building = {
      id: nextId(s, 'building'),
      kind,
      x: c.x + (i % 2) * 3,
      y: c.y + Math.floor(i / 2) * 3,
      hp: spec.maxHp,
      active: true,
      completed: true,
      cityId: c.id,
      workerIds: [],
    };
    s.buildings.push(b);
    c.buildingIds.push(b.id);
    c.housing += spec.housing ?? 0;
  }
  allocateCityWorkers(s, c);
  recordLawWork(s, c.id, tokens, quantity);
  return {
    valid: true,
    message:
      quantity === 4
        ? 'Quattro case in muratura: 80 unità di pietra e 40 di legno, per ospitare altre 48 persone.'
        : `${spec.label} sorge a ${c.name}.`,
  };
}

const traditionCap = (s: GameState) => (s.tier >= 5 ? 8 : s.tier === 4 ? 5 : s.tier === 3 ? 3 : 0);
export function registerTradition(state: GameState, tokens: string[], target?: Target): GameState {
  const s = copy(state),
    city = tokens.includes('S_09') ? findCity(s, target) : undefined;
  const restriction = forbiddenByDogma(s, tokens, target);
  if (restriction) {
    log(s, restriction, 'warning');
    return s;
  }
  if (!['C_01', 'C_02'].includes(tokens[0]) || tokens.some((w) => !hasWord(s, w))) {
    log(s, 'La tradizione richiede una condizione e parole conosciute.', 'warning');
    return s;
  }
  if (city && tokens[1] === 'S_09') {
    const valid =
      (tokens[2] === 'V_09' && tokens[3] === 'O_04') ||
      (tokens[2] === 'V_12' && tokens[3] === 'O_07') ||
      (tokens[2] === 'V_11' && tokens[3] === 'O_12') ||
      (tokens[2] === 'V_05' && tokens[3] === 'O_09');
    if (!valid) {
      log(s, 'Questa frase non descrive una vocazione cittadina.', 'warning');
      return s;
    }
    if (city.factionId !== PLAYER || city.vocations.length >= 2) {
      log(s, 'Ogni tua città può custodire due vocazioni.', 'warning');
      return s;
    }
    if (city.vocations.some((v) => v.tokens.join('|') === tokens.join('|'))) return s;
    const tr: Tradition = {
      id: nextId(s, 'vocation'),
      tokens: [...tokens],
      target: { type: 'city', id: city.id, x: city.x, y: city.y },
      createdAt: s.time,
      name:
        tokens[2] === 'V_09'
          ? 'Granaio dell’Impero'
          : tokens[2] === 'V_12'
            ? 'Polo siderurgico'
            : tokens[2] === 'V_11'
              ? 'Emporio'
              : 'Città universitaria',
    };
    city.vocations.push(tr);
    allocateCityWorkers(s, city);
    log(s, `${city.name}: ${tr.name}.`, 'good');
    return s;
  }
  if (s.traditions.length >= traditionCap(s)) {
    log(s, 'Hai già stabilito tutte le tradizioni consentite in questa epoca.', 'warning');
    return s;
  }
  if (
    s.traditions.some((t) => t.tokens.join('|') === tokens.join('|') && t.target?.id === target?.id)
  )
    return s;
  s.traditions.push({
    id: nextId(s, 'tradition'),
    tokens: [...tokens],
    target: target ? copy(target) : undefined,
    subjectId: tokens[1],
    createdAt: s.time,
    name: tokens.map((t) => WORDS[t]?.label ?? t).join(' · '),
  });
  log(s, 'La frase diventa un lavoro tramandato, senza consumare altra voce.', 'good');
  return s;
}
export function removeTradition(state: GameState, id: string): GameState {
  const s = copy(state);
  s.traditions = s.traditions.filter((t) => t.id !== id);
  for (const c of s.cities) c.vocations = c.vocations.filter((v) => v.id !== id);
  return s;
}

function lawName(tokens: string[]): string {
  return tokens.map((t) => WORDS[t]?.label ?? t).join(' · ');
}
export function inscribeLaw(state: GameState, tokens: string[]): GameState {
  const s = copy(state),
    limit = s.tier >= 5 ? 6 : s.tier >= 4 ? 3 : 0;
  if (
    tokens.length !== 6 ||
    tokens[4] !== 'C_03' ||
    !tokens[0].startsWith('S_') ||
    !tokens[1].startsWith('V_') ||
    !SANCTIONS.includes(tokens[5]) ||
    tokens.some((w) => !hasWord(s, w))
  ) {
    log(
      s,
      'La legge richiede sei parole: soggetto, azione, oggetto, misura, Altrimenti, sanzione.',
      'warning',
    );
    return s;
  }
  if (!playerHas(s, 'palace') || !hasWord(s, 'C_03') || !limit) {
    log(s, 'Serve un Palazzo Reale e il pensiero giuridico dell’Età del Bronzo.', 'warning');
    return s;
  }
  if (s.laws.length >= limit) {
    log(s, 'Il Palazzo non può custodire altre leggi in questa epoca.', 'warning');
    return s;
  }
  if (s.laws.some((l) => l.tokens.join('|') === tokens.join('|'))) return s;
  const law: Law = {
    id: nextId(s, 'law'),
    tokens: [...tokens],
    name: lawName(tokens),
    subjectId: tokens[0],
    verbId: tokens[1],
    objectId: tokens[2],
    modifierId: tokens[3],
    sanctionId: tokens[5],
    prohibitive: tokens[3] === 'M_01',
    age: 0,
    description:
      tokens[3] === 'M_01'
        ? 'L’azione è un reato: il Tribunale applicherà la sanzione.'
        : 'Un dovere stagionale; Altrimenti stabilisce la sanzione o il premio.',
  };
  s.laws.push(law);
  const enacted = lawArchetype(law);
  if (enacted === 'slave_protection') {
    s.revoltTension = clamp(s.revoltTension - 15);
    for (const c of ownCities(s)) c.revoltTension = clamp(c.revoltTension - 15);
  }
  if (enacted === 'inquisition') {
    s.cohesion = clamp(s.cohesion * 1.25);
    for (const d of s.dogmas) d.reforming = false;
    s.philosophy = false;
  }
  for (const d of s.dogmas) {
    if (!tokens.slice(0, 4).includes(d.targetId)) continue;
    if (law.prohibitive && d.vectorId === 'M_01') {
      s.revoltTension = clamp(s.revoltTension - 20);
      s.cohesion = 100;
      s.corruption = 0;
    } else if (law.prohibitive && ['C_02', 'O_01', 'S_01'].includes(d.vectorId)) {
      s.revoltTension = clamp(s.revoltTension + d.weight * 0.5);
      log(s, `Scisma: la legge punisce ciò che « ${d.name} » santifica.`, 'danger');
    }
  }
  log(s, 'Una nuova legge è incisa nel Palazzo Reale.', 'good');
  return s;
}
export function removeLaw(state: GameState, id: string): GameState {
  const s = copy(state);
  s.laws = s.laws.filter((l) => l.id !== id);
  return s;
}

function unitCohort(u: Unit): keyof Cohorts {
  if (u.caste === 'slave') return 'slaves';
  if (u.caste === 'citizen') return 'workers';
  if (u.caste === 'warrior') return 'warriors';
  if (u.caste === 'sage') return 'sages';
  if (!adult(u)) return 'workers';
  return u.strength >= 7 ? 'warriors' : u.intelligence >= 7 ? 'sages' : 'workers';
}
function removeCustodian(s: GameState, u: Unit) {
  for (const [id, m] of Object.entries(s.words)) {
    if (!m.custodians.includes(u.id)) continue;
    if (WORDS[id].tier > 0) m.retention *= 1 - 1 / m.custodians.length;
    m.custodians = m.custodians.filter((id) => id !== u.id);
  }
}
function exile(s: GameState, u: Unit) {
  const previous = s.cities.find((c) => c.id === u.cityId);
  if (previous) changePopulation(previous, -1, unitCohort(u));
  removeCustodian(s, u);
  const faction = s.factions[0];
  u.factionId = faction?.id ?? 'exile';
  u.cityId = undefined;
  u.action = 'moving';
  u.tx = 15;
  u.ty = 15;
  u.command = undefined;
  if (faction) faction.words = [...new Set([...faction.words, ...u.knows])];
  s.revoltTension = 0;
}
function killByLaw(s: GameState, u: Unit) {
  if (u.hp <= 0 || protectedByDogma(s, u.caste === 'slave' ? 'S_06' : 'S_02', u)) return;
  killUnit(s, u, 'O_14');
}
export function applySanction(s: GameState, law: Law, unit?: Unit, city?: City, fulfilled = false) {
  const targetCity =
      city ?? (unit?.cityId ? s.cities.find((c) => c.id === unit.cityId) : undefined),
    inv = targetCity ? inventoryFor(s, targetCity) : s.resources;
  if (INCENTIVES.includes(law.sanctionId)) {
    if (!fulfilled) return;
    const counter = `lawful:${law.id}:${unit?.id ?? targetCity?.id ?? 'none'}`,
      seasons = (s.eventTimes[counter] ?? 0) + 1;
    s.eventTimes[counter] = seasons;
    if (unit) unit.lawfulSeasons = Math.max(unit.lawfulSeasons ?? 0, seasons);
    else if (targetCity)
      targetCity.lawfulSeasons = Math.max(targetCity.lawfulSeasons ?? 0, seasons);
    if (law.sanctionId === 'M_05' && seasons >= 10 && !getDogmaEffects(s).emancipationForbidden) {
      if (unit) {
        if (targetCity && unit.caste === 'slave') {
          targetCity.cohorts.slaves = Math.max(0, targetCity.cohorts.slaves - 1);
          targetCity.cohorts.workers++;
        }
        unit.caste = 'citizen';
        unit.emancipated = true;
      } else if (targetCity) {
        targetCity.cohorts.workers += targetCity.cohorts.slaves;
        targetCity.cohorts.slaves = 0;
        targetCity.revoltTension *= 0.5;
      }
      s.revoltTension *= 0.5;
    }
    if (law.sanctionId === 'M_04') {
      if (unit) {
        unit.wealth = (unit.wealth ?? 0) + 1;
        unit.lastEventAt ??= {};
        unit.lastEventAt.LAW_PRIVATE_BONUS = 1;
      }
      s.inequality = clamp(s.inequality + 0.5);
    }
    if (law.sanctionId === 'S_03' || law.sanctionId === 'S_04') {
      if (unit) {
        if (targetCity) changePopulation(targetCity, -1, unitCohort(unit));
        unit.caste = law.sanctionId === 'S_03' ? 'warrior' : 'sage';
        if (law.sanctionId === 'S_03') unit.strength = Math.max(7, unit.strength);
        else unit.intelligence = Math.max(7, unit.intelligence);
        if (targetCity)
          changePopulation(targetCity, 1, unit.caste === 'warrior' ? 'warriors' : 'sages');
      } else if (targetCity && targetCity.cohorts.workers > 0) {
        targetCity.cohorts.workers--;
        targetCity.cohorts[law.sanctionId === 'S_03' ? 'warriors' : 'sages']++;
      }
      s.inequality = clamp(s.inequality - 15);
    }
    return;
  }
  if (fulfilled) return;
  switch (law.sanctionId) {
    case 'O_05':
    case 'O_06':
      if (unit) killByLaw(s, unit);
      else if (targetCity) removePopulation(targetCity, 1);
      s.revoltTension = clamp(s.revoltTension + 5);
      break;
    case 'S_06':
      if (getDogmaEffects(s).slaveryForbidden) break;
      if (unit) {
        if (targetCity) changePopulation(targetCity, -1, unitCohort(unit));
        unit.caste = 'slave';
        removeCustodian(s, unit);
        if (targetCity) targetCity.cohorts.slaves++;
      } else if (targetCity && targetCity.cohorts.workers > 0) {
        const citizen = activeUnits(s).find(
          (u) => u.cityId === targetCity.id && unitCohort(u) === 'workers',
        );
        targetCity.cohorts.workers--;
        targetCity.cohorts.slaves++;
        if (citizen) {
          citizen.caste = 'slave';
          removeCustodian(s, citizen);
        }
      }
      s.revoltTension = clamp(s.revoltTension + 10);
      break;
    case 'V_03':
      if (unit) {
        unit.hp = Math.max(1, unit.hp - 40);
        unit.lastEventAt ??= {};
        unit.lastEventAt.LAW_PRODUCTIVITY_UNTIL = s.time + 90;
      }
      s.cohesion = clamp(s.cohesion - 2);
      break;
    case 'O_12': {
      const amount = Math.min(50, unit ? (unit.wealth ?? 0) : inv.coin);
      if (unit) unit.wealth = (unit.wealth ?? 0) - amount;
      else inv.coin -= amount;
      s.resources.coin += amount;
      s.inequality = clamp(s.inequality - 2);
      break;
    }
    case 'O_11': {
      if (targetCity && !targetCity.capital) {
        const cap = capital(s),
          load = emptyInventory();
        if (!cap) break;
        for (const r of RESOURCES.filter(
          (r) => RESOURCE_SPECS[r].category === 'material' || r === 'meat',
        )) {
          load[r] = inv[r] * 0.5;
          inv[r] -= load[r];
        }
        if (Object.values(load).some((n) => n > 0))
          makeCaravan(s, 'tax', targetCity, { type: 'city', id: cap.id, x: cap.x, y: cap.y }, load);
      } else if (unit) {
        if (
          unit.carry &&
          (RESOURCE_SPECS[unit.carry.resource].category === 'material' ||
            unit.carry.resource === 'meat')
        ) {
          const resource = unit.carry.resource,
            amount = unit.carry.amount * 0.5;
          unit.carry.amount -= amount;
          s.entities.push({
            id: nextId(s, 'confiscated'),
            kind: 'ground',
            resource,
            x: unit.x,
            y: unit.y,
            amount,
            hp: 0,
            maxHp: 1,
            factionId: PLAYER,
          });
        }
      }
      break;
    }
    case 'O_10':
      if (unit) exile(s, unit);
      else if (targetCity) {
        const faction = s.factions[0]?.id ?? 'exile';
        targetCity.factionId = faction;
        targetCity.revoltTension = 0;
      }
      s.revoltTension = 0;
      break;
    case 'M_03':
      if (unit) unit.factionId = 'pariah';
      s.cohesion = clamp(s.cohesion + 10);
      break;
  }
  if (targetCity)
    targetCity.revoltTension = clamp(
      targetCity.revoltTension +
        (law.sanctionId === 'S_06' ? 10 : ['O_06', 'O_05'].includes(law.sanctionId) ? 5 : 0),
    );
}
/** Guards apply penalties to the actual offender; doctrine remains the higher-priority constraint. */
export function enforceActionLaws(
  s: GameState,
  tokens: string[],
  target?: Target,
  selectedIds?: string[],
): boolean {
  const p = ['C_01', 'C_02'].includes(tokens[0]) ? tokens.slice(1) : tokens;
  const victim = target?.type === 'unit' ? s.units.find((u) => u.id === target.id) : undefined;
  const touches = (l: Law) =>
    p.slice(2).includes(l.objectId) ||
    (l.objectId === 'C_01' && phase(s).night) ||
    (l.objectId === 'S_05' &&
      ((victim?.factionId && victim.factionId !== PLAYER) ||
        (target?.type === 'city' &&
          s.cities.find((c) => c.id === target.id)?.factionId !== PLAYER))) ||
    (l.objectId === 'S_06' && victim?.caste === 'slave') ||
    (l.objectId === 'S_02' && !!victim) ||
    (l.objectId === 'S_01' && victim?.factionId === PLAYER);
  const laws = s.laws.filter(
    (l) =>
      l.prohibitive &&
      l.verbId === p[1] &&
      touches(l) &&
      // These two laws punish actual injury or a completed killing. Applying
      // the generic pre-action sanction would prevent their specified event.
      !(
        victim &&
        (victim.factionId === undefined || victim.factionId === PLAYER) &&
        ['retaliation', 'murder'].includes(lawArchetype(l))
      ),
  );
  if (!laws.length || !playerHas(s, 'court')) return true;
  let blocked = false;
  const subjects: (Unit | City | Battalion)[] =
    p[0] === 'S_08'
      ? s.battalions.filter((b) => b.factionId === PLAYER && b.hp > 0)
      : p[0] === 'S_09'
        ? ownCities(s)
        : s.units.filter((u) => u.hp > 0);
  const selected = selectedIds?.length
    ? subjects.filter((u) => selectedIds.includes(u.id))
    : p[0] === 'S_09'
      ? [capital(s)].filter((c): c is City => !!c)
      : subjects.filter((u) => lawSubjectMatches(s, { subjectId: p[0] }, u));
  for (const law of laws) {
    const offenders = selected.filter((u) => lawSubjectMatches(s, law, u));
    if (!offenders.length) continue;
    for (const offender of offenders) {
      if ('cohorts' in offender) applySanction(s, law, undefined, offender);
      else if ('maxHp' in offender) {
        if (['O_06', 'O_05'].includes(law.sanctionId)) {
          const before = offender.hp;
          offender.hp = Math.max(0, offender.hp - 100);
          loseSoldiers(s, offender, before);
          s.revoltTension = clamp(s.revoltTension + 5);
        } else if (law.sanctionId === 'V_03') {
          offender.hp = Math.max(1, offender.hp - 40);
          offender.morale *= 1.2;
          s.cohesion = clamp(s.cohesion - 2);
        }
      } else applySanction(s, law, offender);
    }
    blocked = true;
    log(s, 'Il Tribunale applica la sanzione al soggetto previsto dal codice.', 'warning');
  }
  return !blocked;
}

function makeCaravan(
  s: GameState,
  kind: Caravan['kind'],
  from: City | undefined,
  to: Target,
  resources: Inventory,
  population = 0,
): Caravan {
  const origin = from ?? { x: s.home.x, y: s.home.y, id: 'village' };
  const caravan: Caravan = {
    id: nextId(s, 'caravan'),
    kind,
    x: origin.x,
    y: origin.y,
    fromCityId: origin.id,
    toCityId: to.type === 'city' ? to.id : undefined,
    factionId: PLAYER,
    resources,
    population,
    target: copy(to),
    hp: 100,
    corruption: 0,
  };
  s.caravans.push(caravan);
  return caravan;
}
function contactKnowledge(s: GameState, foreignWords: string[]) {
  const effects = getDogmaEffects(s);
  if (effects.isolated || s.dogmas.some((d) => d.targetId === 'O_09' && d.vectorId === 'M_01'))
    return;
  const word = foreignWords.find((w) => !hasWord(s, w));
  if (!word) return;
  const learner = activeUnits(s)
    .filter((u) => u.caste !== 'slave')
    .sort((a, b) => b.intelligence - a.intelligence)[0];
  if (!learner) return;
  learner.tension ??= {};
  learner.tension[word] = (learner.tension[word] ?? 0) + 50;
  learner.eventMemory ??= [];
  learner.eventMemory.push({ tag: 'ENV_CONTACT', time: s.time, weight: 0, wordIds: [word] });
  log(s, 'Il contatto con un’altra lingua accende una domanda nuova.', 'discovery');
}
function emancipate(s: GameState): { valid: boolean; message: string } {
  if (!hasWord(s, 'M_05') || !hasWord(s, 'C_02'))
    return { valid: false, message: 'La tribù non comprende ancora libertà e permanenza.' };
  if (getDogmaEffects(s).emancipationForbidden)
    return {
      valid: false,
      message: 'Un dogma considera sacra la schiavitù. Deve essere riformato prima.',
    };
  for (const u of activeUnits(s)) {
    if (u.caste === 'slave') {
      u.caste = 'citizen';
      u.emancipated = true;
    }
  }
  for (const c of ownCities(s)) {
    c.cohorts.workers += c.cohorts.slaves;
    c.cohorts.slaves = 0;
    c.revoltTension = 0;
  }
  s.emancipated = true;
  s.revoltTension = 0;
  return {
    valid: true,
    message: 'Nessuna persona appartiene più a un’altra. La schiavitù è abolita.',
  };
}
function startGift(
  s: GameState,
  tokens: string[],
  target?: Target,
): { valid: boolean; message: string } {
  const destination = findCity(s, target, true);
  if (!destination || destination.factionId === PLAYER)
    return { valid: false, message: 'Indica un insediamento straniero a cui portare il dono.' };
  if (getDogmaEffects(s).isolated)
    return { valid: false, message: 'Il dogma vieta il contatto e lo scambio con gli stranieri.' };
  const source = capital(s),
    inventory = inventoryFor(s, source),
    resource = resourceFromTokens(tokens);
  if (inventory[resource] < IMPERIAL_ASSUMPTIONS.firstGiftUnits)
    return {
      valid: false,
      message:
        'Il dono richiede un’unità della risorsa scelta. Se non specifichi una risorsa, viene offerto cibo.',
    };
  inventory[resource] -= IMPERIAL_ASSUMPTIONS.firstGiftUnits;
  const load = emptyInventory();
  load[resource] = IMPERIAL_ASSUMPTIONS.firstGiftUnits;
  const car = makeCaravan(
    s,
    'trade',
    source,
    { type: 'city', id: destination.id, x: destination.x, y: destination.y },
    load,
  );
  car.gift = true;
  car.sourceResource = resource;
  return {
    valid: true,
    message: 'Il dono parte verso gli stranieri. Il contatto avverrà alla consegna.',
  };
}
function witnessExchange(s: GameState, city: City, tag: string) {
  const learner = activeUnits(s)
    .filter((u) => u.caste !== 'slave')
    .sort((a, b) => b.intelligence - a.intelligence)[0];
  if (learner) {
    recordEvent(s, learner, tag, IMPERIAL_ASSUMPTIONS.firstGiftContactWeight, ['V_11']);
    recordCraft(s, learner, 'O_08');
    evaluateDiscoveries(s, learner);
  }
  const faction = s.factions.find((f) => f.id === city.factionId);
  if (faction) {
    foreignEvent(s, faction, tag, IMPERIAL_ASSUMPTIONS.firstGiftContactWeight, ['V_11']);
    foreignComprehension(s, faction, city);
  }
}
function startTrade(
  s: GameState,
  tokens: string[],
  target?: Target,
): { valid: boolean; message: string } {
  const enemy = findCity(s, target, true);
  if (!enemy) return { valid: false, message: 'Non è stato incontrato un altro insediamento.' };
  const faction = s.factions.find((f) => f.id === enemy.factionId),
    source = capital(s),
    inv = inventoryFor(s, source),
    offered = resourceFromTokens(tokens);
  if (getDogmaEffects(s).isolated)
    return { valid: false, message: 'L’isolazionismo vieta il commercio estero.' };
  if (tokens.includes('S_06')) {
    if (getDogmaEffects(s).slaveryForbidden)
      return { valid: false, message: 'La schiavitù è proibita dalla Pietra Sacra.' };
    if (inv.coin < IMPERIAL_ASSUMPTIONS.coinPrice.slave || enemy.cohorts.slaves < 1)
      return {
        valid: false,
        message: 'Il mercato richiede 100 monete e una persona della casta servile disponibile.',
      };
    inv.coin -= 100;
    enemy.resources.coin += 100;
    enemy.cohorts.slaves--;
    if (source) source.cohorts.slaves++;
    else {
      const base = activeUnits(s)[0];
      if (base)
        s.units.push({
          ...copy(base),
          id: nextId(s, 'unit'),
          name: 'Prigioniero',
          caste: 'slave',
          x: s.home.x,
          y: s.home.y,
          isKing: false,
          knows: [],
          age: 6,
          hp: 100,
          hunger: 20,
        });
    }
    contactKnowledge(s, enemy.words);
    return { valid: true, message: 'Una persona della casta servile è stata acquistata.' };
  }
  const send = emptyInventory();
  if (offered === 'coin') {
    const buying = enemy.resources.ingot > 0 ? 'ingot' : 'food';
    const price = buying === 'ingot' ? 100 : 1;
    if (inv.coin < price || enemy.resources[buying] < 1)
      return { valid: false, message: 'Mancano monete o beni disponibili per questa rotta.' };
    inv.coin -= price;
    send.coin = price;
  } else {
    const amount = Math.min(10, inv[offered]);
    if (amount <= 0)
      return { valid: false, message: 'Non possiedi la risorsa da offrire nello scambio.' };
    inv[offered] -= amount;
    send[offered] = amount;
  }
  const caravan = makeCaravan(
    s,
    'trade',
    source,
    { type: 'city', id: enemy.id, x: enemy.x, y: enemy.y },
    send,
  );
  caravan.sourceResource = offered;
  if (faction) faction.peaceUntil = Math.max(faction.peaceUntil ?? 0, s.time + 90);
  return {
    valid: true,
    message: 'La carovana parte. Lo scambio avverrà quando raggiungerà l’altro insediamento.',
  };
}

export function handleImperialCommand(
  s: GameState,
  tokens: string[],
  target?: Target,
  executorId?: string,
): { handled: boolean; valid: boolean; message?: string } {
  const output = (valid: boolean, message: string) => ({ handled: true, valid, message });
  if (tokens.length === 3 && tokens[0] === 'C_02' && tokens[1] === 'S_01' && tokens[2] === 'M_05') {
    const result = emancipate(s);
    return output(result.valid, result.message);
  }
  const p = ['C_01', 'C_02'].includes(tokens[0]) ? tokens.slice(1) : tokens,
    subject = p[0],
    verb = p[1],
    args = p.slice(2);
  if (verb === 'V_04' && args.includes('S_05')) {
    const result = startGift(s, p, target);
    return output(result.valid, result.message);
  }
  if (verb === 'V_14') {
    if (subject !== 'S_04' || !playerHas(s, 'school'))
      return output(false, 'La riforma richiede Saggi e una Scuola Filosofica attiva.');
    if (s.laws.some((l) => l.prohibitive && l.verbId === 'V_14'))
      return output(
        false,
        'Il codice penale vieta il dubbio: revoca la legge prima di avviare una riforma.',
      );
    if (args.includes('S_07') && args.includes('M_05')) {
      if (getDogmaEffects(s).kingDeathCollapse)
        return output(false, 'Il Re-Dio non può essere deposto finché il suo dogma resta attivo.');
      s.government = 'republic';
      s.kingId = null;
      s.philosophy = true;
      return output(
        true,
        'La monarchia cede il posto alla Repubblica: i cittadini liberi producono il 25% in più.',
      );
    }
    const dogma = s.dogmas.find((d) => args.includes(d.targetId));
    if (!dogma) return output(false, 'Indica il concetto di un dogma da esaminare.');
    dogma.reforming = true;
    s.philosophy = true;
    s.dogmaReformTargets ??= [];
    if (!s.dogmaReformTargets.includes(dogma.id)) s.dogmaReformTargets.push(dogma.id);
    return output(true, 'I filosofi ridurranno di 15 il peso culturale del dogma a ogni stagione.');
  }
  if (verb === 'V_11' && (args.includes('S_05') || args.includes('S_06'))) {
    const result = startTrade(s, p, target);
    return output(result.valid, result.message);
  }
  if (subject === 'S_04' && verb === 'V_04' && args.includes('O_09') && args.includes('S_09')) {
    const city = findCity(s, target),
      source = capital(s);
    const faction = s.factions.find((f) => f.id === city?.factionId);
    const foreign = city && city.factionId !== PLAYER;
    if (!city || !source || city.factionId === 'ruins')
      return output(
        false,
        'Scegli una provincia o una comunità straniera con cui condividere la scrittura.',
      );
    const hostDoctrine = getDogmaEffects(doctrineFor(s, city.factionId, city));
    if (
      getDogmaEffects(s).isolated ||
      getDogmaEffects(s).writingForbidden ||
      hostDoctrine.isolated ||
      hostDoctrine.writingForbidden
    )
      return output(false, 'Le dottrine attuali impediscono la condivisione della scrittura.');
    if (
      foreign &&
      (!faction ||
        faction.hostile ||
        faction.relation < IMPERIAL_ASSUMPTIONS.peacefulDelegationRelation)
    )
      return output(
        false,
        'La delegazione richiede pace e una relazione di almeno trenta con il popolo ospite.',
      );
    if (
      foreign &&
      ((city.assimilation.active && city.assimilation.delegateCount > 0) ||
        s.caravans.some(
          (car) =>
            car.kind === 'delegate' &&
            car.factionId === PLAYER &&
            car.toCityId === city.id &&
            !car.arrived &&
            car.hp > 0,
        ))
    )
      return output(false, 'Una delegazione è già presente o in viaggio verso questa comunità.');
    if (source.cohorts.sages < 1) return output(false, 'La capitale non ha un Saggio disponibile.');
    const identity = chooseDelegateIdentity(s, source);
    if (!identity.available)
      return output(false, 'I Saggi presenti sono già impegnati o lontani dalla capitale.');
    source.cohorts.sages--;
    const car = makeCaravan(
      s,
      'delegate',
      source,
      { type: 'city', id: city.id, x: city.x, y: city.y },
      emptyInventory(),
      1,
    );
    car.delegateCount = 1;
    departDelegateIdentity(s, car, identity.unit);
    allocateCityWorkers(s, source);
    return output(
      true,
      foreign
        ? 'Un Saggio parte in pace: condividerà due parole per stagione con la comunità ospite.'
        : 'Un Saggio parte verso la provincia per insegnare due parole per stagione.',
    );
  }
  if (verb === 'V_08' && args.includes('O_01') && args.includes('O_10')) {
    const source = capital(s);
    if (!source || !s.urbanized)
      return output(false, 'La fondazione di colonie richiede una capitale urbana.');
    if (!target) return output(false, 'Indica un settore libero.');
    const sx = Math.floor(target.x / 100),
      sy = Math.floor(target.y / 100);
    if (s.cities.some((c) => c.sectorX === sx && c.sectorY === sy))
      return output(false, 'Questo settore ospita già una città.');
    const inv = inventoryFor(s, source);
    if (source.cohorts.workers < 30 || inv.wood < 50 || inv.stone < 50 || !foodCost(inv, 50))
      return output(
        false,
        'Servono trenta lavoratori e cinquanta unità di ciascuna risorsa: legno, pietra e cibo.',
      );
    source.cohorts.workers -= 30;
    inv.wood -= 50;
    inv.stone -= 50;
    const send = emptyInventory();
    send.wood = 50;
    send.stone = 50;
    let left = 50;
    for (const r of FOOD) {
      const n = Math.min(left, inv[r]);
      inv[r] -= n;
      send[r] = n;
      left -= n;
    }
    const car = makeCaravan(
      s,
      'colonists',
      source,
      { type: 'point', x: sx * 100 + 50, y: sy * 100 + 50 },
      send,
      30,
    );
    car.words = known(s);
    car.dogmas = copy(s.dogmas);
    return output(true, 'Trenta cittadini portano la lingua della capitale verso una nuova terra.');
  }
  if (subject === 'S_08') {
    const army =
      s.battalions.find((b) => b.id === executorId && b.factionId === PLAYER && b.hp > 0) ??
      (target?.type === 'battalion'
        ? s.battalions.find((b) => b.id === target.id && b.factionId === PLAYER)
        : s.battalions.find((b) => b.factionId === PLAYER && b.hp > 0));
    if (!army) return output(false, 'Non possiedi battaglioni da comandare.');
    if (verb === 'V_01') {
      const destination = args.includes('O_01') ? s.home : target;
      if (!destination) return output(false, 'Indica una destinazione per il battaglione.');
      army.tx = destination.x;
      army.ty = destination.y;
      army.action = 'moving';
      army.target = target;
      return output(true, 'Il battaglione avanza.');
    }
    if (verb === 'V_13' || verb === 'V_03') {
      const enemy = findCity(s, target, true);
      if (!enemy || enemy.factionId === PLAYER)
        return output(false, 'Indica un insediamento straniero.');
      const f = s.factions.find((z) => z.id === enemy.factionId);
      if (getDogmaEffects(s).pacifism && !f?.hostile)
        return output(false, 'Il pacifismo vieta di attaccare per primi.');
      army.targetId = enemy.id;
      army.target = { type: 'city', id: enemy.id, x: enemy.x, y: enemy.y };
      army.action = verb === 'V_13' ? 'conquering' : 'attacking';
      army.occupation = 0;
      if (f) {
        f.hostile = true;
        f.relation = -100;
        f.peaceUntil = undefined;
      }
      return output(
        true,
        verb === 'V_13'
          ? 'Il battaglione marcia verso l’assedio e l’annessione.'
          : 'Il battaglione attacca l’insediamento.',
      );
    }
    if (verb === 'V_08' && args.includes('O_13')) {
      if (getDogmaEffects(s).machinesForbidden)
        return output(false, 'Il dogma vieta le macchine da assedio.');
      const source = s.cities.find((c) => c.id === army.cityId),
        inv = inventoryFor(s, source);
      if (!canPay(inv, { wood: 40, ingot: 20 }))
        return output(false, 'Una catapulta richiede quaranta unità di legno e venti lingotti.');
      pay(inv, { wood: 40, ingot: 20 });
      army.catapult = true;
      return output(true, 'La catapulta si aggrega al battaglione.');
    }
    if (verb === 'V_10' && args.includes('O_04')) {
      if (getDogmaEffects(s).vegetarian)
        return output(false, 'Il dogma animale vieta la cavalleria da guerra.');
      army.cavalry = true;
      return output(
        true,
        'Il battaglione diventa cavalleria: velocità doppia e venti danni aggiuntivi.',
      );
    }
  }
  if (subject === 'S_09') {
    const c =
      s.cities.find((city) => city.id === executorId && city.factionId === PLAYER) ??
      findCity(s, target);
    if (!c || c.factionId !== PLAYER) return output(false, 'Scegli una città del tuo Impero.');
    if (verb === 'V_08') {
      const result = cityConstruction(s, c, p);
      return output(result.valid, result.message);
    }
    if (verb === 'V_12' && args.includes('S_08')) {
      const legal = imperialLawEffects(s),
        auxiliary =
          legal.auxiliaryRecruitmentPoolMultiplier > 1
            ? Math.min(c.cohorts.workers, c.cohorts.warriors)
            : 0;
      if (c.cohorts.warriors + auxiliary < 20 || inventoryFor(s, c).metalArms < 20)
        return output(false, 'Servono venti reclute disponibili e venti armi metalliche.');
      const ready = s.eventTimes[`recruitmentReady:${c.id}`] ?? 0;
      if (s.time < ready)
        return output(false, 'Il centro di reclutamento sta ancora riorganizzando le leve.');
      s.eventTimes[`recruitmentReady:${c.id}`] =
        s.time + IMPERIAL_ASSUMPTIONS.recruitmentCooldownSeconds / legal.recruitmentSpeedMultiplier;
      const warriors = Math.min(20, c.cohorts.warriors);
      c.cohorts.warriors -= warriors;
      c.cohorts.workers -= 20 - warriors;
      c.garrisonHp = c.cohorts.warriors * 100;
      inventoryFor(s, c).metalArms -= 20;
      s.battalions.push({
        id: nextId(s, 'army'),
        name: `Battaglione di ${c.name}`,
        x: c.x,
        y: c.y,
        cityId: c.id,
        factionId: PLAYER,
        hp: 2000,
        maxHp: 2000,
        morale: 1,
        action: 'idle',
        catapult: false,
        occupation: 0,
        attackProgress: 0,
        lastSoldierLoss: 0,
        metalWeapons: 20,
      });
      return output(true, 'Venti guerrieri formano un battaglione professionale.');
    }
    if (verb === 'V_04') {
      const r = resourceFromTokens(args),
        inv = inventoryFor(s, c),
        cap =
          target?.type === 'city' && target.id !== c.id
            ? s.cities.find((city) => city.id === target.id && city.factionId === PLAYER)
            : capital(s);
      if (!cap || cap.id === c.id)
        return output(false, 'Scegli una provincia e una città di destinazione diversa.');
      if (inv[r] < 100)
        return output(false, 'Il convoglio richiede cento unità della risorsa indicata.');
      inv[r] -= 100;
      const send = emptyInventory();
      send[r] = 100;
      makeCaravan(s, 'tax', c, { type: 'city', id: cap.id, x: cap.x, y: cap.y }, send);
      return output(
        true,
        'Un convoglio parte verso la città indicata con cento unità della risorsa scelta.',
      );
    }
    if (['V_09', 'V_10', 'V_12'].includes(verb)) {
      if (verb === 'V_12') {
        const mode = args.includes('O_08') ? 'coin' : args.includes('V_03') ? 'metalArms' : 'ingot',
          foundries = cityBuildings(s, c).filter((b) => b.kind === 'foundry');
        if (foundries.length && (mode !== 'ingot' || !args.includes('O_05'))) {
          for (const b of foundries) b.productionMode = mode;
          allocateCityWorkers(s, c);
          return output(
            true,
            mode === 'coin'
              ? 'Le fonderie coniano: ogni lingotto lavorato diventa cento monete.'
              : mode === 'metalArms'
                ? 'Le fonderie forgiano: ogni lingotto lavorato diventa un’arma metallica.'
                : 'Le fonderie tornano a raffinare minerale e legna in lingotti.',
          );
        }
        if (mode !== 'ingot')
          return output(false, 'Costruisci prima una fonderia con Metallo e Fuoco.');
      }
      const kind: BuildingKind = verb === 'V_09' ? 'farm' : verb === 'V_10' ? 'pen' : 'foundry',
        spec = BUILDING_SPECS[kind],
        inv = inventoryFor(s, c);
      if (!canPay(inv, spec.cost)) return output(false, `Mancano i materiali per ${spec.label}.`);
      const resourceNodes = s.entities.filter(
        (e) =>
          Math.floor(e.x / 100) === c.sectorX &&
          Math.floor(e.y / 100) === c.sectorY &&
          (kind === 'foundry'
            ? e.kind === 'ore'
            : kind === 'pen'
              ? e.kind === 'deer'
              : e.kind === 'berries' || e.kind === 'seedling'),
      );
      if (!resourceNodes.length)
        return output(false, 'Il settore non offre risorse naturali per questo impianto.');
      pay(inv, spec.cost);
      const b: Building = {
        id: nextId(s, 'building'),
        kind,
        x: c.x + 6,
        y: c.y + 6,
        hp: spec.maxHp,
        active: true,
        completed: true,
        cityId: c.id,
        workerIds: [],
        livestock: kind === 'pen' ? 1 : undefined,
      };
      s.buildings.push(b);
      c.buildingIds.push(b.id);
      allocateCityWorkers(s, c);
      return output(true, `${spec.label} entra nei distretti della città.`);
    }
    if (verb === 'V_05' && args.includes('O_09')) {
      allocateCityWorkers(s, c);
      return output(true, 'La casta sapiente presidia la memoria scritta della città.');
    }
  }
  return { handled: false, valid: true };
}

function completeCaravan(s: GameState, c: Caravan) {
  if (completeForeignExpansion(s, c)) return;
  const destination = c.toCityId ? s.cities.find((city) => city.id === c.toCityId) : undefined;
  const from = s.cities.find((city) => city.id === c.fromCityId);
  const foreignResult = completeForeignMerchant(s, c);
  if (foreignResult) {
    if (foreignResult === 'exchange' && from) {
      witnessExchange(s, from, 'ENV_TRADE');
      contactKnowledge(s, from.words);
    }
    return;
  }
  if (c.kind === 'colonists') {
    if (
      s.cities.some(
        (city) => city.sectorX === Math.floor(c.x / 100) && city.sectorY === Math.floor(c.y / 100),
      )
    ) {
      if (from) {
        from.cohorts.workers += c.population;
        for (const r of RESOURCES) inventoryFor(s, from)[r] += c.resources[r];
      }
      c.arrived = true;
      return;
    }
    const city: City = {
      id: nextId(s, 'city'),
      name: `Colonia ${ownCities(s).length + 1}`,
      x: c.x,
      y: c.y,
      sectorX: Math.floor(c.x / 100),
      sectorY: Math.floor(c.y / 100),
      factionId: PLAYER,
      cohorts: { workers: c.population, warriors: 0, sages: 0, slaves: 0 },
      resources: c.resources,
      words: c.words ?? known(s),
      dogmas: c.dogmas ?? copy(s.dogmas),
      revoltTension: 0,
      housing: c.population,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      garrisonHp: 0,
      foundedAt: s.time,
    };
    s.cities.push(city);
    const sector = s.sectors.find((z) => z.x === city.sectorX && z.y === city.sectorY);
    if (sector) sector.cityId = city.id;
    log(s, `${city.name} è fondata: la lingua della capitale vive in un altro luogo.`, 'good');
    c.arrived = true;
    return;
  }
  if (c.kind === 'delegate') {
    const faction = s.factions.find((f) => f.id === destination?.factionId),
      sourceDoctrine = getDogmaEffects(s),
      hostDoctrine = destination
        ? getDogmaEffects(doctrineFor(s, destination.factionId, destination))
        : undefined,
      teachingAllowed =
        !sourceDoctrine.isolated &&
        !sourceDoctrine.writingForbidden &&
        !hostDoctrine?.isolated &&
        !hostDoctrine?.writingForbidden;
    const welcoming =
      destination &&
      destination.factionId !== 'ruins' &&
      ((destination.factionId === PLAYER && (c.returning || teachingAllowed)) ||
        (!c.returning &&
          teachingAllowed &&
          faction &&
          !faction.hostile &&
          faction.relation >= IMPERIAL_ASSUMPTIONS.peacefulDelegationRelation));
    if (welcoming && destination) {
      if (!c.returning) {
        destination.assimilation.active = true;
        destination.assimilation.delegateCount += c.delegateCount ?? 1;
      }
      destination.cohorts.sages += c.population;
      c.arrived = true;
      settleDelegateIdentity(s, c, destination);
      return;
    }
    const refuge = from?.factionId === PLAYER ? from : capital(s);
    if (refuge) {
      c.returning = true;
      c.toCityId = refuge.id;
      c.target = { type: 'city', id: refuge.id, x: refuge.x, y: refuge.y };
      log(
        s,
        'La delegazione non è più accolta: i Saggi si mettono in viaggio verso una città amica.',
        'warning',
      );
    } else {
      c.arrived = true;
      strandDelegateIdentity(s, c);
      log(s, 'La delegazione non trova più una città amica a cui tornare.', 'danger');
    }
    return;
  }
  if (c.kind === 'tax') {
    if (destination && destination.factionId === PLAYER) {
      const inv = inventoryFor(s, destination);
      for (const r of RESOURCES) inv[r] += c.resources[r] * (1 - (c.corruption ?? 0));
      log(s, 'Una carovana fiscale raggiunge la capitale.', 'good');
    }
    c.arrived = true;
    return;
  }
  if (c.kind === 'trade') {
    if (c.returning) {
      const inv = inventoryFor(s, from);
      for (const r of RESOURCES) inv[r] += c.resources[r];
      c.arrived = true;
      return;
    }
    if (!destination) {
      c.arrived = true;
      return;
    }
    const faction = s.factions.find((f) => f.id === destination.factionId),
      received = emptyInventory(),
      offered = c.sourceResource ?? 'food',
      foreign = destination.resources;
    if (c.gift) {
      for (const r of RESOURCES) foreign[r] += c.resources[r];
      c.resources = emptyInventory();
      c.arrived = true;
      if (faction) {
        faction.relation = clamp(faction.relation + 10, -100, 100);
        faction.peaceUntil = Math.max(faction.peaceUntil ?? 0, s.time + 90);
      }
      witnessExchange(s, destination, 'ENV_FIRST_GIFT');
      contactKnowledge(s, destination.words);
      log(
        s,
        'Il dono raggiunge un altro popolo. Portare ciò che è mio può diventare uno scambio.',
        'discovery',
      );
      return;
    }
    if (offered === 'coin') {
      const buy = foreign.ingot > 0 ? 'ingot' : 'food',
        price = buy === 'ingot' ? 100 : 1;
      let quantity = Math.min(foreign[buy], Math.floor(c.resources.coin / price));
      const trade =
        getDogmaEffects(s, { againstForeign: true }).trade * imperialLawEffects(s).tradeMultiplier;
      // Hospitality doubles monetary yield, not physical goods created from nothing.
      quantity = Math.min(foreign[buy], quantity);
      foreign[buy] -= quantity;
      received[buy] = quantity;
      foreign.coin += c.resources.coin;
      const bonus = Math.min(foreign.coin, c.resources.coin * Math.max(0, trade - 1));
      foreign.coin -= bonus;
      received.coin += bonus;
    } else {
      const source = inventoryFor(s, from),
        choices = (['food', 'stone', 'wood', 'ingot'] as Resource[])
          .filter((r) => r !== offered && foreign[r] > 0)
          .sort((a, b) => source[a] - source[b]),
        buy = choices[0];
      if (buy) {
        const amount = Math.min(c.resources[offered], foreign[buy]);
        foreign[buy] -= amount;
        foreign[offered] += amount;
        received[buy] = amount;
        received[offered] = c.resources[offered] - amount;
      } else received[offered] = c.resources[offered];
    }
    c.resources = received;
    c.returning = true;
    c.toCityId = from?.id;
    c.target = {
      type: from ? 'city' : 'point',
      id: from?.id,
      x: from?.x ?? s.home.x,
      y: from?.y ?? s.home.y,
    };
    if (faction) {
      faction.relation = clamp(faction.relation + 10, -100, 100);
      faction.lastTradeAt = s.time;
      faction.intelligibility = getIntelligibility(s, faction.words);
    }
    s.stats.trades = (s.stats.trades ?? 0) + 1;
    onDogmaticUse(s, ['S_01', 'V_11', ...(c.words ?? [])], undefined, c.target);
    recordLawWork(s, c.fromCityId, [
      'S_09',
      'V_11',
      offered === 'coin'
        ? 'O_12'
        : offered === 'wood'
          ? 'O_03'
          : offered === 'stone'
            ? 'O_02'
            : offered === 'ingot'
              ? 'O_07'
              : 'O_04',
    ]);
    witnessExchange(s, destination, 'ENV_TRADE');
    contactKnowledge(s, destination.words);
    log(s, 'Lo scambio è riuscito. La carovana ritorna con ciò che manca alla comunità.', 'good');
  }
}

function loseSoldiers(s: GameState, b: Battalion, previousHp: number) {
  const before = Math.floor((b.maxHp - previousHp) / 100),
    after = Math.floor((b.maxHp - Math.max(0, b.hp)) / 100),
    lost = Math.max(0, after - before);
  // Soldiers left the resident warrior cohort at recruitment. Do not subtract them twice.
  if (lost) {
    if (b.factionId === PLAYER) s.stats.deaths += lost;
    b.lastSoldierLoss = (b.lastSoldierLoss ?? 0) + lost;
  }
}
function doctrineFor(s: GameState, factionId: string, homeCity?: City): GameState {
  if (factionId === PLAYER && (!homeCity || !s.factions.some((f) => f.cityId === homeCity.id)))
    return s;
  const faction = s.factions.find((f) => f.id === factionId),
    city = homeCity ?? s.cities.find((c) => c.factionId === factionId);
  return {
    ...s,
    dogmas: city?.dogmas ?? faction?.dogmas ?? [],
    home: city ? { x: city.x, y: city.y } : s.home,
    buildings: s.buildings.filter((b) =>
      s.cities.some((c) => c.id === b.cityId && c.factionId === factionId),
    ),
    eventTimes: {},
  };
}
function armyRepresentative(b: Battalion): Unit {
  return {
    id: b.id,
    name: b.name,
    x: b.x,
    y: b.y,
    hp: b.hp,
    hunger: 0,
    temp: 100,
    age: 8,
    strength: 7,
    intelligence: 5,
    action: b.action,
    progress: 0,
    knows: [],
    isolation: 0,
    caste: 'warrior',
    factionId: b.factionId,
    cityId: b.cityId,
    command: ['S_08', b.action === 'conquering' ? 'V_13' : 'V_03'],
  };
}
function armyEffects(s: GameState, b: Battalion) {
  const scoped = doctrineFor(s, b.factionId),
    unit = armyRepresentative(b),
    inBorders = s.cities.some(
      (c) =>
        c.factionId === b.factionId &&
        c.sectorX === Math.floor(b.x / 100) &&
        c.sectorY === Math.floor(b.y / 100),
    );
  const effects = getDogmaEffects(scoped, {
    unit,
    subjectId: 'S_08',
    targetId: 'S_08',
    againstForeign: !inBorders,
    inBorders,
  });
  // Weapons blessed by sage-founders benefit the soldiers who actually bear those arms.
  if (b.metalWeapons && scoped.dogmas.some((d) => d.targetId === 'O_05' && d.vectorId === 'S_04'))
    effects.morale *= 1.3;
  return effects;
}
function armyMorale(s: GameState, b: Battalion) {
  const fx = armyEffects(s, b);
  return b.morale * fx.combat * fx.morale * (b.factionId === PLAYER && s.cohesion < 30 ? 0.7 : 1);
}
/** Valhalla uses real local scholars as a first rank, never fabricated soldiers. */
function warCult(s: GameState) {
  return s.dogmas.some((d) => d.targetId === 'V_03' && d.vectorId === 'O_06');
}
function frontlineHost(s: GameState, id: string) {
  return (
    s.battalions.find((b) => b.id === id && b.hp > 0) ??
    s.cities.find((c) => c.id === id && c.factionId === PLAYER)
  );
}
function updateFrontline(s: GameState, dt: number) {
  const hosts: (City | Battalion)[] = [];
  if (warCult(s)) {
    for (const b of s.battalions.filter(
      (b) => b.factionId === PLAYER && b.hp > 0 && ['attacking', 'conquering'].includes(b.action),
    ))
      hosts.push(b);
    for (const c of ownCities(s))
      if (
        (c.garrisonHp ?? 0) > 0 &&
        s.battalions.some(
          (b) =>
            b.factionId !== PLAYER &&
            b.hp > 0 &&
            b.targetId === c.id &&
            ['attacking', 'conquering'].includes(b.action) &&
            distance(b, c) <= 3,
        )
      )
        hosts.push(c);
  }
  for (const host of hosts) {
    const cityId = 'cohorts' in host ? host.id : host.cityId;
    host.frontlineSageIds ??= [];
    for (const u of activeUnits(s).filter(
      (u) =>
        u.cityId === cityId &&
        unitCohort(u) === 'sages' &&
        !u.isKing &&
        !['frontline', 'frontline-returning'].includes(u.action) &&
        distance(u, host) <= IMPERIAL_ASSUMPTIONS.frontlineCallRadiusMetres,
    )) {
      u.action = 'frontline';
      u.targetId = host.id;
      u.command = ['S_04', 'V_03', 'S_05'];
      u.jobBuildingId = undefined;
      for (const b of s.buildings)
        if (b.workerIds) b.workerIds = b.workerIds.filter((id) => id !== u.id);
      host.frontlineSageIds.push(u.id);
    }
  }
  for (const u of activeUnits(s).filter((u) =>
    ['frontline', 'frontline-returning'].includes(u.action),
  )) {
    const host = frontlineHost(s, u.targetId ?? ''),
      active = host && hosts.includes(host);
    if (u.action === 'frontline' && active) {
      u.tx = host.x;
      u.ty = host.y;
      moveTo(u, host, 4, dt);
    } else {
      u.action = 'frontline-returning';
      const home = s.cities.find((c) => c.id === u.cityId && c.factionId === PLAYER);
      if (!home || moveTo(u, home, 4, dt)) {
        u.action = 'idle';
        u.targetId = undefined;
        u.command = undefined;
      }
    }
  }
  for (const host of [...s.cities, ...s.battalions])
    if (host.frontlineSageIds)
      host.frontlineSageIds = host.frontlineSageIds.filter((id) =>
        s.units.some(
          (u) => u.id === id && u.hp > 0 && ['frontline', 'frontline-returning'].includes(u.action),
        ),
      );
  for (const c of ownCities(s)) allocateCityWorkers(s, c);
}
function absorbFrontlineDamage(
  s: GameState,
  host: City | Battalion,
  damage: number,
  attackerId?: string,
) {
  let left = damage;
  for (const id of host.frontlineSageIds ?? []) {
    const u = s.units.find(
      (u) => u.id === id && u.hp > 0 && u.action === 'frontline' && distance(u, host) <= 3,
    );
    if (!u || protectedByDogma(s, 'S_04', u) || getDogmaEffects(s, { unit: u }).protected) continue;
    const wound = Math.min(left, u.hp);
    u.hp -= wound;
    if (wound > 0) {
      rememberCombatWound(s, u, wound, { kind: 'army', id: attackerId });
      recordAttackTrauma(s);
    }
    left -= wound;
    if (u.hp <= 0) killUnit(s, u, 'V_03');
    if (left <= 0) break;
  }
  return left;
}
function damageGarrison(s: GameState, city: City, damage: number, attackerId?: string) {
  const previous = city.garrisonHp ?? 0;
  city.garrisonHp = Math.max(0, previous - absorbFrontlineDamage(s, city, damage, attackerId));
  if (city.factionId === PLAYER && city.garrisonHp < previous) recordAttackTrauma(s);
  const lost = Math.max(0, Math.ceil(previous / 100) - Math.ceil(city.garrisonHp / 100));
  const represented = s.units
    .filter((u) => u.hp > 0 && u.cityId === city.id && (u.caste === 'warrior' || u.strength >= 7))
    .slice(0, lost);
  for (const u of represented) {
    if (city.factionId === PLAYER) {
      rememberCombatWound(s, u, u.hp, { kind: 'army', id: attackerId });
      killUnit(s, u, 'V_03');
      continue;
    }
    city.cohorts.warriors = Math.max(0, city.cohorts.warriors - 1);
    u.hp = 0;
    u.action = 'dead';
    removeCustodian(s, u);
    s.entities.push({
      id: nextId(s, 'corpse'),
      kind: 'corpse',
      x: u.x,
      y: u.y,
      amount: 1,
      hp: 0,
      maxHp: 1,
    });
  }
  const unrepresented = lost - represented.length;
  city.cohorts.warriors = Math.max(0, city.cohorts.warriors - unrepresented);
  if (city.factionId === PLAYER) s.stats.deaths += unrepresented;
}
function attackCity(s: GameState, b: Battalion, city: City, dt: number) {
  if (distance(b, city) > 3) {
    moveTo(b, city, b.cavalry ? 8 : 4, dt);
    return;
  }
  const effect = armyEffects(s, b),
    defenderState = doctrineFor(s, city.factionId, city),
    defender = armyRepresentative({
      ...b,
      id: city.id,
      x: city.x,
      y: city.y,
      cityId: city.id,
      factionId: city.factionId,
    }),
    defense = getDogmaEffects(defenderState, {
      unit: defender,
      subjectId: 'S_08',
      targetId: 'S_08',
      inBorders: true,
    }),
    walls = cityBuildings(s, city).find((z) => z.kind === 'walls' && z.hp > 0);
  b.attackProgress = (b.attackProgress ?? 0) + dt;
  if (b.attackProgress < 1) return;
  b.attackProgress -= 1;
  if (walls) {
    const damage = b.catapult
      ? 200
      : effectiveDamage(
          Math.min(
            (b.metalWeapons ? 40 : 15) + (b.cavalry ? 20 : 0),
            b.factionId === 'rebels' ? imperialLawEffects(s).rebelsWeaponDamageCap : Infinity,
          ),
          IMPERIAL_ASSUMPTIONS.militaryStrength,
          armyMorale(s, b),
          0,
          0.8,
        ) * Math.ceil(b.hp / 100);
    const previousHp = walls.hp;
    walls.hp = Math.max(0, walls.hp - damage);
    if (b.catapult && walls.hp < previousHp)
      b.lastSiegeShot = {
        time: s.time,
        cityId: city.id,
        wallId: walls.id,
        fromX: b.x,
        fromY: b.y,
        damage: previousHp - walls.hp,
      };
    if (walls.hp <= 0) log(s, `Le mura di ${city.name} sono cadute.`, 'warning');
  } else if ((city.garrisonHp ?? 0) > 0) {
    if (!defense.protected && !protectedByDogma(defenderState, 'S_08', defender)) {
      const dmg =
        effectiveDamage(
          Math.min(
            (b.metalWeapons ? 40 : 15) + (b.cavalry ? 20 : 0),
            b.factionId === 'rebels' ? imperialLawEffects(s).rebelsWeaponDamageCap : Infinity,
          ),
          7,
          armyMorale(s, b),
          city.resources.metalArms > 0 ? 0.5 : 0,
          0,
        ) * Math.ceil(b.hp / 100);
      damageGarrison(s, city, dmg, b.id);
    }
  } else if (b.action === 'conquering') {
    b.occupation += 1;
    city.occupation = b.occupation;
    if (b.occupation >= 30) {
      const old = city.factionId;
      city.factionId = b.factionId;
      city.revoltTension = getDogmaEffects(s).trade >= 2 ? 25 : 50;
      city.loyalty = 50;
      city.assimilation = { delegateCount: 0, active: false };
      b.action = 'idle';
      b.occupation = 0;
      city.occupation = 0;
      if (b.factionId === PLAYER) {
        s.stats.conquests = (s.stats.conquests ?? 0) + 1;
        s.cohesion = clamp(s.cohesion + effect.conquestCohesion);
        onDogmaticUse(s, ['S_08', 'V_13', 'S_09', 'O_10'], undefined, {
          type: 'city',
          id: city.id,
          x: city.x,
          y: city.y,
        });
        recordLawWork(s, b.id, ['S_08', 'V_13', 'O_10', 'S_05']);
      }
      const faction = s.factions.find((f) => f.id === old);
      if (faction) faction.subjugated = !s.cities.some((c) => c.factionId === old);
      log(
        s,
        `${city.name} è annessa. La sua lingua e i suoi dogmi sopravvivono alla conquista.`,
        'good',
      );
    }
  } else {
    removePopulation(city, 1);
    if (cityPopulation(city) <= 0) {
      city.factionId = 'ruins';
      b.action = 'idle';
      log(s, `${city.name} è stata distrutta.`, 'danger');
    }
  }
  if (
    (city.garrisonHp ?? 0) > 0 &&
    !effect.protected &&
    !protectedByDogma(doctrineFor(s, b.factionId), 'S_08', armyRepresentative(b))
  ) {
    const previous = b.hp,
      defenders = Math.ceil((city.garrisonHp ?? 0) / 100),
      counter =
        effectiveDamage(
          city.resources.metalArms > 0 ? 40 : 5,
          7,
          defense.defense * defense.combat * defense.morale,
          b.metalWeapons ? 0.5 : 0,
          0,
        ) * defenders;
    b.hp = Math.max(0, b.hp - absorbFrontlineDamage(s, b, counter, city.id));
    if (b.factionId === PLAYER && b.hp < previous) recordAttackTrauma(s);
    loseSoldiers(s, b, previous);
  }
}
function battleArmies(s: GameState, dt: number) {
  for (const b of s.battalions.filter((z) => z.hp > 0)) {
    if (b.factionId === PLAYER && getDogmaEffects(s).nightTaboo && phase(s).night) {
      b.action = 'moving';
      b.tx = s.home.x;
      b.ty = s.home.y;
    }
    if (b.action === 'moving') {
      moveTo(b, { x: b.tx ?? b.x, y: b.ty ?? b.y }, b.cavalry ? 8 : 4, dt);
      if (distance(b, { x: b.tx ?? b.x, y: b.ty ?? b.y }) < 0.01) b.action = 'idle';
    }
    if (['conquering', 'attacking'].includes(b.action)) {
      const city = s.cities.find((c) => c.id === b.targetId);
      if (city && city.factionId !== b.factionId) attackCity(s, b, city, dt);
      else b.action = 'idle';
    }
    const enemy = s.battalions.find(
      (other) =>
        other.hp > 0 &&
        areFactionsHostile(s, b.factionId, other.factionId) &&
        distance(b, other) <= 3,
    );
    if (enemy) {
      const previous = enemy.hp,
        enemyState = doctrineFor(s, enemy.factionId),
        defense = armyEffects(s, enemy);
      if (!defense.protected && !protectedByDogma(enemyState, 'S_08', armyRepresentative(enemy))) {
        const damage =
          effectiveDamage(
            Math.min(
              (b.metalWeapons ? 40 : 15) + (b.cavalry ? 20 : 0),
              b.factionId === 'rebels' ? imperialLawEffects(s).rebelsWeaponDamageCap : Infinity,
            ),
            7,
            armyMorale(s, b),
            enemy.metalWeapons ? 0.5 : 0,
          ) *
          Math.ceil(b.hp / 100) *
          dt;
        enemy.hp = Math.max(0, enemy.hp - absorbFrontlineDamage(s, enemy, damage, b.id));
        if (enemy.factionId === PLAYER && enemy.hp < previous) recordAttackTrauma(s);
        loseSoldiers(s, enemy, previous);
      }
      if (b.metalWeapons) b.metalWeapons = Math.max(0, b.metalWeapons - 0.02 * dt);
    }
    if (
      b.factionId === PLAYER &&
      b.hp <= b.maxHp * 0.2 &&
      !s.dogmas.some((d) => d.targetId === 'V_03' && d.vectorId === 'O_06') &&
      !s.laws.some((l) => l.sanctionId === 'O_06' && l.objectId === 'S_08')
    ) {
      b.action = 'moving';
      b.tx = s.home.x;
      b.ty = s.home.y;
    }
  }
  for (const car of s.caravans.filter((c) => !c.arrived && c.hp > 0)) {
    const enemy = s.battalions.find(
      (b) => b.hp > 0 && canInterceptCaravan(s, car, b.factionId) && distance(b, car) < 4,
    );
    if (enemy) car.hp = Math.max(0, car.hp - 40 * dt);
  }
  for (const car of s.caravans.filter((c) => !c.arrived && c.hp <= 0)) {
    car.arrived = true;
    log(
      s,
      'Una carovana è stata intercettata. Il suo carico non raggiungerà la destinazione.',
      'danger',
    );
  }
}

export function updateImperial(s: GameState, dt: number) {
  synchronizeDelegateIdentities(s);
  bindCapital(s);
  condenseCities(s);
  if (s.urbanized) {
    for (const unit of activeUnits(s)) {
      if (
        unit.cityId ||
        (unit.caste !== 'slave' && !(unit.caste === 'citizen' && unit.emancipated)) ||
        travellingDelegate(s, unit)
      )
        continue;
      const destination = ownCities(s)
        .filter((city) => distance(unit, city) <= 10)
        .sort((left, right) => distance(unit, left) - distance(unit, right))[0];
      if (!destination) continue;
      // A field captive is already a real person. Count them in the city only
      // upon physical arrival; setting cityId prevents a second enrolment.
      unit.cityId = destination.id;
      destination.cohorts[unit.caste === 'slave' ? 'slaves' : 'workers']++;
    }
  }
  const effects = getDogmaEffects(s),
    slaves = s.urbanized
      ? ownCities(s).reduce((n, c) => n + c.cohorts.slaves, 0) +
        activeUnits(s).filter(
          (unit) => unit.caste === 'slave' && !unit.cityId && !travellingDelegate(s, unit),
        ).length
      : activeUnits(s).filter((u) => u.caste === 'slave').length;
  s.revoltTension = clamp(s.revoltTension + ((slaves * 0.5) / 60) * dt * effects.slaveRevolt);
  if (hasWord(s, 'M_04'))
    s.inequality = clamp(s.inequality + (Math.max(0, effects.inequality - 1) * dt) / 60);
  for (const c of ownCities(s))
    c.revoltTension = clamp(
      c.revoltTension + ((c.cohorts.slaves * 0.5) / 60) * dt * effects.slaveRevolt,
    );
  dispatchForeignMerchants(s);
  inspectForeignCustoms(s);
  const delivered: Caravan[] = [];
  for (const car of s.caravans.filter((c) => !c.arrived && c.hp > 0)) {
    if (car.customsRefused && !car.returning) continue;
    const previous = { x: car.x, y: car.y };
    if (moveTo(car, car.target, hasWord(s, 'O_13') ? 6 : 4, dt)) delivered.push(car);
    recordCaravanTravel(s, car, previous);
  }
  // The border charge precedes arrival/exchange, including a large time step.
  inspectForeignCustoms(s);
  for (const car of delivered) {
    if (!car.customsRefused || car.returning) completeCaravan(s, car);
  }
  updateFrontline(s, dt);
  battleArmies(s, dt);
  synchronizeDelegateIdentities(s);
  for (const f of s.factions) {
    const penalty = dogmaDiplomaticPenalty(s.dogmas, f.dogmas),
      key = `dogmaDiplomacy:${f.id}`,
      previous = s.eventTimes[key] ?? 0;
    f.relation = clamp(f.relation + penalty - previous, -100, 100);
    s.eventTimes[key] = penalty;
    f.intelligibility = getIntelligibility(s, f.words);
    if (f.peaceUntil && f.peaceUntil > s.time) f.hostile = false;
  }
  const strongWorkers = activeUnits(s).filter(
    (u) => adult(u) && u.age < ELDER_AGE && u.strength >= 7 && u.caste !== 'slave',
  );
  const strongUprising =
    !s.urbanized &&
    strongWorkers.length > 0 &&
    effects.warriorRebellionThreshold < 100 &&
    s.revoltTension >= effects.warriorRebellionThreshold;
  if ((s.revoltTension >= 100 || strongUprising) && s.eventTimes.rebellion === undefined) {
    s.eventTimes.rebellion = s.time;
    s.recentTrauma = { tag: 'ENV_REBELLION', time: s.time };
    for (const u of activeUnits(s)) {
      u.eventMemory ??= [];
      u.eventMemory.push({ tag: 'ENV_REBELLION', time: s.time, weight: 100, wordIds: ['M_05'] });
    }
    log(
      s,
      strongUprising
        ? 'I lavoratori forti insorgono contro i privilegi dell’oligarchia sacerdotale.'
        : 'La tensione diventa rivolta. La casta servile insorge contro il centro della comunità.',
      'danger',
    );
    for (const u of activeUnits(s).filter(
      (u) =>
        (u.caste === 'slave' && s.revoltTension >= 100) ||
        (strongUprising && strongWorkers.includes(u)),
    )) {
      u.factionId = 'rebels';
      u.action = 'hunting';
      u.tx = s.home.x;
      u.ty = s.home.y;
    }
  }
  for (const c of ownCities(s)) {
    const threshold =
      c.cohorts.warriors > 0
        ? getDogmaEffects(doctrineFor(s, c.factionId, c)).warriorRebellionThreshold
        : 100;
    if (c.revoltTension >= threshold && !c.rebelling) {
      c.rebelling = true;
      c.factionId = 'rebels';
      log(s, `${c.name} si ribella all’Impero.`, 'danger');
    }
  }
  if (s.urbanized && !ownCities(s).length)
    s.gameOver = 'Tutte le città sono state perdute. L’Impero non ha più una casa.';
  evaluateVictory(s, false);
}

/** Only living, represented people who occupied this building's finite slots gain experience. */
function recordUrbanCraft(s: GameState, c: City, b: Building, cycles: number, wordIds: string[]) {
  if (c.factionId !== PLAYER || cycles < 1) return;
  const workers = activeUnits(s).filter(
    (u) => u.cityId === c.id && adult(u) && u.caste !== 'slave' && b.workerIds?.includes(u.id),
  );
  if (!workers.length) return;
  for (let i = 0; i < Math.floor(cycles); i++) {
    const worker = workers[i % workers.length];
    for (const wordId of wordIds) recordCraft(s, worker, wordId);
  }
  for (const worker of workers) evaluateDiscoveries(s, worker);
}

function produceCity(s: GameState, c: City, spentCycles = 0) {
  const inv = inventoryFor(s, c),
    effects = getDogmaEffects(doctrineFor(s, c.factionId, c)),
    buildings = cityBuildings(s, c),
    season = endedSeason(s);
  allocateCityWorkers(s, c);
  c.production = emptyInventory();
  const vocation = c.vocations.flatMap((v) => v.tokens),
    workshop = buildings.some(
      (b) => b.kind === 'workshop' && b.active && (b.lastEfficiency ?? 0) > 0,
    )
      ? 3
      : 1,
    republic = c.factionId === PLAYER && s.government === 'republic' ? 1.25 : 1;
  let mintedCoin = 0;
  for (const b of buildings.filter((z) => z.active)) {
    const efficiency = b.lastEfficiency ?? 0,
      producedResource: Resource =
        b.kind === 'farm'
          ? 'food'
          : b.kind === 'pen'
            ? 'meat'
            : b.kind === 'foundry'
              ? (b.productionMode ?? 'ingot')
              : b.kind === 'market'
                ? 'coin'
                : 'stone',
      ctx = getDogmaEffects(doctrineFor(s, c.factionId, c), {
        tokens: ['S_09', ...BUILDING_SPECS[b.kind].recipe],
        subjectId: buildingSelector(s, c, b),
        resource: producedResource,
      }),
      base = efficiency * ctx.production * republic;
    if (b.kind === 'farm' && season === 2) {
      const drought = s.disasters.drought && workshop === 1 ? 0.5 : 1;
      addCityResource(
        s,
        c,
        'food',
        50 *
          base *
          ctx.agriculture *
          (c.factionId === PLAYER ? imperialLawEffects(s).agricultureMultiplier : 1) *
          workshop *
          (vocation.includes('V_09') ? 1.5 : 1) *
          drought,
      );
    }
    if (b.kind === 'pen' && (b.livestock ?? 0) > 0) {
      addCityResource(s, c, 'meat', 20 * base * ctx.herding);
      addCityResource(s, c, 'pelt', 5 * base * ctx.herding);
    }
    if (b.kind === 'foundry' && efficiency > 0) {
      const forgeWork = c.factionId === PLAYER ? 0 : takeForeignForgeWork(s, b.id),
        mode = b.productionMode ?? 'ingot',
        workBudget =
          (Math.max(0, 90 * efficiency - forgeWork) / 5) *
          ctx.production *
          republic *
          (vocation.includes('V_12') ? 1.5 : 1);
      if (mode === 'ingot') {
        const output = Math.min(inv.ore, inv.wood / 2, workBudget);
        if (output > 0) {
          inv.ore -= output;
          inv.wood -= output * 2;
          const stored = addCityResource(s, c, 'ingot', output);
          // Materials for a refused output remain available instead of vanishing at capacity.
          inv.ore += output - stored;
          inv.wood += (output - stored) * 2;
          recordUrbanCraft(s, c, b, stored, ['V_12', 'O_13']);
        }
      } else {
        const cycles = Math.min(Math.floor(inv.ingot), Math.floor(workBudget));
        let completed = 0;
        for (let cycle = 0; cycle < cycles; cycle++) {
          inv.ingot--;
          const stored = addCityResource(s, c, mode, mode === 'coin' ? 100 : 1);
          if (stored < (mode === 'coin' ? 100 : 1)) {
            inv[mode] -= stored;
            c.production[mode] -= stored;
            inv.ingot++;
            break;
          }
          completed++;
        }
        if (completed) {
          recordUrbanCraft(s, c, b, completed, [mode === 'coin' ? 'O_12' : 'V_12', 'O_13']);
          if (c.factionId === PLAYER) {
            const tokens = ['S_09', 'V_12', 'O_07', mode === 'coin' ? 'O_08' : 'V_03'];
            recordLawWork(
              s,
              c.id,
              tokens,
              completed * (mode === 'coin' ? 100 : 1),
              Math.max(0, Math.floor(s.time / 90) * 90 - 1e-6),
            );
          }
          if (mode === 'coin') mintedCoin += completed * 100;
        }
      }
      if (
        c.factionId === PLAYER &&
        inv.metalArms >= 20 &&
        s.traditions.some((tradition) => tradition.tokens.includes('S_03'))
      ) {
        for (const worker of activeUnits(s).filter((u) => b.workerIds?.includes(u.id))) {
          recordEvent(s, worker, 'ENV_MILITARY', 100, ['S_08'], 60);
          evaluateDiscoveries(s, worker);
        }
      }
    }
    if (b.kind === 'market' && efficiency > 0) {
      for (const r of RESOURCES.filter((k) => RESOURCE_SPECS[k].category !== 'currency')) {
        const limit = cityCapacity(s, c, r) * 0.8;
        if (inv[r] > limit) {
          const excess = (inv[r] - limit) * Math.min(1, efficiency),
            revenue =
              excess *
              (vocation.includes('V_11') ? 1.35 : 1) *
              effects.trade *
              (c.factionId === PLAYER ? imperialLawEffects(s).tradeMultiplier : 1);
          inv[r] -= excess;
          inv.coin += revenue;
          c.production.coin += revenue;
        }
      }
    }
    if (b.kind === 'temple' && c.factionId === PLAYER)
      s.attention = Math.min(effects.attentionCap, s.attention + 20 * efficiency);
    if (b.kind === 'archive' && efficiency > 0 && c.factionId === PLAYER && !ctx.writingForbidden) {
      for (const m of Object.values(s.words))
        m.support = Math.max(m.support ?? 0, efficiency >= 1 ? 1 : efficiency);
      recordUrbanCraft(s, c, b, (90 * efficiency) / 5, ['O_14', 'V_14']);
    }
    if (b.kind === 'school' && efficiency > 0) {
      for (const u of activeUnits(s).filter((u) => u.cityId === c.id && u.age < 4))
        u.intelligence = Math.min(10, (u.initialIntelligence ?? u.intelligence) + 2 * efficiency);
    }
  }
  // Unassigned workers use the same 2-second extraction cycle as village labour.
  const workforce = workingCityCohorts(s, c),
    occupied = buildings.reduce(
      (n, b) => n + BUILDING_SPECS[b.kind].workers * (b.lastEfficiency ?? 0),
      0,
    ),
    free = Math.max(0, workforce.workers + workforce.slaves - occupied),
    nodes = s.entities.filter(
      (e) =>
        Math.floor(e.x / 100) === c.sectorX &&
        Math.floor(e.y / 100) === c.sectorY &&
        ['tree', 'stone', 'ore'].includes(e.kind) &&
        e.amount > 0,
    );
  let cycles = Math.max(0, (free * 90) / IMPERIAL_ASSUMPTIONS.extractionCycleSeconds - spentCycles);
  for (const node of nodes) {
    const r: Resource = node.kind === 'tree' ? 'wood' : node.kind === 'ore' ? 'ore' : 'stone',
      token = node.kind === 'tree' ? 'O_03' : node.kind === 'ore' ? 'O_07' : 'O_02',
      scoped = doctrineFor(s, c.factionId, c),
      tokens = ['S_01', 'V_04', token],
      local = getDogmaEffects(scoped, { tokens, resource: r, subjectId: 'S_01' }),
      protectedNode =
        sanctuaryProtected(scoped, token, node) ||
        !!forbiddenByDogma(scoped, tokens, { type: 'entity', id: node.id, x: node.x, y: node.y }),
      available = protectedNode
        ? 0
        : Math.min(Math.max(0, node.amount - resourcePreservationFloor(scoped, node)), cycles),
      produced = addCityResource(s, c, r, available * local.production * workshop);
    node.amount -= Math.min(node.amount, produced);
    cycles -= produced;
    const faction = s.factions.find((f) => f.id === c.factionId);
    if (faction && produced > 0) {
      if (node.kind === 'tree') foreignEvent(s, faction, 'ENV_TREE_NODE', 50, ['O_03']);
      if (node.kind === 'stone') foreignEvent(s, faction, 'ENV_ROCK_NODE', 50, ['O_02']);
      for (let i = 0; i < Math.floor(produced); i++)
        foreignEvent(
          s,
          faction,
          'ENV_CRAFT',
          20,
          node.kind === 'stone' ? ['V_06'] : node.kind === 'tree' ? ['V_08', 'V_05'] : ['V_12'],
          true,
        );
    }
    if (cycles <= 0) break;
  }
  if (c.factionId === PLAYER) {
    const stamp = Math.max(0, Math.floor(s.time / 90) * 90 - 1e-6);
    if (c.production.food > 0)
      recordLawWork(s, c.id, ['S_09', 'V_09', 'O_04', 'O_01'], c.production.food, stamp);
    if (c.production.meat > 0)
      recordLawWork(s, c.id, ['S_09', 'V_10', 'O_04', 'O_01'], c.production.meat, stamp);
    if (c.production.ingot > 0)
      recordLawWork(s, c.id, ['S_09', 'V_12', 'O_07', 'O_05'], c.production.ingot, stamp);
    if (c.production.coin > mintedCoin)
      recordLawWork(s, c.id, ['S_09', 'V_11', 'O_12'], c.production.coin - mintedCoin, stamp);
    if (buildings.some((b) => b.kind === 'archive' && b.active && (b.lastEfficiency ?? 0) > 0))
      recordLawWork(s, c.id, ['S_09', 'V_05', 'O_09', 'M_02'], 1, stamp);
  }
  if (c.factionId === PLAYER && vocation.includes('O_09'))
    s.attention = Math.min(effects.attentionCap, s.attention + 30);
}

function cityNutritionAndBirths(s: GameState, c: City) {
  const population = cityPopulation(c),
    represented = activeUnits(s).filter((u) => u.cityId === c.id).length,
    unrepresented = Math.max(0, population - represented),
    inv = inventoryFor(s, c);
  const fullNeed =
      unrepresented *
      90 *
      0.8 *
      (c.factionId === PLAYER ? imperialLawEffects(s).foodConsumptionMultiplier : 1),
    foraged = c.seasonFoodConsumed ?? 0,
    needed = Math.max(0, fullNeed - foraged),
    provided = consumeNutrition(inv, needed);
  c.seasonFoodConsumed = provided + foraged;
  if (needed > provided && unrepresented > 0) {
    const hungerMissing = (needed - provided) / unrepresented,
      deaths = Math.min(
        unrepresented,
        Math.floor((Math.max(0, hungerMissing - 20) / 100) * unrepresented),
      );
    if (deaths) {
      removePopulation(c, deaths);
      s.stats.deaths += deaths;
      if (c.factionId === PLAYER) s.cohesion = clamp(s.cohesion - 18);
    }
  }
  const effects = getDogmaEffects(doctrineFor(s, c.factionId, c)),
    hut = cityHas(s, c, 'hut') ? SPEC_ASSUMPTIONS.hutBirthBonus : 0;
  const fertile =
    activeUnits(s).filter(
      (u) =>
        u.cityId === c.id &&
        u.age >= 4 &&
        u.age < 14 &&
        u.hunger <= 50 &&
        !(effects.celibateSages && u.intelligence >= 7),
    ).length + unrepresented;
  if ((needed - provided) / Math.max(1, unrepresented) > 50) return;
  const chance =
    birthProbability(cityPopulation(c), c.housing, hut, effects.birthAdd) *
    effects.growth *
    (c.factionId === PLAYER
      ? imperialLawEffects(s).birthMultiplier * guidedBirthMultiplier(s, c.id)
      : 1);
  let births = 0;
  for (
    let pair = 0;
    pair < Math.floor(fertile / 2) && cityPopulation(c) + births < c.housing;
    pair++
  )
    if (random(s) < chance) births++;
  c.cohorts.workers += births;
  if (c.factionId === PLAYER) {
    s.stats.births += births;
    // These identities represent births already counted in the worker cohort.
    // A city must retain future pupils and discovery actors after its founders age.
    // Use an independent metadata hash so names/sex/stats do not redraw birth rolls.
    const parents = pairFertileUnits(
      activeUnits(s).filter(
        (u) =>
          u.cityId === c.id &&
          u.age >= 4 &&
          u.age < 14 &&
          u.hunger <= 50 &&
          !(effects.celibateSages && u.intelligence >= 7),
      ),
    );
    let living = activeUnits(s).length;
    for (
      let index = 0;
      index < births && living < IMPERIAL_ASSUMPTIONS.maximumLivingUrbanIdentities;
      index++, living++
    ) {
      const pair = parents.length ? parents[index % parents.length] : undefined;
      const id = nextId(s, 'unit');
      let hash = s.seed >>> 0;
      for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
      const sex = hash % 2 ? 'F' : 'M';
      const strength = clamp(
        (pair ? (pair[0].strength + pair[1].strength) / 2 : 5) + ((hash >>> 1) % 2 ? 1 : -1),
        1,
        10,
      );
      const intelligence = clamp(
        (pair ? (pair[0].intelligence + pair[1].intelligence) / 2 : 5) +
          ((hash >>> 2) % 2 ? 1 : -1),
        1,
        10,
      );
      const child: Unit = {
        id,
        name: newbornName(s, sex),
        sex,
        parentIds: pair ? [pair[0].id, pair[1].id] : undefined,
        bornAt: s.time,
        x: c.x,
        y: c.y,
        hp: 60,
        hunger: 10,
        temp: 100,
        age: 0,
        strength,
        intelligence,
        initialStrength: strength,
        initialIntelligence: intelligence,
        action: 'idle',
        progress: 0,
        knows: [...INNATE_WORDS],
        isolation: 0,
        caste: 'citizen',
        factionId: PLAYER,
        cityId: c.id,
        eventMemory: [],
        tension: {},
        cooldowns: {},
      };
      s.units.push(child);
      for (const word of INNATE_WORDS) if (s.words[word]) s.words[word].custodians.push(id);
      if (child.parentIds)
        recordTribeEvent(s, { kind: 'birth', unitId: id, parentIds: child.parentIds });
      log(s, `${child.name} nasce a ${c.name}.`, 'good');
    }
  }
}

function payArmyUpkeep(s: GameState) {
  for (const b of s.battalions.filter((z) => z.hp > 0)) {
    const c = s.cities.find((city) => city.id === b.cityId),
      inv = c ? inventoryFor(s, c) : s.resources,
      coinInventory = b.factionId === PLAYER ? s.resources : inv,
      coinKnown =
        b.factionId === PLAYER
          ? hasWord(s, 'O_12')
          : (s.factions.find((f) => f.id === b.factionId)?.words.includes('O_12') ?? false),
      internal = s.cities.some(
        (city) =>
          city.factionId === b.factionId &&
          city.sectorX === Math.floor(b.x / 100) &&
          city.sectorY === Math.floor(b.y / 100),
      ),
      factor = internal ? armyEffects(s, b).upkeep : 1,
      food = (coinKnown ? 20 : 30) * factor;
    const feudal =
        b.factionId === PLAYER &&
        s.laws.some((l) => l.verbId === 'V_13' && l.sanctionId === 'M_04') &&
        ['attacking', 'conquering'].includes(b.action),
      coin = coinKnown && !feudal ? 10 * factor : 0;
    if (foodCost(inv, food) && coinInventory.coin >= coin) {
      takeFood(inv, food);
      coinInventory.coin -= coin;
    } else {
      const previous = b.hp;
      b.morale = Math.max(0, b.morale * 0.7);
      b.hp = Math.max(0, b.hp - 250);
      loseSoldiers(s, b, previous);
      if (b.factionId === PLAYER)
        log(
          s,
          'Un battaglione non riceve cibo e paga: perde morale e 250 punti salute.',
          'warning',
        );
    }
  }
}

function taxCities(s: GameState) {
  const cap = capital(s);
  if (!cap) return;
  const taxes = s.laws.filter((l) => l.verbId === 'V_04' && l.objectId === 'O_11');
  if (!taxes.length) return;
  for (const city of ownCities(s).filter((c) => c.id !== cap.id))
    for (const law of taxes) {
      if (!lawSubjectMatches(s, law, city)) continue;
      const r = resourceFromTokens([law.modifierId]),
        inventory = inventoryFor(s, city),
        production = city.production[r],
        required = production * 0.25;
      const understands = law.tokens.every((w) => city.words.includes(w)),
        intelligibility = getIntelligibility(s, city.words) / 100;
      if (!understands) {
        city.revoltTension = clamp(city.revoltTension + 10);
        log(s, `${city.name} non comprende interamente il codice tributario.`, 'warning');
      }
      const payable = Math.min(inventory[r], required) * (understands ? 1 : intelligibility);
      if (payable > 0) {
        inventory[r] -= payable;
        const load = emptyInventory();
        load[r] = payable;
        const car = makeCaravan(
          s,
          'tax',
          city,
          { type: 'city', id: cap.id, x: cap.x, y: cap.y },
          load,
        );
        const d = Math.abs(city.sectorX - cap.sectorX) + Math.abs(city.sectorY - cap.sectorY);
        car.corruption =
          corruptionRate(d, cityHas(s, city, 'court'), hasWord(s, 'O_13')) *
          getDogmaEffects(s).corruption;
        city.corruption = car.corruption;
        city.lastTax = payable;
        city.loyalty = Math.min(100, city.loyalty + 2);
      }
      if (payable + 1e-9 < required) {
        city.revoltTension = clamp(city.revoltTension + 25);
        if (law.sanctionId === 'S_06') {
          const deficit = Math.max(0, required - payable),
            price = r === 'ingot' ? 100 : r === 'coin' ? 1 : 1;
          const count = Math.min(
            city.cohorts.workers,
            Math.ceil((deficit * price) / IMPERIAL_ASSUMPTIONS.fiscalValuePerBondedCitizen),
          );
          for (let i = 0; i < count; i++) applySanction(s, law, undefined, city);
          s.eventTimes[`fiscalDeficit:${city.id}`] = deficit * price;
        } else applySanction(s, law, undefined, city);
      }
    }
}

function applySeasonalLaws(s: GameState) {
  const settled = {
    ...s,
    time: Math.max(0, Math.floor(s.time / 90) * 90 - 1e-6),
  };
  const legal = imperialLawEffects(settled);
  for (const law of s.laws) {
    law.age++;
    if (law.objectId === 'O_11' && law.verbId === 'V_04') continue;
    const archetype = lawArchetype(law);
    if (archetype === 'draconian_theft') {
      const poor = activeUnits(s).filter((u) => (u.wealth ?? 0) <= 0),
        count = Math.floor(poor.length * 0.01);
      for (const u of poor.slice(0, count)) killByLaw(s, u);
      if (count) s.revoltTension = clamp(s.revoltTension + 5);
      continue;
    }
    if (law.prohibitive) continue;
    const targets: (Unit | City | Battalion)[] =
      law.subjectId === 'S_08'
        ? s.battalions.filter((b) => b.factionId === PLAYER && b.hp > 0)
        : s.urbanized && ['S_01', 'S_09'].includes(law.subjectId)
          ? ownCities(s)
          : s.units.filter((u) => u.hp > 0 && lawSubjectMatches(s, law, u));
    let fulfilledAny = false;
    for (const t of targets) {
      const fulfilled = seasonalDutyFulfilled(settled, law, t);
      fulfilledAny ||= fulfilled;
      if ('cohorts' in t) applySanction(s, law, undefined, t, fulfilled);
      else if (!('maxHp' in t)) applySanction(s, law, t, undefined, fulfilled);
      else if (fulfilled && law.sanctionId === 'M_05') {
        s.eventTimes[`lawful:${law.id}:${t.id}`] =
          (s.eventTimes[`lawful:${law.id}:${t.id}`] ?? 0) + 1;
      }
    }
    if (archetype === 'agrarian_reform' && fulfilledAny) {
      s.revoltTension = clamp(s.revoltTension - 20);
      for (const c of ownCities(s))
        if (seasonalDutyFulfilled(settled, law, c)) c.revoltTension = clamp(c.revoltTension - 20);
    }
  }
  if (legal.winterCorveeCohesionCost)
    s.cohesion = clamp(s.cohesion - legal.winterCorveeCohesionCost);
}
function teachProvinces(s: GameState) {
  for (const city of s.cities.filter(
    (c) =>
      !c.capital &&
      c.factionId !== 'ruins' &&
      c.assimilation.active &&
      c.assimilation.delegateCount > 0 &&
      c.cohorts.sages > 0,
  )) {
    const foreign = city.factionId !== PLAYER;
    const host = s.factions.find((f) => f.id === city.factionId);
    const hostDoctrine = getDogmaEffects(doctrineFor(s, city.factionId, city));
    if (
      getDogmaEffects(s).isolated ||
      getDogmaEffects(s).writingForbidden ||
      hostDoctrine.isolated ||
      hostDoctrine.writingForbidden
    )
      continue;
    if (
      foreign &&
      (!host || host.hostile || host.relation < IMPERIAL_ASSUMPTIONS.peacefulDelegationRelation)
    )
      continue;
    const missing = known(s)
      .filter((w) => !city.words.includes(w))
      .slice(0, 2);
    city.words.push(...missing);
    const originalFaction = host ?? s.factions.find((f) => f.cityId === city.id);
    if (originalFaction) {
      originalFaction.words = [...new Set([...originalFaction.words, ...city.words])];
      originalFaction.intelligibility = getIntelligibility(s, originalFaction.words);
    }
    // A peaceful school shares vocabulary, never imposes the player's religion.
    if (foreign) {
      log(
        s,
        `${city.name} apprende ${missing.length} parole attraverso la delegazione pacifica.`,
        'good',
      );
      continue;
    }
    if (
      city.dogmas.length &&
      !s.dogmas.some(
        (d) => d.targetId === city.dogmas[0].targetId && d.vectorId === city.dogmas[0].vectorId,
      )
    )
      city.dogmas.shift();
    else if (city.dogmas.length < s.dogmas.length)
      city.dogmas.push(copy(s.dogmas[city.dogmas.length]));
    city.revoltTension = Math.max(0, city.revoltTension - missing.length * 2);
    log(s, `${city.name} apprende ${missing.length} parole della capitale.`, 'good');
  }
}
function theftAndInequality(s: GameState) {
  if (!hasWord(s, 'M_04')) return;
  const units = activeUnits(s),
    avg = units.reduce((n, u) => n + (u.wealth ?? 0), 0) / Math.max(1, units.length),
    rich = units.filter((u) => (u.wealth ?? 0) > avg).length;
  s.inequality = clamp(s.inequality + rich * 0.5);
  const immune =
    imperialLawEffects(s).theftMultiplier === 0 ||
    getDogmaEffects(s).collectiveFood ||
    s.laws.some(
      (l) =>
        l.prohibitive && l.verbId === 'V_05' && l.objectId === 'M_04' && l.sanctionId === 'O_06',
    );
  const court = playerHas(s, 'court') ? 0.5 : 1;
  if (!immune && s.inequality >= 40 && random(s) < ((s.inequality - 30) / 100) * court) {
    s.cohesion = clamp(s.cohesion - 5);
    const thief = units.find((u) => (u.wealth ?? 0) < avg);
    if (thief && s.resources.coin >= 1) {
      s.resources.coin--;
      thief.wealth = (thief.wealth ?? 0) + 1;
    }
    s.recentTrauma = { tag: 'ENV_THEFT', time: s.time };
    for (const u of units) {
      u.eventMemory ??= [];
      u.eventMemory.push({ tag: 'ENV_THEFT', time: s.time, weight: 20, wordIds: ['C_03'] });
    }
    log(s, 'Un furto divide la comunità. La coesione perde cinque punti.', 'warning');
  }
}
function foreignEvent(
  s: GameState,
  f: Faction,
  tag: string,
  weight: number,
  wordIds: string[],
  craft = false,
) {
  f.eventMemory ??= [];
  f.tension ??= {};
  f.craftCycles ??= {};
  f.eventMemory.push({ tag, time: s.time, weight: craft ? 0 : weight, wordIds });
  f.eventMemory = f.eventMemory.filter((e) => s.time - e.time <= 60);
  if (craft)
    for (const word of wordIds) {
      f.craftCycles[word] = (f.craftCycles[word] ?? 0) + 1;
      f.tension[word] = (f.tension[word] ?? 0) + 20;
    }
}
function foreignComprehension(s: GameState, f: Faction, c: City) {
  const tension = cognitiveTension(
    f.eventMemory ?? [],
    IMPERIAL_ASSUMPTIONS.foreignRepresentativeIntelligence,
    s.time,
  );
  for (const [id, word] of Object.entries(WORDS)) {
    if (f.words.includes(id)) continue;
    const recipes = [word.recipe, ...(word.alternatives ?? [])];
    if (!recipes.some((recipe) => recipe.every((w) => f.words.includes(w)))) continue;
    const witnessed = (f.eventMemory ?? []).some((e) => e.wordIds.includes(id));
    if (!witnessed) continue;
    if (tension + (f.tension?.[id] ?? 0) < 100) continue;
    f.words.push(id);
    if (!c.words.includes(id)) c.words.push(id);
    if (f.tension) f.tension[id] = 0;
    // The AI solves the same already-witnessed recipe, rather than buying technology.
    if (id === 'S_06' && getDogmaEffects({ ...s, dogmas: f.dogmas }).slaveryForbidden)
      f.words = f.words.filter((w) => w !== id);
  }
}
/** Foreign food and crafts share the same finite unassigned worker budget.
 * Meals may be eaten where harvested; only physical surplus enters the stores. */
function prepareForeignEconomy(s: GameState, c: City, f: Faction) {
  const inv = c.resources,
    localNode = (e: { x: number; y: number }) =>
      Math.floor(e.x / 100) === c.sectorX && Math.floor(e.y / 100) === c.sectorY,
    nodes = s.entities
      .filter((e) => {
        if (localNode(e)) return true;
        if (
          distance(e, c) > 90 ||
          (Math.floor(e.x / 100) === Math.floor(s.home.x / 100) &&
            Math.floor(e.y / 100) === Math.floor(s.home.y / 100))
        )
          return false;
        const owner = s.cities.find(
          (city) =>
            city.sectorX === Math.floor(e.x / 100) &&
            city.sectorY === Math.floor(e.y / 100) &&
            city.factionId !== 'ruins',
        );
        return !owner || owner.factionId === c.factionId;
      })
      .sort(
        (a, b) => Number(localNode(b)) - Number(localNode(a)) || distance(a, c) - distance(b, c),
      ),
    season = endedSeason(s),
    loadSize = f.words.includes('O_13') ? 5 : f.words.includes('V_05') ? 3 : 1,
    travelCycles = (e: { x: number; y: number }) =>
      localNode(e) ? 0 : (2 * distance(e, c)) / 4 / IMPERIAL_ASSUMPTIONS.extractionCycleSeconds;
  allocateCityWorkers(s, c);
  const occupied = cityBuildings(s, c).reduce(
      (n, b) => n + BUILDING_SPECS[b.kind].workers * (b.lastEfficiency ?? 0),
      0,
    ),
    available = workingCityCohorts(s, c),
    workforce = available.workers + available.slaves,
    initialCycles =
      (Math.max(0, workforce - occupied) * 90) / IMPERIAL_ASSUMPTIONS.extractionCycleSeconds,
    population = cityPopulation(c),
    fullNeed = population * 90 * 0.8;
  let cycles = initialCycles,
    reservedNew = 0;
  const previousNutrition = FOOD.reduce((n, r) => n + inv[r] * RESOURCE_SPECS[r].nutrition, 0);
  if (previousNutrition < fullNeed) foreignEvent(s, f, 'ENV_STARVATION', 15, ['M_02']);
  // Reserve real vegetables for the next winter's herd upkeep, accounting for
  // the intervening spoilage. Surplus meat cannot pay a vegetable requirement.
  let vegetableTarget =
    f.words.includes('V_05') && season !== 3
      ? (BUILDING_SPECS.pen.upkeep.food ?? 0) *
        Math.max(1, cityBuildings(s, c).filter((b) => b.kind === 'pen').length)
      : 0;
  for (let future = season + 1; future < 3; future++)
    vegetableTarget /=
      1 -
      resourceSpoilage(
        RESOURCE_SPECS.food.spoil,
        future === 1,
        cityHas(s, c, 'storage'),
        inv.pottery > 0,
      );
  const reservedVegetables = Math.min(inv.food, vegetableTarget);
  inv.food -= reservedVegetables;
  c.seasonFoodConsumed = consumeNutrition(inv, fullNeed);
  inv.food += reservedVegetables;
  let needed = Math.max(0, fullNeed - c.seasonFoodConsumed);
  const expectedHarvest = cityBuildings(s, c).reduce(
    (n, b) =>
      n +
      (b.kind === 'pen' && (b.livestock ?? 0) > 0
        ? 20 * 40
        : b.kind === 'farm' && season === 2
          ? 50 * 25
          : 0) *
        (b.lastEfficiency ?? 0),
    0,
  );
  const foodRoom = () =>
    Math.max(
      0,
      cityCapacity(s, c, 'food') -
        RESOURCES.filter((r) => RESOURCE_SPECS[r].category === 'food').reduce(
          (n, r) => n + inv[r],
          0,
        ),
    );
  const wantedNutrition = (vegetables = false) =>
    Math.max(
      0,
      Math.max(0, needed - expectedHarvest) +
        (f.words.includes('V_05') && cityHas(s, c, 'storage') ? population * 90 * 0.8 : 0) -
        FOOD.reduce((n, r) => n + inv[r] * RESOURCE_SPECS[r].nutrition, 0),
    ) + (vegetables ? Math.max(0, vegetableTarget - inv.food) * 25 : 0);
  const physicalDelivery = (amount: number) => {
    for (let i = 0; i < Math.floor(amount); i++)
      foreignEvent(s, f, 'ENV_CRAFT', 20, ['V_04', 'V_05', 'V_08', 'V_10'], true);
  };
  const feedOrStore = (resource: 'food' | 'meat' | 'cooked', amount: number) => {
    const protectedFood =
      resource === 'food'
        ? addCityResource(s, c, 'food', Math.min(amount, Math.max(0, vegetableTarget - inv.food)))
        : 0;
    const nutrition = RESOURCE_SPECS[resource].nutrition,
      eaten = Math.min(amount - protectedFood, Math.max(0, needed - expectedHarvest) / nutrition);
    needed = Math.max(0, needed - eaten * nutrition);
    c.seasonFoodConsumed = (c.seasonFoodConsumed ?? 0) + eaten * nutrition;
    const stored = addCityResource(s, c, resource, amount - eaten - protectedFood);
    return eaten + stored + protectedFood;
  };
  const harvest = (node: GameState['entities'][number], resource: 'food' | 'meat') => {
    const nutrition = RESOURCE_SPECS[resource].nutrition,
      appetite = Math.max(0, wantedNutrition(resource === 'food'));
    if (appetite <= 0 || cycles < 1) return 0;
    let amount = Math.min(
      node.amount,
      Math.ceil(appetite / nutrition),
      Math.floor(cycles),
      Math.ceil(needed / nutrition) + Math.floor(foodRoom()),
    );
    while (amount > 0 && amount + travelCycles(node) * Math.ceil(amount / loadSize) > cycles)
      amount--;
    if (amount <= 0) return 0;
    const tripWork = travelCycles(node) * Math.ceil(amount / loadSize);
    let raw = amount;
    if (resource === 'meat' && cityHas(s, c, 'campfire') && inv.wood >= 1) {
      const cooked = Math.min(
        raw,
        Math.floor(inv.wood),
        Math.max(0, Math.floor(cycles - amount - tripWork)),
      );
      if (cooked > 0) {
        inv.wood -= cooked;
        raw -= cooked;
        cycles -= cooked;
        feedOrStore('cooked', cooked);
        for (let i = 0; i < cooked; i++)
          foreignEvent(s, f, 'ENV_CRAFT', 20, ['V_07', 'V_12'], true);
      }
    }
    const received = feedOrStore(resource, raw) + (amount - raw);
    node.amount = Math.max(0, node.amount - received);
    cycles -= received + tripWork;
    physicalDelivery(received);
    if (resource === 'meat') {
      foreignEvent(s, f, 'ENV_HUNT_MEAL', 100, ['O_04']);
      for (let i = 0; i < Math.floor(received); i++)
        foreignEvent(s, f, 'ENV_CRAFT', 20, ['O_04'], true);
    } else {
      foreignEvent(s, f, 'ENV_FORAGE_NODE', 50, ['V_04']);
      if (f.words.includes('V_04'))
        for (let i = 0; i < Math.floor(received); i++)
          if (random(s) < 0.1) addCityResource(s, c, 'seed', 1);
    }
    foreignComprehension(s, f, c);
    return received;
  };
  for (const node of nodes.filter((e) => e.kind === 'berries' && e.amount > 0 && season !== 3))
    harvest(node, 'food');
  // A leftover carcass remains a real food source; no second hunt is necessary.
  for (const prey of nodes.filter((e) => e.kind === 'deer' && e.hp <= 0 && e.amount > 0))
    harvest(prey, 'meat');
  for (const prey of nodes.filter((e) => e.kind === 'deer' && e.hp > 0 && !e.domesticated)) {
    if (wantedNutrition() <= 0 || cycles < 1) break;
    if (
      f.words.includes('V_10') &&
      nodes.filter((e) => e.kind === 'deer' && e.hp > 0 && !e.domesticated).length <= 1
    )
      break;
    const attacks = Math.ceil(prey.hp / effectiveDamage(inv.spear >= 1 ? 15 : 5, 5));
    if (cycles < attacks + 1 + travelCycles(prey)) continue;
    cycles -= attacks;
    prey.hp = 0;
    if (inv.spear >= 1) inv.spear = Math.max(0, inv.spear - 0.05);
    if (f.words.includes('V_06')) addCityResource(s, c, 'pelt', 1);
    harvest(prey, 'meat');
  }
  if (needed > expectedHarvest) foreignEvent(s, f, 'ENV_STARVATION', 15, ['M_02']);
  if (c.seasonFoodConsumed > 0) foreignEvent(s, f, 'ENV_NIGHTFALL', 25, ['C_01']);
  if (s.nightCount >= 3) foreignEvent(s, f, 'ENV_SLEEP_CLUSTER', 100, ['O_01']);
  if (season === 0 && inv.seed > 0) foreignEvent(s, f, 'ENV_SEED_SPROUT', 60, ['V_09']);
  foreignComprehension(s, f, c);
  const make = (kind: BuildingKind, maximum = 1) => {
    const spec = BUILDING_SPECS[kind],
      existing = cityBuildings(s, c).filter((b) => b.kind === kind);
    if (existing.length >= maximum || !canPay(inv, spec.cost)) return false;
    const animal =
      kind === 'pen'
        ? nodes.find((e) => e.kind === 'deer' && e.hp > 0 && !e.domesticated)
        : undefined;
    if (kind === 'pen' && !animal) return false;
    const work = Math.min(spec.workers * 45, Math.max(0, initialCycles - reservedNew));
    const animalTravel = animal ? travelCycles(animal) : 0;
    if (cycles < 2.5 + work + animalTravel) return false;
    cycles -= 2.5 + work + animalTravel;
    reservedNew += work;
    pay(inv, spec.cost);
    const b: Building = {
      id: nextId(s, 'foreign-building'),
      kind,
      x: c.x + 5,
      y: c.y + 5,
      hp: spec.maxHp,
      active: true,
      completed: true,
      workerIds: [],
      cityId: c.id,
      livestock: animal ? 1 : undefined,
    };
    if (animal) {
      animal.domesticated = true;
      animal.x = b.x;
      animal.y = b.y;
    }
    s.buildings.push(b);
    c.buildingIds.push(b.id);
    c.housing += spec.housing ?? 0;
    foreignEvent(s, f, 'ENV_CRAFT', 20, ['V_08'], true);
    return true;
  };
  // A real food source takes priority over spending its last construction wood
  // on stores and heat. The next extraction shift can then fund infrastructure.
  if (f.words.includes('V_10')) make('pen', Math.max(1, Math.ceil((population * 72) / 800)));
  if (f.words.includes('V_05')) {
    make('storage');
    make('depot');
  }
  if (f.words.includes('O_05')) make('campfire');
  if (f.words.includes('V_09')) make('farm', Math.max(1, Math.ceil((population * 288) / 1250)));
  if (f.words.includes('V_12')) make('foundry');
  if (f.words.includes('O_09')) make('archive');
  if (f.words.includes('S_07')) make('palace');
  if (f.words.includes('O_14')) make('court');
  if (f.words.includes('V_14')) make('school');
  if (f.words.includes('V_06') && inv.stone >= 1 && cycles >= 1) {
    inv.stone--;
    inv.tool++;
    cycles--;
    foreignEvent(s, f, 'ENV_CRAFT', 20, ['O_05'], true);
  }
  if (cityHas(s, c, 'campfire') && inv.wood >= 10 && nodes.some((e) => e.kind === 'ore'))
    foreignEvent(s, f, 'ENV_HIGH_HEAT', 50, ['O_07']);
  if (cityHas(s, c, 'campfire') && inv.meat >= 1 && inv.wood >= 1 && cycles >= 1) {
    const cooked = Math.min(Math.floor(inv.meat), Math.floor(inv.wood), Math.floor(cycles), 5);
    inv.meat -= cooked;
    inv.wood -= cooked;
    cycles -= cooked;
    const made = addCityResource(s, c, 'cooked', cooked);
    // Both inputs and food space were freed; no output can overflow its stores.
    if (made < cooked) inv.meat += cooked - made;
    for (let i = 0; i < made; i++) foreignEvent(s, f, 'ENV_CRAFT', 20, ['V_07', 'V_12'], true);
  }
  if (f.words.includes('O_12') && inv.ingot >= 1 && cycles >= 1) {
    inv.ingot--;
    inv.coin += 100;
    cycles--;
    foreignEvent(s, f, 'ENV_CRAFT', 20, ['O_08'], true);
  }
  foreignComprehension(s, f, c);
  return Math.max(0, initialCycles - cycles - reservedNew);
}

function maintainForeignCity(s: GameState, c: City) {
  const effects = getDogmaEffects(doctrineFor(s, c.factionId, c)),
    season = endedSeason(s);
  for (const b of cityBuildings(s, c)) {
    const spec = BUILDING_SPECS[b.kind];
    if (spec.upkeepSeason !== undefined && spec.upkeepSeason !== season) continue;
    const cost = Object.fromEntries(
      Object.entries(spec.upkeep).map(([r, n]) => [r, n * effects.upkeep]),
    ) as Partial<Inventory>;
    if (canPay(c.resources, cost)) {
      pay(c.resources, cost);
      b.active = true;
    } else {
      b.active = false;
      b.hp = Math.max(0, b.hp - spec.maxHp * 0.2);
    }
  }
}
export function seasonalImperial(s: GameState) {
  bindCapital(s);
  condenseCities(s);
  for (const city of s.cities.filter((c) => c.factionId !== 'ruins')) {
    city.seasonFoodConsumed = 0;
    if (city.factionId !== PLAYER) maintainForeignCity(s, city);
    const inv = inventoryFor(s, city),
      summer = endedSeason(s) === 1;
    // Close spoilage of existing stocks before adding this boundary's harvest,
    // just as seasonalCore does for the capital and village stores.
    if (!city.capital) {
      for (const r of RESOURCES) {
        const base = RESOURCE_SPECS[r].spoil;
        if (base > 0) {
          const rate =
            RESOURCE_SPECS[r].category === 'food'
              ? resourceSpoilage(base, summer, cityHas(s, city, 'storage'), inv.pottery > 0)
              : base;
          inv[r] *= 1 - rate;
        }
      }
    }
    const faction = s.factions.find((f) => f.id === city.factionId),
      spentCycles =
        faction && city.factionId !== PLAYER ? prepareForeignEconomy(s, city, faction) : 0;
    produceCity(s, city, spentCycles);
    cityNutritionAndBirths(s, city);
    if (faction) foreignComprehension(s, faction, city);
  }
  for (const d of s.dogmas.filter((d) => d.reforming)) {
    const school = s.buildings.find(
      (b) =>
        b.kind === 'school' &&
        b.active &&
        b.hp > 0 &&
        (!b.cityId || ownCities(s).some((c) => c.id === b.cityId)) &&
        (b.cityId ? (b.lastEfficiency ?? 0) > 0 : (b.workerIds?.length ?? 0) > 0),
    );
    if (school && !imperialLawEffects(s).inquisition) {
      d.weight = Math.max(0, d.weight - 15);
      s.philosophy = true;
      if (d.weight === 0) s.eventTimes[`reformed:${d.id}`] = 1;
    }
  }
  for (const faction of s.factions) {
    const city = s.cities.find((c) => c.id === faction.cityId);
    if (city && city.factionId === PLAYER) faction.subjugated = true;
  }
  teachProvinces(s);
  applySeasonalLaws(s);
  if (imperialLawEffects(s).educationProgress >= 1) {
    for (const u of activeUnits(s).filter((u) => u.caste !== 'slave'))
      for (const id of known(s).filter((id) => WORDS[id].tier <= 1)) {
        if (!u.knows.includes(id)) u.knows.push(id);
        if (!s.words[id].custodians.includes(u.id)) s.words[id].custodians.push(u.id);
      }
  }
  taxCities(s);
  payArmyUpkeep(s);
  theftAndInequality(s);
  dispatchForeignPolicy(s);
  if (
    hasWord(s, 'O_12') &&
    activeUnits(s).some((u) => u.action === 'saving' && u.command?.includes('O_12'))
  )
    s.resources.coin *= 1.05;
  s.corruption = ownCities(s).length
    ? ownCities(s).reduce((n, c) => n + (c.corruption ?? 0), 0) / ownCities(s).length
    : 0;
  evaluateVictory(s, true);
}

export function evaluateVictory(s: GameState, seasonal = false) {
  if (s.victory || s.tier < 5) return;
  const cities = s.cities.filter((c) => c.factionId !== 'ruins'),
    owned = ownCities(s),
    allControlled =
      cities.length > 0 &&
      cities.every(
        (c) => c.factionId === PLAYER || s.factions.find((f) => f.id === c.factionId)?.subjugated,
      ),
    lowTension = s.revoltTension < 30 && owned.every((c) => c.revoltTension < 30);
  if (seasonal) {
    if (allControlled && lowTension && s.laws.length >= 5 && playerHas(s, 'palace'))
      s.victoryProgress.imperialSeasons++;
    else s.victoryProgress.imperialSeasons = 0;
  }
  if (s.victoryProgress.imperialSeasons >= 16) {
    s.victory = 'imperial';
    log(s, 'Pax Universalis: sedici stagioni di dominio, leggi e pace interna.', 'discovery');
    return;
  }
  const archive = s.buildings.some(
      (b) =>
        b.kind === 'archive' &&
        b.active &&
        b.hp > 0 &&
        (!b.cityId || owned.some((c) => c.id === b.cityId && c.capital)) &&
        (b.lastEfficiency ?? (b.workerIds?.length ?? 0) / 4) >= 1,
    ),
    allWords =
      Object.keys(WORDS).length === 45 &&
      Object.keys(WORDS).every((w) => s.words[w]?.retention === 100),
    lingua = s.factions.every((f) => getIntelligibility(s, f.words) >= 80);
  if (archive && allWords && lingua) {
    s.victory = 'cultural';
    log(
      s,
      'La Biblioteca Universale: quarantacinque parole, una memoria completa e una lingua condivisa.',
      'discovery',
    );
    return;
  }
  const noSlaves =
      activeUnits(s).every((u) => u.caste !== 'slave') &&
      owned.every((c) => c.cohorts.slaves === 0),
    targets = s.dogmaReformTargets ?? [],
    reformsComplete =
      s.philosophy &&
      s.dogmas.length === 0 &&
      targets.length > 0 &&
      targets.every((id) => s.eventTimes[`reformed:${id}`] === 1);
  if (reformsComplete && s.emancipated && noSlaves && s.cohesion >= 90) {
    s.victory = 'philosophical';
    log(
      s,
      'Il Grande Risveglio: libertà, ragione e coesione senza dogmi della paura.',
      'discovery',
    );
  }
}
