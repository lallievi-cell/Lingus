import { BUILDING_SPECS, emptyInventory, RESOURCE_ORDER } from './content';
import { effectiveElapsed, getCalendar, secondsForEffectiveDuration } from './calendar';
import { rememberCombatWound } from './damageAttribution';
import { dogmaDiplomaticPenalty, getDogmaEffects, protectedByDogma } from './dogmas';
import { effectiveDamage } from './math';
import { activeUnits, canPay, clamp, copy, distance, log, nextId, pay, totalFood } from './runtime';
import { killUnit, recordAttackTrauma } from './simulation';
import { combatEquipmentFor } from './unitEquipment';
import type { Caravan, City, Faction, ForeignRaid, GameState, Inventory, Unit } from './types';

/** Product extension: policy parameters, not formulas attributed to the GDD. */
export const FOREIGN_POLICY_ASSUMPTIONS = {
  minimumTier: 3,
  graceSeconds: 720,
  raidRelationThreshold: -60,
  raidIntervalSeconds: 360,
  raidMembers: 3,
  minimumRaidMembers: 2,
  minimumCivilianWorkers: 4,
  trainingFoodPerWarrior: 1,
  forgeCycleSeconds: 5,
  militaryArmsReserve: 20,
  raidProvisionPerMember: 1,
  raidLootPerMember: 2,
  raidWorkSeconds: 12,
  raidMaximumSeconds: 300,
  ultimatumIntervalSeconds: 360,
  ultimatumResponseSeconds: 45,
  tributeFood: 8,
  tributeCoins: 10,
  refusalRelationPenalty: 20,
  paymentPeaceSeconds: 270,
  foreignPairWarThreshold: -50,
  borderFrictionPerSeason: 5,
  expansionIntervalSeconds: 720,
  expansionWorkers: 30,
  expansionWood: 50,
  expansionStone: 50,
  expansionFood: 50,
  maximumForeignHousing: 68,
  maximumRaids: 12,
  maximumUltimata: 16,
  maximumRelations: 64,
} as const;

const FOOD = ['food', 'meat', 'cooked'] as const;
const liveCity = (city: City) =>
  city.factionId !== 'ruins' && Object.values(city.cohorts).some((n) => n > 0);
const ownCity = (state: GameState, faction: Faction) =>
  state.cities.find(
    (city) => city.id === faction.cityId && city.factionId === faction.id && liveCity(city),
  ) ?? state.cities.find((city) => city.factionId === faction.id && liveCity(city));
const ready = (state: GameState) =>
  state.tier >= FOREIGN_POLICY_ASSUMPTIONS.minimumTier &&
  effectiveElapsed(state, 0, state.time) >= FOREIGN_POLICY_ASSUMPTIONS.graceSeconds &&
  !state.gameOver &&
  !state.victory;
function policy(state: GameState) {
  return (state.foreignPolicy ??= { raids: [], ultimata: [], relations: [] });
}
function intervalReady(state: GameState, key: string, seconds: number) {
  const last = state.eventTimes[key];
  return last === undefined || effectiveElapsed(state, last, state.time) >= seconds;
}
function move(
  point: { x: number; y: number },
  target: { x: number; y: number },
  dt: number,
  speed = 4,
) {
  const length = distance(point, target),
    step = Math.max(0, dt) * speed;
  if (length <= step) {
    point.x = target.x;
    point.y = target.y;
    return true;
  }
  point.x += ((target.x - point.x) / length) * step;
  point.y += ((target.y - point.y) / length) * step;
  return false;
}
function takeFood(inventory: Inventory, amount: number, cargo?: Inventory) {
  let remaining = amount;
  for (const resource of FOOD) {
    const quantity = Math.min(inventory[resource], remaining);
    inventory[resource] -= quantity;
    if (cargo) cargo[resource] += quantity;
    remaining -= quantity;
  }
}

/** Cohorts already represented by visitors cannot also supply a new expedition. */
export function availableForeignWarriors(state: GameState, city: City) {
  const represented = state.units.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.factionId === city.factionId &&
      unit.cityId === city.id &&
      unit.caste === 'warrior',
  ).length;
  return Math.max(0, Math.floor(city.cohorts.warriors) - represented);
}

function mobilizeWorkers(state: GameState, city: City, target: number) {
  const represented = state.units.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.factionId === city.factionId &&
      unit.cityId === city.id &&
      (!unit.caste || unit.caste === 'citizen'),
  ).length;
  const spare = Math.max(
    0,
    Math.floor(city.cohorts.workers) -
      represented -
      FOREIGN_POLICY_ASSUMPTIONS.minimumCivilianWorkers,
  );
  const count = Math.min(
    Math.max(0, target - availableForeignWarriors(state, city)),
    spare,
    Math.floor(totalFood(city.resources) / FOREIGN_POLICY_ASSUMPTIONS.trainingFoodPerWarrior),
  );
  if (count <= 0) return;
  city.cohorts.workers -= count;
  city.cohorts.warriors += count;
  takeFood(city.resources, count * FOREIGN_POLICY_ASSUMPTIONS.trainingFoodPerWarrior);
  city.garrisonHp = Math.min(
    city.cohorts.warriors * 100,
    (city.garrisonHp ?? (city.cohorts.warriors - count) * 100) + count * 100,
  );
}

