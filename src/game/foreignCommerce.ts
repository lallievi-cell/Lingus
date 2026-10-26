import { emptyInventory, RESOURCE_ORDER } from './content';
import { getDogmaEffects } from './dogmas';
import { imperialLawEffects } from './imperialLawPolicy';
import { areFactionsHostile } from './foreignPolicy';
import { clamp, distance, hasBuilding, hasWord, log, nextId } from './runtime';
import type { Caravan, City, GameState, Resource } from './types';

/** The guide defines the duty but does not prescribe an autonomous merchant policy. */
export const FOREIGN_COMMERCE_ASSUMPTIONS = {
  departureIntervalSeconds: 90,
  maximumCargoUnits: 10,
  maximumConcurrentPerFaction: 1,
  ordinaryUnitPrice: 1,
  ingotUnitPrice: 100,
} as const;

const tradable: Resource[] = ['coin', 'food', 'stone', 'wood', 'ingot'];
const price = (r: Resource) =>
  r === 'ingot'
    ? FOREIGN_COMMERCE_ASSUMPTIONS.ingotUnitPrice
    : FOREIGN_COMMERCE_ASSUMPTIONS.ordinaryUnitPrice;
const alive = (c: City) => Object.values(c.cohorts).some((n) => n > 0);
const inventory = (s: GameState, c: City) => (c.capital ? s.resources : c.resources);

/** Departure removes both the merchandise and its cash purse from real foreign stocks. */
export function dispatchForeignMerchants(s: GameState) {
  if (!hasWord(s, 'V_11') || getDogmaEffects(s).isolated) return;
  const destinations = s.cities.filter((c) => c.factionId === 'player' && alive(c));
  if (!destinations.length) return;
  for (const f of s.factions) {
    const origin = s.cities.find((c) => c.id === f.cityId && c.factionId === f.id && alive(c));
    if (
      !origin ||
      !f.words.includes('V_11') ||
      f.hostile ||
      f.relation < 0 ||
      getDogmaEffects({ ...s, dogmas: f.dogmas }).isolated ||
      s.time - (s.eventTimes[`merchantDeparture:${f.id}`] ?? -Infinity) <
        FOREIGN_COMMERCE_ASSUMPTIONS.departureIntervalSeconds ||
      s.caravans.some((c) => c.kind === 'trade' && c.factionId === f.id && !c.arrived && c.hp > 0)
    )
      continue;
    const target = [...destinations].sort((a, b) => distance(a, origin) - distance(b, origin))[0];
    const choices = tradable.filter(
      (r) =>
        origin.resources[r] >= 1 &&
        (r !== 'coin' || (f.words.includes('O_12') && hasWord(s, 'O_12'))),
    );
    const offered = choices.sort(
      (a, b) => origin.resources[b] * price(b) - origin.resources[a] * price(a),
    )[0];
    if (!offered) continue;
    const quantity = Math.min(
      FOREIGN_COMMERCE_ASSUMPTIONS.maximumCargoUnits,
      origin.resources[offered],
    );
    const load = emptyInventory();
    load[offered] = quantity;
    origin.resources[offered] -= quantity;
    // Goods are never silently converted into tax money. A goods trader carries a real purse.
    if (offered !== 'coin') {
      const purse = Math.min(
        origin.resources.coin,
        quantity * price(offered) * imperialLawEffects(s).customsRate,
      );
      origin.resources.coin -= purse;
      load.coin = purse;
    }
    s.caravans.push({
      id: nextId(s, 'foreign-merchant'),
      kind: 'trade',
      x: origin.x,
      y: origin.y,
      fromCityId: origin.id,
      toCityId: target.id,
      factionId: f.id,
      resources: load,
      population: 0,
      target: { type: 'city', id: target.id, x: target.x, y: target.y },
      hp: 100,
      sourceResource: offered,
      amount: quantity,
    });
    s.eventTimes[`merchantDeparture:${f.id}`] = s.time;
  }
}

