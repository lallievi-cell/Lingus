import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory, WORD_ORDER } from './content';
import { createInitialState } from './state';
import {
  canInterceptCaravan,
  completeForeignMerchant,
  dispatchForeignMerchants,
  inspectForeignCustoms,
} from './foreignCommerce';
import { updateImperial } from './imperial';
import type { Battalion, BuildingKind, City, GameState, Law, Resource } from './types';

function fixture(customs = true) {
  const s = createInitialState(5678);
  s.started = true;
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, custodians: [s.units[0].id], uses: 0 };
  const foreign = s.cities[0];
  foreign.x = 400;
  foreign.y = 250;
  foreign.resources = emptyInventory();
  foreign.resources.food = 20;
  foreign.resources.coin = 5;
  foreign.words = [...WORD_ORDER];
  foreign.dogmas = [];
  const faction = s.factions.find((f) => f.id === foreign.factionId)!;
  faction.words = [...WORD_ORDER];
  faction.dogmas = [];
  faction.relation = 0;
  faction.hostile = false;
  const own: City = {
    ...structuredClone(foreign),
    id: 'capital',
    name: 'Capital',
    x: 250,
    y: 250,
    factionId: 'player',
    capital: true,
    resources: s.resources,
    buildingIds: [],
  };
  s.cities = [own, foreign];
  s.factions = [faction];
  s.buildings = [];
  s.battalions = [];
  s.resources = emptyInventory();
  own.resources = s.resources;
  s.resources.stone = 10;
  if (customs) s.laws = [customsLaw()];
  return { s, own, foreign, faction };
}
function customsLaw(): Law {
  return {
    id: 'customs',
    name: 'Dazi',
    tokens: ['S_05', 'V_11', 'O_12', 'O_10', 'C_03', 'V_03'],
    subjectId: 'S_05',
    verbId: 'V_11',
    objectId: 'O_12',
    modifierId: 'O_10',
    sanctionId: 'V_03',
    prohibitive: false,
    age: 0,
  };
}
function building(s: GameState, c: City, kind: BuildingKind) {
  const b = {
    id: `${kind}-${c.id}`,
    kind,
    x: c.x,
    y: c.y,
    hp: BUILDING_SPECS[kind].maxHp,
    active: true,
    completed: true,
    workerIds: [],
    cityId: c.id,
  };
  s.buildings.push(b);
  return b;
}
function army(s: GameState, c: City) {
  const b: Battalion = {
    id: 'army',
    name: 'Army',
    x: c.x,
    y: c.y,
    cityId: c.id,
    factionId: 'player',
    hp: 2000,
    maxHp: 2000,
    morale: 1,
    action: 'idle',
    catapult: false,
    occupation: 0,
  };
  s.battalions.push(b);
  return b;
}
function total(s: GameState, r: Resource) {
  return (
    s.resources[r] +
    s.cities.filter((c) => !c.capital).reduce((n, c) => n + c.resources[r], 0) +
    s.caravans.reduce((n, c) => n + c.resources[r], 0)
  );
}