/** Moving real soldiers preserves wounds in the source garrison and expedition. */
function withdrawWarriors(city: City, count: number) {
  const warriors = city.cohorts.warriors;
  const health = Math.min(warriors * 100, city.garrisonHp ?? warriors * 100);
  const departingHealth = warriors > 0 ? (health * count) / warriors : 0;
  city.cohorts.warriors -= count;
  city.garrisonHp = Math.max(0, health - departingHealth);
  return departingHealth;
}

/** Work allocated to arms cannot also produce the full seasonal ingot yield. */
export function takeForeignForgeWork(state: GameState, buildingId: string) {
  const key = `foreignForgeWork:${buildingId}`;
  const used = state.eventTimes[key] ?? 0;
  delete state.eventTimes[key];
  return used;
}

function updateForeignForges(state: GameState, dt: number) {
  if (!ready(state)) return;
  for (const city of state.cities.filter(
    (entry) => entry.factionId !== 'player' && entry.factionId !== 'ruins' && liveCity(entry),
  )) {
    const faction = state.factions.find((entry) => entry.id === city.factionId);
    if (
      !faction ||
      !faction.words.includes('V_12') ||
      !state.cities.some(
        (other) => liveCity(other) && areFactionsHostile(state, faction.id, other.factionId),
      )
    )
      continue;
    for (const building of state.buildings.filter(
      (entry) =>
        entry.kind === 'foundry' &&
        entry.cityId === city.id &&
        entry.active &&
        entry.hp > 0 &&
        entry.completed !== false &&
        (entry.lastEfficiency ?? 0) > 0,
    )) {
      if (
        city.resources.ingot < 1 ||
        city.resources.metalArms >= FOREIGN_POLICY_ASSUMPTIONS.militaryArmsReserve
      )
        continue;
      const key = `foreignForgeProgress:${building.id}`,
        workKey = `foreignForgeWork:${building.id}`;
      const work = Math.min(1, building.lastEfficiency ?? 0) * dt;
      state.eventTimes[`foreignForgeLastWork:${building.id}`] = state.time;
      state.eventTimes[key] = (state.eventTimes[key] ?? 0) + work;
      state.eventTimes[workKey] = (state.eventTimes[workKey] ?? 0) + work;
      if (state.eventTimes[key] + 1e-9 < FOREIGN_POLICY_ASSUMPTIONS.forgeCycleSeconds) continue;
      state.eventTimes[key] -= FOREIGN_POLICY_ASSUMPTIONS.forgeCycleSeconds;
      city.resources.ingot--;
      city.resources.metalArms++;
    }
  }
}

/** Foreign pair diplomacy is separate from the relation each faction has to the player. */
export function areFactionsHostile(state: GameState, left: string, right: string) {
  if (left === right || left === 'ruins' || right === 'ruins') return false;
  if (left === 'rebels' || right === 'rebels') return true;
  if (left === 'player' || right === 'player') {
    const faction = state.factions.find((f) => f.id === (left === 'player' ? right : left));
    if (faction && (faction.peaceUntil ?? 0) > state.time) return false;
    if (
      faction &&
      (faction.hostile || faction.relation <= FOREIGN_POLICY_ASSUMPTIONS.raidRelationThreshold)
    )
      return true;
    // A public attack order is an explicit aggression, even before a policy update.
    return state.battalions.some(
      (army) =>
        army.hp > 0 &&
        [left, right].includes(army.factionId) &&
        ['attacking', 'conquering'].includes(army.action) &&
        state.cities.some(
          (city) =>
            city.id === army.targetId &&
            [left, right].includes(city.factionId) &&
            city.factionId !== army.factionId,
        ),
    );
  }
  const [leftId, rightId] = [left, right].sort();
  return (
    state.foreignPolicy?.relations.some(
      (pair) => pair.leftId === leftId && pair.rightId === rightId && pair.atWar,
    ) ?? false
  );
}