/** Assess exactly once when an inbound merchant physically reaches a player border. */
export function inspectForeignCustoms(s: GameState) {
  const cities = s.cities.filter((c) => c.factionId === 'player' && alive(c));
  const radius = hasBuilding(s, 'palace') ? 100 : 35;
  const rate = imperialLawEffects(s).customsRate;
  for (const c of s.caravans.filter(
    (car) =>
      car.kind === 'trade' &&
      car.factionId !== 'player' &&
      !car.arrived &&
      car.hp > 0 &&
      !car.returning,
  )) {
    if (
      c.customsPaid === undefined &&
      !c.customsRefused &&
      cities.some((city) => distance(city, c) <= radius)
    ) {
      const due = Math.max(
        0,
        (c.amount ?? c.resources[c.sourceResource ?? 'food']) *
          price(c.sourceResource ?? 'food') *
          rate,
      );
      if (c.resources.coin + 1e-9 >= due) {
        c.resources.coin = Math.max(0, c.resources.coin - due);
        s.resources.coin += due;
        c.customsPaid = due;
        if (due > 0) log(s, 'Un mercante straniero versa il dazio alla frontiera.', 'good');
      } else {
        c.customsRefused = true;
        log(
          s,
          'Un mercante non può versare il dazio: il carico viene fermato alla frontiera.',
          'warning',
        );
      }
    }
    if (c.customsRefused) {
      const army = s.battalions
        .filter(
          (b) =>
            b.factionId === 'player' && b.hp > 0 && (b.action === 'idle' || b.targetId === c.id),
        )
        .sort((a, b) => distance(a, c) - distance(b, c))[0];
      if (army) {
        army.action = 'moving';
        army.targetId = c.id;
        army.target = { type: 'caravan', id: c.id, x: c.x, y: c.y };
        army.tx = c.x;
        army.ty = c.y;
      }
    }
  }
}

export function canInterceptCaravan(s: GameState, car: Caravan, armyFaction: string) {
  if (armyFaction === car.factionId) return false;
  if (armyFaction === 'player' && car.kind === 'trade' && car.factionId !== 'player')
    return !!car.customsRefused || !!s.factions.find((f) => f.id === car.factionId)?.hostile;
  if (car.factionId === 'player' && armyFaction !== 'player')
    return armyFaction === 'rebels' || !!s.factions.find((f) => f.id === armyFaction)?.hostile;
  return areFactionsHostile(s, car.factionId, armyFaction);
}

/** A foreign route never falls through the player-owned outgoing trade accounting. */
export function completeForeignMerchant(
  s: GameState,
  c: Caravan,
): false | 'exchange' | 'return' | 'refusal' {
  if (c.kind !== 'trade' || c.factionId === 'player') return false;
  if (c.arrived) return 'return';
  const origin = s.cities.find((city) => city.id === c.fromCityId),
    destination = s.cities.find((city) => city.id === c.toCityId);
  if (c.returning) {
    if (origin && origin.factionId === c.factionId)
      for (const r of RESOURCE_ORDER) origin.resources[r] += c.resources[r];
    c.resources = emptyInventory();
    c.arrived = true;
    return 'return';
  }
  let result: 'exchange' | 'refusal' = 'refusal';
  if (destination && destination.factionId === 'player' && !c.customsRefused) {
    const stock = inventory(s, destination),
      offered = c.sourceResource ?? 'food';
    let exchanged = 0;
    if (offered === 'coin') {
      const buy: Resource =
          stock.ingot >= 1 && c.resources.coin >= price('ingot') ? 'ingot' : 'food',
        unitPrice = price(buy);
      const amount = Math.min(stock[buy], Math.floor(c.resources.coin / unitPrice));
      stock[buy] -= amount;
      // Materials belong to the destination; the player's currency is imperial.
      s.resources.coin += amount * unitPrice;
      c.resources.coin -= amount * unitPrice;
      c.resources[buy] += amount;
      exchanged = amount;
    } else {
      const buy = tradable
        .filter((r) => r !== 'coin' && r !== offered && stock[r] > 0)
        .sort((a, b) => (origin?.resources[a] ?? 0) - (origin?.resources[b] ?? 0))[0];
      if (buy) {
        const amount = Math.min(c.resources[offered], stock[buy]);
        stock[buy] -= amount;
        stock[offered] += amount;
        c.resources[offered] -= amount;
        c.resources[buy] += amount;
      }
      if (buy) exchanged = c.resources[buy];
    }
    if (exchanged > 0) {
      const faction = s.factions.find((f) => f.id === c.factionId);
      if (faction) {
        faction.relation = clamp(faction.relation + 10, -100, 100);
        faction.lastTradeAt = s.time;
      }
      s.stats.trades = (s.stats.trades ?? 0) + 1;
      result = 'exchange';
      log(
        s,
        'Una carovana straniera scambia merci reali e riparte verso la propria città.',
        'good',
      );
    }
  }
  c.returning = true;
  c.toCityId = origin?.id;
  c.target = {
    type: origin ? 'city' : 'point',
    id: origin?.id,
    x: origin?.x ?? c.x,
    y: origin?.y ?? c.y,
  };
  return result;
}
