import {
  BUILDING_SPECS,
  RESOURCE_ORDER,
  RESOURCE_SPECS,
  SEASONS,
  SEASON_TEMPERATURES,
} from './content';
import { getDogmaEffects } from './dogmas';
import {
  effectiveElapsed,
  getCalendar,
  secondsForEffectiveDuration,
  seasonStart,
} from './calendar';
import { imperialLawEffects } from './imperialLawPolicy';
import { resourceSpoilage } from './math';
import { openingFoodSpoilageMultiplier } from './foodPreservation';
import { thermalConditionsAt } from './thermal';
import { activeUnits, copy, distance, isPlayerBuilding, pay } from './runtime';
import type { Building, GameState, Inventory, Resource, Target } from './types';

export interface UpkeepReadiness {
  building: Building;
  scope: string;
  cost: Partial<Inventory>;
  missing: Partial<Inventory>;
  payable: boolean;
}
const targetOf = (b: Building): Target => ({ type: 'building', id: b.id, x: b.x, y: b.y });

/** Reserves today's stocks in the same order as seasonalCore, without rolling weather,
 * killing elders, crediting future harvests or claiming a prediction of player behaviour. */
export function getSeasonReadiness(state: GameState) {
  const calendar = getCalendar(state);
  const season = calendar.season;
  const remaining = calendar.seasonEnd - state.time;
  const horizonEnd = seasonStart(state, calendar.seasonIndex + 2);
  const effectiveHorizon = effectiveElapsed(state, state.time, horizonEnd);
  const nextSeason = (season + 1) % 4;
  const inventory = copy(state.resources);
  const provinces = new Map(
    state.cities
      .filter((c) => c.factionId === 'player' && !c.capital)
      .map((c) => [c.id, copy(c.resources)]),
  );
  const ground = state.entities
    .filter((e) => e.kind === 'ground' && e.resource === 'wood' && e.amount > 0)
    .map((e) => ({ ...e }));
  const fx = getDogmaEffects(state);
  const own = state.buildings.filter(
    (b) => isPlayerBuilding(state, b) && b.hp > 0 && b.completed !== false,
  );
  const upkeep: UpkeepReadiness[] = [];
  const paid = new Map<string, boolean>();
  for (const building of own) {
    const spec = BUILDING_SPECS[building.kind];
    if (spec.upkeepSeason !== undefined && spec.upkeepSeason !== season) continue;
    const cost = Object.fromEntries(
      Object.entries(spec.upkeep).map(([r, n]) => [r, n * fx.upkeep]),
    ) as Partial<Inventory>;
    const inv = provinces.get(building.cityId ?? '') ?? inventory;
    const materials = { ...cost };
    const sharedCoins = inv !== inventory;
    if (sharedCoins) delete materials.coin;
    const localWood =
      building.kind === 'campfire' && !building.cityId
        ? ground.filter((e) => distance(e, building) <= 15)
        : [];
    const localAmount = localWood.reduce((n, e) => n + e.amount, 0);
    const payable =
      Object.entries(materials).every(
        ([key, n]) => inv[key as Resource] + (key === 'wood' ? localAmount : 0) + 1e-9 >= n,
      ) &&
      (!sharedCoins || inventory.coin >= (cost.coin ?? 0));
    const missing = Object.fromEntries(
      Object.entries(cost)
        .map(([r, n]) => [
          r,
          Math.max(
            0,
            n -
              (r === 'coin' && sharedCoins ? inventory.coin : inv[r as Resource]) -
              (r === 'wood' ? localAmount : 0),
          ),
        ])
        .filter(([, n]) => Number(n) > 1e-7),
    ) as Partial<Inventory>;
    if (payable) {
      const wood = Math.min(inv.wood, materials.wood ?? 0);
      pay(inv, { ...materials, ...(materials.wood !== undefined ? { wood } : {}) });
      let localNeed = (materials.wood ?? 0) - wood;
      for (const pile of localWood) {
        const take = Math.min(pile.amount, localNeed);
        pile.amount -= take;
        localNeed -= take;
      }
      if (sharedCoins) inventory.coin -= cost.coin ?? 0;
    }
    paid.set(building.id, payable);
    if (Object.keys(cost).length)
      upkeep.push({
        building,
        cost,
        missing,
        payable,
        scope: state.cities.find((city) => city.id === building.cityId)?.name ?? 'Campo',
      });
  }
  const pool = [
    {
      id: 'home',
      label: state.cities.find((c) => c.capital && c.factionId === 'player')?.name ?? 'Campo',
      inventory,
      population: 0,
    },
    ...state.cities
      .filter((c) => provinces.has(c.id))
      .map((city) => ({
        id: city.id,
        label: city.name,
        inventory: provinces.get(city.id)!,
        population: Object.values(city.cohorts).reduce((n, v) => n + v, 0),
      })),
  ];
  const ownCities = state.cities.filter((c) => c.factionId === 'player');
  const capital = ownCities.find((c) => c.capital);
  pool[0].population =
    state.urbanized && capital
      ? Object.values(capital.cohorts).reduce((n, v) => n + v, 0) +
        activeUnits(state).filter((u) => !u.cityId || !ownCities.some((c) => c.id === u.cityId))
          .length
      : activeUnits(state).length;
  for (const entry of pool) {
    const storage =
      entry.id === 'home'
        ? own.some((b) => b.kind === 'storage' && b.active)
        : own.some((b) => b.cityId === entry.id && b.kind === 'storage' && b.active);
    for (const r of RESOURCE_ORDER) {
      const spec = RESOURCE_SPECS[r];
      if (spec.spoil > 0)
        entry.inventory[r] *=
          1 -
          (spec.category === 'food'
            ? resourceSpoilage(spec.spoil, season === 1, storage, entry.inventory.pottery > 0) *
              openingFoodSpoilageMultiplier(state, calendar.seasonIndex)
            : spec.spoil);
    }
  }
  const ration = imperialLawEffects(state).foodConsumptionMultiplier;
  const food = pool
    .map((entry) => {
      const safeNutrition =
        entry.inventory.food * RESOURCE_SPECS.food.nutrition +
        entry.inventory.cooked * RESOURCE_SPECS.cooked.nutrition;
      const effectiveSeconds =
        entry.population > 0 ? safeNutrition / (entry.population * 0.8 * ration) : Infinity;
      const seconds = Number.isFinite(effectiveSeconds)
        ? secondsForEffectiveDuration(state, state.time, effectiveSeconds)
        : Infinity;
      return {
        id: entry.id,
        label: entry.label,
        population: entry.population,
        safeNutrition,
        rawMeat: entry.inventory.meat,
        seconds,
        sufficient: effectiveSeconds + 1e-9 >= effectiveHorizon,
      };
    })
    .filter((entry) => entry.population > 0);
  const unprotectedPens = own
    .filter((b) => b.kind === 'pen' && (b.livestock ?? 0) > 0)
    .map((building) => {
      const original = provinces.get(building.cityId ?? '')
        ? state.cities.find((c) => c.id === building.cityId)!.resources
        : state.resources;
      return {
        building,
        available: original.food,
        required: BUILDING_SPECS.pen.upkeep.food! * fx.upkeep,
      };
    });
  const homes = own.filter(
    (b) => ['house', 'hut'].includes(b.kind) && (paid.get(b.id) ?? b.active),
  );
  const fires = own.filter((b) => b.kind === 'campfire' && (paid.get(b.id) ?? b.active));
  const fireAtHome = fires.some((b) => distance(b, state.home) <= 15);
  const shelter = homes
    .filter((b) => distance(b, state.home) <= 10)
    .sort((a, b) => distance(a, state.home) - distance(b, state.home))[0];
  const ambient = SEASON_TEMPERATURES[nextSeason].night;
  const people = activeUnits(state).filter((u) => !state.urbanized || !u.cityId);
  const projectedState = {
    ...state,
    buildings: state.buildings.map((building) => ({
      ...building,
      active: paid.get(building.id) ?? building.active,
    })),
  };
  const coldExposed = people.filter(
    (unit) => thermalConditionsAt(projectedState, unit, state.home, ambient).delta < 0,
  );
  const rawMeat =
    state.resources.meat +
    ownCities.filter((c) => !c.capital).reduce((n, c) => n + c.resources.meat, 0);
  return {
    season,
    nextSeason,
    nextName: SEASONS[nextSeason],
    remaining,
    upkeep,
    food,
    rawMeat,
    coldExposed: coldExposed.length,
    coldEvaluated: people.length,
    fireAtHome,
    shelter,
    targetOf,
    unprotectedPens,
    missingUpkeep: upkeep.filter((u) => !u.payable),
  };
}