function dispatchRaid(state: GameState, faction: Faction, origin: City) {
  if (
    state.urbanized ||
    (faction.peaceUntil ?? 0) > state.time ||
    faction.relation > FOREIGN_POLICY_ASSUMPTIONS.raidRelationThreshold ||
    !intervalReady(state, `raid:${faction.id}`, FOREIGN_POLICY_ASSUMPTIONS.raidIntervalSeconds)
  )
    return;
  const data = policy(state);
  if (data.raids.some((raid) => raid.factionId === faction.id && raid.phase !== 'ended')) return;
  mobilizeWorkers(state, origin, FOREIGN_POLICY_ASSUMPTIONS.raidMembers);
  const count = Math.min(
    FOREIGN_POLICY_ASSUMPTIONS.raidMembers,
    availableForeignWarriors(state, origin),
  );
  if (
    count < FOREIGN_POLICY_ASSUMPTIONS.minimumRaidMembers ||
    totalFood(origin.resources) < count * FOREIGN_POLICY_ASSUMPTIONS.raidProvisionPerMember
  )
    return;
  const health = withdrawWarriors(origin, count);
  if (health <= 0) {
    origin.cohorts.warriors += count;
    return;
  }
  const id = nextId(state, 'raid');
  const members: Unit[] = Array.from({ length: count }, (_, index) => ({
    id: `${id}-member-${index}`,
    name: `Razziatore di ${faction.name}`,
    x: clamp(origin.x + index, 0, 500),
    y: origin.y,
    hp: health / count,
    hunger: 20,
    temp: 100,
    age: 8,
    strength: 5,
    intelligence: 4,
    action: 'raiding',
    progress: 0,
    knows: [...faction.words],
    isolation: 0,
    caste: 'warrior',
    factionId: faction.id,
    // Reserved troops are outside the cohort until their actual return.
    cityId: undefined,
    eventMemory: [],
    tension: {},
    cooldowns: {},
  }));
  takeFood(origin.resources, count * FOREIGN_POLICY_ASSUMPTIONS.raidProvisionPerMember);
  state.units.push(...members);
  data.raids.push({
    id,
    factionId: faction.id,
    originCityId: origin.id,
    memberIds: members.map((u) => u.id),
    phase: 'approaching',
    resources: emptyInventory(),
    startedAt: state.time,
    target: { ...state.home },
    progress: 0,
  });
  while (data.raids.length > FOREIGN_POLICY_ASSUMPTIONS.maximumRaids) {
    const index = data.raids.findIndex((raid) => raid.phase === 'ended');
    if (index < 0) break;
    const retiredIds = new Set(data.raids[index].memberIds);
    state.units = state.units.filter(
      (unit) => !retiredIds.has(unit.id) || unit.action !== 'returned',
    );
    data.raids.splice(index, 1);
  }
  faction.hostile = true;
  state.eventTimes[`raid:${faction.id}`] = state.time;
  log(
    state,
    `${faction.name} invia una piccola razzia verso il nostro accampamento. Prepara il presidio o la palizzata.`,
    'danger',
  );
}

function dispatchUltimatum(state: GameState, faction: Faction, city: City) {
  if (
    (faction.peaceUntil ?? 0) > state.time ||
    faction.relation >= 0 ||
    !intervalReady(
      state,
      `ultimatum:${faction.id}`,
      FOREIGN_POLICY_ASSUMPTIONS.ultimatumIntervalSeconds,
    )
  )
    return;
  const data = policy(state);
  if (
    data.ultimata.some(
      (ultimatum) =>
        ultimatum.factionId === faction.id && ['pending', 'dispatched'].includes(ultimatum.status),
    )
  )
    return;
  const opposing = faction.dogmas.find(
    (dogma) => dogmaDiplomaticPenalty([dogma], state.dogmas) < 0,
  );
  if (!opposing && faction.relation > -35 && !faction.hostile) return;
  const resource =
    faction.words.includes('O_12') && state.words.O_12?.retention > 0 ? 'coin' : 'food';
  while (data.ultimata.length >= FOREIGN_POLICY_ASSUMPTIONS.maximumUltimata) {
    const finished = data.ultimata.findIndex(
      (entry) => !['pending', 'dispatched'].includes(entry.status),
    );
    if (finished < 0) return;
    data.ultimata.splice(finished, 1);
  }
  data.ultimata.push({
    id: nextId(state, 'ultimatum'),
    factionId: faction.id,
    cityId: city.id,
    createdAt: state.time,
    expiresAt: state.time + FOREIGN_POLICY_ASSUMPTIONS.ultimatumResponseSeconds,
    kind: opposing ? 'religious' : 'tribute',
    resource,
    amount:
      resource === 'coin'
        ? FOREIGN_POLICY_ASSUMPTIONS.tributeCoins
        : FOREIGN_POLICY_ASSUMPTIONS.tributeFood,
    status: 'pending',
    dogmaTargetId: opposing?.targetId,
  });
  state.eventTimes[`ultimatum:${faction.id}`] = state.time;
  log(
    state,
    opposing
      ? `${faction.name} contesta i nostri dogmi e chiede un dono di tregua. Possiamo rispondere senza cambiare la nostra dottrina.`
      : `${faction.name} pretende un tributo per mantenere la pace.`,
    'warning',
  );
}