describe('foreign merchants and physical customs', () => {
  it('deducts real goods and a real duty purse, with one route per faction and a 90-second interval', () => {
    const { s, foreign } = fixture();
    const food = total(s, 'food'),
      coin = total(s, 'coin');
    dispatchForeignMerchants(s);
    expect(s.caravans).toHaveLength(1);
    expect(foreign.resources.food).toBe(10);
    expect(foreign.resources.coin).toBe(3);
    expect(s.caravans[0].resources.food).toBe(10);
    expect(s.caravans[0].resources.coin).toBe(2);
    expect(total(s, 'food')).toBe(food);
    expect(total(s, 'coin')).toBe(coin);
    s.time = 90;
    dispatchForeignMerchants(s);
    expect(s.caravans).toHaveLength(1);
    s.caravans[0].arrived = true;
    s.time = 89;
    dispatchForeignMerchants(s);
    expect(s.caravans).toHaveLength(1);
    s.time = 90;
    dispatchForeignMerchants(s);
    expect(s.caravans).toHaveLength(2);
  });

  it.each(['player-no-word', 'foreign-no-word', 'hostile', 'empty-stock'])(
    'does not dispatch when trade requirements fail: %s',
    (reason) => {
      const { s, foreign, faction } = fixture();
      if (reason === 'player-no-word') delete s.words.V_11;
      if (reason === 'foreign-no-word') faction.words = faction.words.filter((w) => w !== 'V_11');
      if (reason === 'hostile') faction.hostile = true;
      if (reason === 'empty-stock') foreign.resources = emptyInventory();
      dispatchForeignMerchants(s);
      expect(s.caravans).toHaveLength(0);
    },
  );

  it('collects exactly 20% only at the owned 35m border, once, without minting coins', () => {
    const { s } = fixture();
    dispatchForeignMerchants(s);
    const c = s.caravans[0],
      coin = total(s, 'coin');
    c.x = 286;
    c.y = 250;
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBeUndefined();
    expect(s.resources.coin).toBe(0);
    c.x = 285;
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBe(2);
    expect(c.resources.coin).toBe(0);
    expect(s.resources.coin).toBe(2);
    inspectForeignCustoms(s);
    expect(s.resources.coin).toBe(2);
    expect(total(s, 'coin')).toBe(coin);
  });

  it('extends customs to 100m only with an active owned completed palace', () => {
    const { s, own, foreign } = fixture();
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    c.x = 340;
    c.y = 250;
    building(s, foreign, 'palace');
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBeUndefined();
    const p = building(s, own, 'palace');
    p.active = false;
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBeUndefined();
    p.active = true;
    p.completed = false;
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBeUndefined();
    p.completed = true;
    inspectForeignCustoms(s);
    expect(c.customsPaid).toBe(2);
  });

  it('rejects an unpaid duty, orders the real army to intercept, and stops the merchant', () => {
    const { s, own, foreign } = fixture();
    foreign.resources.coin = 0;
    const b = army(s, own);
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    c.x = 285;
    c.y = 250;
    inspectForeignCustoms(s);
    expect(c.customsRefused).toBe(true);
    expect(s.resources.coin).toBe(0);
    expect(b.targetId).toBe(c.id);
    expect(canInterceptCaravan(s, c, 'player')).toBe(true);
    updateImperial(s, 1);
    expect(c.x).toBe(285);
    b.x = c.x;
    b.y = c.y;
    b.action = 'idle';
    updateImperial(s, 1);
    expect(c.hp).toBe(60);
  });

  it('does not attack a peaceful paid merchant just because factions differ', () => {
    const { s, own } = fixture();
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    c.x = 285;
    c.y = 250;
    inspectForeignCustoms(s);
    const b = army(s, own);
    b.x = c.x;
    b.y = c.y;
    expect(canInterceptCaravan(s, c, 'player')).toBe(false);
    updateImperial(s, 0.1);
    expect(c.hp).toBe(100);
  });

  it('physically exchanges at the destination and credits the foreign city only on return', () => {
    const { s, own, foreign } = fixture();
    const coin = total(s, 'coin'),
      food = total(s, 'food'),
      stone = total(s, 'stone');
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    updateImperial(s, 1);
    expect(s.resources.food).toBe(0);
    expect(c.returning).not.toBe(true);
    c.x = own.x;
    c.y = own.y;
    updateImperial(s, 0);
    expect(c.returning).toBe(true);
    expect(c.arrived).not.toBe(true);
    expect(s.resources.food).toBe(10);
    expect(s.resources.stone).toBe(0);
    expect(foreign.resources.stone).toBe(0);
    expect(c.resources.stone).toBe(10);
    c.x = foreign.x;
    c.y = foreign.y;
    updateImperial(s, 0);
    expect(c.arrived).toBe(true);
    expect(foreign.resources.stone).toBe(10);
    expect(c.resources.stone).toBe(0);
    completeForeignMerchant(s, c);
    expect(foreign.resources.stone).toBe(10);
    expect(s.stats.trades).toBe(1);
    expect(total(s, 'coin')).toBe(coin);
    expect(total(s, 'food')).toBe(food);
    expect(total(s, 'stone')).toBe(stone);
  });

  it('does not record a trade or improve relations when no goods can be exchanged', () => {
    const { s, own, faction } = fixture(false);
    s.resources.stone = 0;
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    c.x = own.x;
    c.y = own.y;
    expect(completeForeignMerchant(s, c)).toBe('refusal');
    expect(c.returning).toBe(true);
    expect(c.resources.food).toBe(10);
    expect(s.stats.trades ?? 0).toBe(0);
    expect(faction.relation).toBe(0);
  });

  it('taxes an actual coin cargo and preserves the unspent purse in a cash purchase', () => {
    const { s, own, foreign } = fixture();
    foreign.resources.food = 0;
    foreign.resources.coin = 10;
    s.resources.food = 3;
    s.resources.ingot = 1; // An unaffordable ingot must not block a food purchase.
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    c.x = own.x;
    c.y = own.y;
    inspectForeignCustoms(s);
    expect(c.resources.coin).toBe(8);
    expect(s.resources.coin).toBe(2);
    expect(completeForeignMerchant(s, c)).toBe('exchange');
    expect(s.resources.coin).toBe(5);
    expect(s.resources.food).toBe(0);
    expect(c.resources.coin).toBe(5);
    expect(c.resources.food).toBe(3);
    completeForeignMerchant(s, c);
    expect(foreign.resources.coin).toBe(5);
    expect(foreign.resources.food).toBe(3);
  });

  it('takes merchandise from the provincial inventory while paying its coins to the imperial treasury', () => {
    const { s, own, foreign } = fixture(false);
    own.capital = false;
    own.resources = emptyInventory();
    own.resources.food = 3;
    s.resources.food = 9;
    foreign.resources.food = 0;
    foreign.resources.coin = 10;
    dispatchForeignMerchants(s);
    const c = s.caravans[0];
    expect(completeForeignMerchant(s, c)).toBe('exchange');
    expect(own.resources.food).toBe(0);
    expect(own.resources.coin).toBe(0);
    expect(s.resources.food).toBe(9);
    expect(s.resources.coin).toBe(3);
    expect(c.resources.food).toBe(3);
    expect(c.resources.coin).toBe(7);
  });
});