/** Responding creates a real caravan; no doctrine or word is adopted automatically. */
export function resolveForeignUltimatum(
  input: GameState,
  id: string,
  choice: 'pay' | 'refuse',
): GameState {
  const state = copy(input),
    ultimatum = state.foreignPolicy?.ultimata.find((entry) => entry.id === id);
  if (!ultimatum || ultimatum.status !== 'pending' || state.time >= ultimatum.expiresAt)
    return input;
  const faction = state.factions.find((entry) => entry.id === ultimatum.factionId);
  const city = state.cities.find(
    (entry) =>
      entry.id === ultimatum.cityId && entry.factionId === ultimatum.factionId && liveCity(entry),
  );
  if (!faction || !city) {
    ultimatum.status = 'cancelled';
    return state;
  }
  if (choice === 'refuse') {
    ultimatum.status = 'refused';
    faction.relation = clamp(
      faction.relation - FOREIGN_POLICY_ASSUMPTIONS.refusalRelationPenalty,
      -100,
      100,
    );
    faction.hostile ||= faction.relation <= FOREIGN_POLICY_ASSUMPTIONS.raidRelationThreshold;
    log(state, `Rifiutiamo la richiesta di ${faction.name}. La tensione aumenta.`, 'warning');
    return state;
  }
  if (state.resources[ultimatum.resource] < ultimatum.amount) return input;
  const resources = emptyInventory();
  resources[ultimatum.resource] = ultimatum.amount;
  state.resources[ultimatum.resource] -= ultimatum.amount;
  const source = state.cities.find((entry) => entry.factionId === 'player' && entry.capital);
  const caravan: Caravan = {
    id: nextId(state, 'peace-gift'),
    kind: 'trade',
    x: source?.x ?? state.home.x,
    y: source?.y ?? state.home.y,
    fromCityId: source?.id ?? 'village',
    toCityId: city.id,
    factionId: 'player',
    resources,
    population: 0,
    target: { type: 'city', id: city.id, x: city.x, y: city.y },
    hp: 100,
    gift: true,
  };
  state.caravans.push(caravan);
  ultimatum.status = 'dispatched';
  ultimatum.paymentCaravanId = caravan.id;
  faction.hostile = false;
  faction.peaceUntil = Math.max(
    faction.peaceUntil ?? 0,
    state.time +
      secondsForEffectiveDuration(
        state,
        state.time,
        FOREIGN_POLICY_ASSUMPTIONS.paymentPeaceSeconds,
      ),
  );
  log(
    state,
    `Un dono di tregua parte verso ${faction.name}. La consegna deve ancora raggiungere la loro città.`,
    'good',
  );
  return state;
}

function dropRaidCargo(state: GameState, raid: ForeignRaid, point: { x: number; y: number }) {
  for (const resource of RESOURCE_ORDER) {
    if (raid.resources[resource] <= 0) continue;
    state.entities.push({
      id: nextId(state, 'raid-loot'),
      kind: 'ground',
      resource,
      x: point.x,
      y: point.y,
      hp: 0,
      maxHp: 1,
      amount: raid.resources[resource],
    });
    raid.resources[resource] = 0;
  }
}
function finishRaid(state: GameState, raid: ForeignRaid, members: Unit[], city?: City) {
  if (raid.phase === 'ended') return;
  if (city) {
    const previousHealth = city.garrisonHp ?? city.cohorts.warriors * 100;
    city.cohorts.warriors += members.length;
    city.garrisonHp = Math.min(
      city.cohorts.warriors * 100,
      previousHealth + members.reduce((sum, member) => sum + member.hp, 0),
    );
    for (const resource of RESOURCE_ORDER) {
      city.resources[resource] += raid.resources[resource];
      raid.resources[resource] = 0;
    }
    for (const member of members) {
      member.hp = 0;
      member.action = 'returned';
    }
  } else {
    const point =
      members[0] ?? state.units.find((u) => raid.memberIds.includes(u.id)) ?? raid.target;
    dropRaidCargo(state, raid, point);
    for (const member of members) member.action = 'idle';
  }
  raid.phase = 'ended';
  raid.finishedAt = state.time;
}
function guardAtHome(state: GameState, unit: Unit) {
  return (
    unit.hp > 0 &&
    unit.age >= 4 &&
    unit.action === 'guarding' &&
    unit.command?.includes('V_05') &&
    unit.command.includes('O_01') &&
    distance(unit, state.home) <= 15 &&
    (unit.command[0] !== 'C_01' || getCalendar(state).isNight)
  );
}
function retaliate(state: GameState, guard: Unit, raider: Unit) {
  if (protectedByDogma(state, 'S_05', raider)) return;
  const equipment = combatEquipmentFor(state, guard),
    effect = getDogmaEffects(state, {
      unit: guard,
      tokens: guard.command,
      againstForeign: true,
      inBorders: true,
    });
  const wound = effectiveDamage(
    equipment.damage,
    guard.strength,
    (state.cohesion < 30 ? 0.7 : 1) * effect.combat * effect.morale,
  );
  raider.hp = Math.max(0, raider.hp - wound);
  if (equipment.kind)
    equipment.inventory[equipment.kind] = Math.max(0, equipment.inventory[equipment.kind] - 0.05);
  if (raider.hp <= 0) {
    raider.action = 'dead';
    log(state, 'Un razziatore viene fermato dal presidio.', 'info');
  }
}
function updateRaid(state: GameState, raid: ForeignRaid, dt: number) {
  if (raid.phase === 'ended') return;
  const faction = state.factions.find((entry) => entry.id === raid.factionId);
  const members = state.units.filter(
    (u) => raid.memberIds.includes(u.id) && u.hp > 0 && u.factionId === raid.factionId,
  );
  const origin =
    state.cities.find(
      (city) =>
        city.id === raid.originCityId && city.factionId === raid.factionId && liveCity(city),
    ) ?? state.cities.find((city) => city.factionId === raid.factionId && liveCity(city));
  let cargoLeft = members.length * FOREIGN_POLICY_ASSUMPTIONS.raidLootPerMember;
  const point = members[0] ?? state.units.find((u) => raid.memberIds.includes(u.id)) ?? raid.target;
  for (const resource of RESOURCE_ORDER) {
    const keep = Math.min(cargoLeft, raid.resources[resource]),
      surplus = raid.resources[resource] - keep;
    cargoLeft -= keep;
    if (surplus > 0) {
      state.entities.push({
        id: nextId(state, 'raid-loot'),
        kind: 'ground',
        resource,
        x: point.x,
        y: point.y,
        hp: 0,
        maxHp: 1,
        amount: surplus,
      });
      raid.resources[resource] = keep;
    }
  }
  if (!members.length) {
    finishRaid(state, raid, []);
    return;
  }
  if (
    !origin ||
    !faction ||
    (faction.peaceUntil ?? 0) > state.time ||
    faction.relation > FOREIGN_POLICY_ASSUMPTIONS.raidRelationThreshold ||
    state.urbanized ||
    state.time - raid.startedAt > FOREIGN_POLICY_ASSUMPTIONS.raidMaximumSeconds ||
    members.length < FOREIGN_POLICY_ASSUMPTIONS.minimumRaidMembers ||
    members.some((u) => u.hp <= 30)
  )
    raid.phase = 'returning';
  if (
    raid.engagedAt !== undefined &&
    state.time - raid.engagedAt >= FOREIGN_POLICY_ASSUMPTIONS.raidWorkSeconds
  )
    raid.phase = 'returning';
  if (raid.phase === 'returning') {
    if (!origin) {
      finishRaid(state, raid, members);
      return;
    }
    let arrived = true;
    for (const member of members) {
      member.action = 'raiding-returning';
      if (!move(member, origin, dt)) arrived = false;
    }
    if (arrived) finishRaid(state, raid, members, origin);
    return;
  }
  const palisade = state.buildings.find(
    (b) =>
      b.kind === 'palisade' &&
      b.hp > 0 &&
      b.active &&
      b.completed !== false &&
      !b.cityId &&
      distance(b, raid.target) <= 20,
  );
  if (palisade && members.some((member) => distance(member, raid.target) <= 15)) {
    raid.phase = 'returning';
    log(state, 'La palizzata respinge gli incursori: le scorte rimangono al sicuro.', 'good');
    return;
  }
  const guards = activeUnits(state).filter((u) => guardAtHome(state, u));
  let reached = false;
  for (let i = 0; i < members.length; i++) {
    const member = members[i],
      guard = guards
        .filter((u) => u.hp > 0 && distance(member, raid.target) <= 30)
        .sort((a, b) => distance(a, member) - distance(b, member))[0];
    if (guard) {
      const target = { x: guard.x + Math.cos(i * 2.4) * 1.2, y: guard.y + Math.sin(i * 2.4) * 1.2 };
      move(member, target, dt);
      member.action = 'raiding';
    } else {
      const target = {
        x: raid.target.x + Math.cos(i * 2.4) * 2,
        y: raid.target.y + Math.sin(i * 2.4) * 2,
      };
      if (move(member, target, dt)) reached = true;
    }
  }
  raid.progress = Math.min(1, raid.progress + dt);
  if (raid.progress < 1) return;
  raid.progress -= 1;
  let fighting = false;
  for (const member of members) {
    const guard = guards.find((u) => u.hp > 0 && distance(u, member) <= 1.5);
    if (!guard) continue;
    fighting = true;
    const equipment = combatEquipmentFor(state, guard),
      effect = getDogmaEffects(state, { unit: guard, inBorders: true });
    if (!effect.protected) {
      const damage = effectiveDamage(5, member.strength, 1, equipment.armor);
      guard.hp -= damage;
      rememberCombatWound(state, guard, damage, { kind: 'human', id: member.id });
      recordAttackTrauma(state);
      if (guard.hp <= 0) killUnit(state, guard, 'V_03');
    }
    if (guard.hp > 0) retaliate(state, guard, member);
  }
  if (fighting) {
    raid.engagedAt ??= state.time;
    raid.phase = 'raiding';
    return;
  }
  if (reached && !guards.length) {
    const maximum = members.length * FOREIGN_POLICY_ASSUMPTIONS.raidLootPerMember;
    let remaining = maximum;
    for (const resource of ['food', 'cooked', 'meat', 'wood'] as const) {
      const amount = Math.min(state.resources[resource], remaining);
      state.resources[resource] -= amount;
      raid.resources[resource] += amount;
      remaining -= amount;
    }
    raid.phase = 'returning';
    log(
      state,
      remaining < maximum
        ? 'Gli incursori sottraggono scorte e ripartono. Il bottino viaggia con loro.'
        : 'Gli incursori trovano le scorte vuote e ripartono.',
      'danger',
    );
  }
}

function dispatchExpansion(state: GameState, faction: Faction, origin: City) {
  const A = FOREIGN_POLICY_ASSUMPTIONS;
  const representedWorkers = state.units.filter(
    (unit) =>
      unit.hp > 0 &&
      unit.factionId === faction.id &&
      unit.cityId === origin.id &&
      (!unit.caste || unit.caste === 'citizen'),
  ).length;
  if (
    state.tier < 4 ||
    !faction.words.includes('V_08') ||
    !faction.words.includes('O_10') ||
    !intervalReady(state, `expansion:${faction.id}`, A.expansionIntervalSeconds) ||
    origin.cohorts.workers - representedWorkers < A.expansionWorkers + 8 ||
    !canPay(origin.resources, { wood: A.expansionWood, stone: A.expansionStone }) ||
    totalFood(origin.resources) < A.expansionFood ||
    state.caravans.some(
      (c) => c.kind === 'colonists' && c.factionId === faction.id && !c.arrived && c.hp > 0,
    )
  )
    return;
  const sectors = state.sectors.filter((sector) => {
    if (
      sector.biome === 'river' ||
      (sector.x === Math.floor(state.home.x / 100) && sector.y === Math.floor(state.home.y / 100))
    )
      return false;
    if (Math.abs(sector.x - origin.sectorX) + Math.abs(sector.y - origin.sectorY) !== 1)
      return false;
    if (
      state.cities.some(
        (city) =>
          city.factionId !== 'ruins' && city.sectorX === sector.x && city.sectorY === sector.y,
      )
    )
      return false;
    return !state.caravans.some(
      (car) =>
        car.kind === 'colonists' &&
        !car.arrived &&
        car.hp > 0 &&
        Math.floor(car.target.x / 100) === sector.x &&
        Math.floor(car.target.y / 100) === sector.y,
    );
  });
  const target = sectors.sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!target) return;
  const resources = emptyInventory();
  resources.wood = A.expansionWood;
  resources.stone = A.expansionStone;
  pay(origin.resources, { wood: A.expansionWood, stone: A.expansionStone });
  takeFood(origin.resources, A.expansionFood, resources);
  origin.cohorts.workers -= A.expansionWorkers;
  state.caravans.push({
    id: nextId(state, 'foreign-colonists'),
    kind: 'colonists',
    factionId: faction.id,
    fromCityId: origin.id,
    x: origin.x,
    y: origin.y,
    resources,
    population: A.expansionWorkers,
    target: { type: 'point', x: target.x * 100 + 50, y: target.y * 100 + 50 },
    hp: 100,
    words: [...faction.words],
    dogmas: copy(faction.dogmas),
  });
  state.eventTimes[`expansion:${faction.id}`] = state.time;
  faction.lastExpansionAt = state.time;
  log(state, `${faction.name} invia coloni verso un settore vicino.`, 'info');
}

function prepareForeignHousing(state: GameState, faction: Faction, city: City) {
  const population = Object.values(city.cohorts).reduce((sum, count) => sum + count, 0);
  if (
    city.housing >= FOREIGN_POLICY_ASSUMPTIONS.maximumForeignHousing ||
    population < city.housing * 0.65 ||
    !['V_08', 'O_02', 'O_01'].every((word) => faction.words.includes(word))
  )
    return;
  const spec = BUILDING_SPECS.house;
  if (!canPay(city.resources, spec.cost)) return;
  pay(city.resources, spec.cost);
  const building = {
    id: nextId(state, 'foreign-house'),
    kind: 'house' as const,
    x: city.x + 5,
    y: city.y + 5,
    hp: spec.maxHp,
    active: true,
    completed: true,
    cityId: city.id,
    workerIds: [],
  };
  state.buildings.push(building);
  city.buildingIds.push(building.id);
  city.housing += spec.housing ?? 0;
}

/** Prevent foreign settlers falling through the player-only colonial settlement. */
export function completeForeignExpansion(state: GameState, caravan: Caravan) {
  if (caravan.kind !== 'colonists' || caravan.factionId === 'player') return false;
  if (caravan.arrived || caravan.hp <= 0) return true;
  const source =
    state.cities.find(
      (city) =>
        city.id === caravan.fromCityId && city.factionId === caravan.factionId && liveCity(city),
    ) ?? state.cities.find((city) => city.factionId === caravan.factionId && liveCity(city));
  const faction = state.factions.find((entry) => entry.id === caravan.factionId);
  const occupied = state.cities.some(
    (city) =>
      city.factionId !== 'ruins' &&
      city.sectorX === Math.floor(caravan.x / 100) &&
      city.sectorY === Math.floor(caravan.y / 100),
  );
  if (caravan.returning || occupied) {
    if (source && distance(caravan, source) <= 0.01 && caravan.returning) {
      source.cohorts.workers += caravan.population;
      for (const resource of RESOURCE_ORDER)
        source.resources[resource] += caravan.resources[resource];
      caravan.resources = emptyInventory();
      caravan.population = 0;
      caravan.arrived = true;
    } else if (source) {
      caravan.returning = true;
      caravan.customsRefused = false;
      caravan.target = { type: 'city', id: source.id, x: source.x, y: source.y };
    } else {
      // A stranded group remains physically present, with its people and cargo.
      caravan.returning = false;
      caravan.customsRefused = true;
      caravan.target = { type: 'point', x: caravan.x, y: caravan.y };
    }
    return true;
  }
  const city: City = {
    id: nextId(state, 'foreign-colony'),
    name: `${source?.name ?? faction?.name ?? 'Comunità'} · Colonia`,
    x: caravan.x,
    y: caravan.y,
    sectorX: Math.floor(caravan.x / 100),
    sectorY: Math.floor(caravan.y / 100),
    factionId: caravan.factionId,
    cohorts: { workers: caravan.population, warriors: 0, sages: 0, slaves: 0 },
    resources: caravan.resources,
    words: [...(caravan.words ?? source?.words ?? faction?.words ?? [])],
    dogmas: copy(caravan.dogmas ?? source?.dogmas ?? faction?.dogmas ?? []),
    revoltTension: 0,
    housing: caravan.population,
    buildingIds: [],
    vocations: [],
    loyalty: 100,
    assimilation: { delegateCount: 0, active: false },
    production: emptyInventory(),
    garrisonHp: 0,
    foundedAt: state.time,
  };
  state.cities.push(city);
  if (faction && !ownCity(state, faction)) {
    faction.cityId = city.id;
    faction.subjugated = false;
  }
  const sector = state.sectors.find(
    (entry) => entry.x === city.sectorX && entry.y === city.sectorY,
  );
  if (sector) sector.cityId = city.id;
  caravan.resources = emptyInventory();
  caravan.population = 0;
  caravan.arrived = true;
  log(state, `I coloni stranieri raggiungono la destinazione e fondano ${city.name}.`, 'info');
  return true;
}

function planRelationsAndWar(state: GameState) {
  if (state.tier < 4) return;
  const data = policy(state),
    factions = state.factions.filter((f) => !f.subjugated && ownCity(state, f)).slice(0, 8);
  for (let i = 0; i < factions.length; i++)
    for (let j = i + 1; j < factions.length; j++) {
      const [leftId, rightId] = [factions[i].id, factions[j].id].sort(),
        left = state.factions.find((f) => f.id === leftId)!,
        right = state.factions.find((f) => f.id === rightId)!;
      let pair = data.relations.find(
        (entry) => entry.leftId === leftId && entry.rightId === rightId,
      );
      if (!pair) {
        if (data.relations.length >= FOREIGN_POLICY_ASSUMPTIONS.maximumRelations) continue;
        pair = {
          leftId,
          rightId,
          relation: dogmaDiplomaticPenalty(left.dogmas, right.dogmas),
          atWar: false,
        };
        data.relations.push(pair);
      }
      const touching = state.cities.some(
        (a) =>
          a.factionId === leftId &&
          state.cities.some(
            (b) =>
              b.factionId === rightId &&
              Math.abs(a.sectorX - b.sectorX) + Math.abs(a.sectorY - b.sectorY) === 1,
          ),
      );
      if (touching)
        pair.relation = clamp(
          pair.relation - FOREIGN_POLICY_ASSUMPTIONS.borderFrictionPerSeason,
          -100,
          100,
        );
      if (pair.relation <= FOREIGN_POLICY_ASSUMPTIONS.foreignPairWarThreshold) {
        if (!pair.atWar)
          log(
            state,
            `${left.name} e ${right.name} entrano in conflitto per confini e dottrine.`,
            'warning',
          );
        pair.atWar = true;
      }
    }
  for (const faction of factions) {
    if (state.battalions.some((army) => army.factionId === faction.id && army.hp > 0)) continue;
    for (const city of state.cities.filter(
      (entry) =>
        entry.factionId === faction.id && liveCity(entry) && entry.resources.metalArms >= 20,
    )) {
      if (
        state.cities.some(
          (other) => liveCity(other) && areFactionsHostile(state, faction.id, other.factionId),
        )
      )
        mobilizeWorkers(state, city, 20);
    }
    const source = state.cities
      .filter(
        (city) =>
          city.factionId === faction.id &&
          liveCity(city) &&
          availableForeignWarriors(state, city) >= 20 &&
          city.resources.metalArms >= 20,
      )
      .sort((a, b) => b.cohorts.warriors - a.cohorts.warriors)[0];
    if (!source) continue;
    const target = state.cities
      .filter((city) => liveCity(city) && areFactionsHostile(state, faction.id, city.factionId))
      .sort((a, b) => distance(a, source) - distance(b, source))[0];
    if (!target) continue;
    const health = withdrawWarriors(source, 20);
    if (health <= 0) {
      source.cohorts.warriors += 20;
      continue;
    }
    source.resources.metalArms -= 20;
    state.battalions.push({
      id: nextId(state, 'foreign-army'),
      name: `Guerrieri di ${faction.name}`,
      x: source.x,
      y: source.y,
      cityId: source.id,
      factionId: faction.id,
      hp: health,
      maxHp: 2000,
      morale: 1,
      action: 'conquering',
      targetId: target.id,
      target: { type: 'city', id: target.id, x: target.x, y: target.y },
      catapult: false,
      occupation: 0,
      metalWeapons: 20,
    });
    log(state, `${faction.name} mobilita un esercito contro ${target.name}.`, 'warning');
  }
}

/** Seasonal planning is gated separately from continuous movement and deadlines. */
export function dispatchForeignPolicy(state: GameState) {
  if (!ready(state)) return;
  if (!intervalReady(state, 'foreignPolicyPlan', 90)) return;
  state.eventTimes.foreignPolicyPlan = state.time;
  for (const faction of state.factions.slice(0, 8)) {
    const origin = ownCity(state, faction);
    if (!origin) continue;
    // Losing the original capital does not erase a real, surviving colony.
    faction.cityId = origin.id;
    faction.subjugated = false;
    prepareForeignHousing(state, faction, origin);
    dispatchUltimatum(state, faction, origin);
    dispatchRaid(state, faction, origin);
    dispatchExpansion(state, faction, origin);
  }
  planRelationsAndWar(state);
}

export function updateForeignPolicy(state: GameState, dt: number) {
  if (dt > 0 && Number.isFinite(dt)) updateForeignForges(state, Math.min(dt, 0.25));
  const data = state.foreignPolicy;
  if (!data || dt <= 0 || !Number.isFinite(dt)) return;
  for (const caravan of state.caravans.filter(
    (car) => car.kind === 'colonists' && car.factionId !== 'player',
  )) {
    if (caravan.hp <= 0) {
      for (const resource of RESOURCE_ORDER) {
        if (caravan.resources[resource] <= 0) continue;
        state.entities.push({
          id: nextId(state, 'colony-cargo'),
          kind: 'ground',
          resource,
          x: caravan.x,
          y: caravan.y,
          hp: 0,
          maxHp: 1,
          amount: caravan.resources[resource],
        });
        caravan.resources[resource] = 0;
      }
      caravan.population = 0;
      caravan.arrived = true;
    } else if (!caravan.arrived && caravan.customsRefused && !caravan.returning) {
      const refuge = state.cities
        .filter((city) => city.factionId === caravan.factionId && liveCity(city))
        .sort((a, b) => distance(a, caravan) - distance(b, caravan))[0];
      if (refuge) {
        caravan.returning = true;
        caravan.customsRefused = false;
        caravan.target = { type: 'city', id: refuge.id, x: refuge.x, y: refuge.y };
      }
    }
  }
  for (const ultimatum of data.ultimata) {
    const faction = state.factions.find((f) => f.id === ultimatum.factionId),
      origin = state.cities.find(
        (city) =>
          city.id === ultimatum.cityId && city.factionId === ultimatum.factionId && liveCity(city),
      );
    if (['pending', 'dispatched'].includes(ultimatum.status) && (!faction || !origin)) {
      ultimatum.status = 'cancelled';
      continue;
    }
    if (ultimatum.status === 'pending' && state.time >= ultimatum.expiresAt && faction) {
      ultimatum.status = 'expired';
      faction.relation = clamp(
        faction.relation - FOREIGN_POLICY_ASSUMPTIONS.refusalRelationPenalty,
        -100,
        100,
      );
      faction.hostile ||= faction.relation <= FOREIGN_POLICY_ASSUMPTIONS.raidRelationThreshold;
      log(
        state,
        `La richiesta di ${faction.name} scade senza risposta. La tensione aumenta.`,
        'warning',
      );
    }
    if (ultimatum.status === 'dispatched') {
      const caravan = state.caravans.find((c) => c.id === ultimatum.paymentCaravanId);
      if (!caravan || caravan.hp <= 0) {
        ultimatum.status = 'expired';
        log(
          state,
          `Il dono di tregua per ${faction?.name ?? 'un popolo vicino'} non arriva: il convoglio è perduto.`,
          'warning',
        );
        continue;
      }
      if (caravan.arrived) ultimatum.status = caravan.returning ? 'cancelled' : 'paid';
    }
  }
  for (const raid of data.raids) updateRaid(state, raid, dt);
}
