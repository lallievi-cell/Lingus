import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { BUILDING_SPECS } from './content';
import { developForeignCulture } from './foreignCulture';
import { seasonalCore } from './simulation';
import { seasonalImperial, updateImperial } from './imperial';
import { updateForeignPolicy } from './foreignPolicy';
import { validSave } from './saveValidation';
import type { GameState } from './types';

function preparedCouncil() {
  const state = createGame(6842);
  const faction = state.factions[3],
    city = state.cities[3];
  faction.words.push('C_02', 'V_05', 'V_06', 'O_02', 'O_05', 'V_07', 'M_02');
  faction.eventMemory = [{ tag: 'ENV_NIGHTFALL', time: 0, weight: 25, wordIds: ['C_01'] }];
  faction.craftCycles = { V_07: 5, V_08: 3 };
  return { state, faction, city };
}

function addMonument(state: GameState, cityId: string) {
  const building = {
    id: 'prepared-menhir',
    kind: 'menhir' as const,
    cityId,
    x: 50,
    y: 450,
    hp: BUILDING_SPECS.menhir.maxHp,
    active: true,
    completed: true,
  };
  state.buildings.push(building);
  return building;
}

describe('foreign doctrines grow out of real local practices', () => {
  it('does not create a religion without a monument, repeated practice and available sages', () => {
    const { state, faction, city } = preparedCouncil();
    const words = [...faction.words],
      stock = { ...city.resources };
    state.eventTimes[`foreignHearthPromises:${city.id}`] = 2;
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toEqual([]);
    addMonument(state, city.id);
    state.eventTimes[`foreignHearthPromises:${city.id}`] = 0;
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toEqual([]);
    state.eventTimes[`foreignHearthPromises:${city.id}`] = 2;
    city.cohorts.sages = 0;
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toEqual([]);
    expect(faction.words).toEqual(words);
    expect(city.resources).toEqual(stock);
  });

  it('uses only known concepts and limits successive doctrines without modifying the player', () => {
    const { state, faction, city } = preparedCouncil();
    addMonument(state, city.id);
    state.eventTimes[`foreignHearthPromises:${city.id}`] = 2;
    const player = structuredClone(state.dogmas),
      words = [...faction.words];
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toHaveLength(1);
    expect(city.dogmas).toHaveLength(1);
    expect(faction.words).toEqual(words);
    for (const dogma of faction.dogmas) {
      expect(words).toContain(dogma.targetId);
      expect(words).toContain(dogma.vectorId);
    }
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toHaveLength(1);
    state.time = 360;
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toHaveLength(2);
    state.time = 720;
    developForeignCulture(state, city, faction);
    expect(faction.dogmas).toHaveLength(2);
    expect(state.dogmas).toEqual(player);
  });

  it('reaches a religious request from untouched AI history, rather than assigning it a prepared dogma', () => {
    const state = createGame(6842);
    state.units = []; // Isolate foreign society; this is not a player campaign.
    const dawn = state.factions[3],
      city = state.cities[3];
    expect(dawn.dogmas).toEqual([]);
    expect(dawn.words).not.toContain('C_02');
    let stonePaidForMonument = false;
    for (let step = 1; step <= 900 * 4; step++) {
      state.time = step / 4;
      state.tier = state.time >= 720 ? 3 : 0;
      updateForeignPolicy(state, 0.25);
      updateImperial(state, 0.25);
      if (step % 360 === 0) {
        const beforeStone = city.resources.stone;
        const hadMonument = state.buildings.some(
          (b) => b.cityId === city.id && b.kind === 'menhir',
        );
        seasonalCore(state);
        seasonalImperial(state);
        if (
          !hadMonument &&
          state.buildings.some((b) => b.cityId === city.id && b.kind === 'menhir')
        )
          stonePaidForMonument =
            beforeStone + city.production.stone - city.resources.stone >=
            BUILDING_SPECS.menhir.cost.stone!;
      }
      if (state.time === 810) {
        expect(dawn.dogmas.length).toBeGreaterThan(0);
        // The player's opposing doctrine is the policy fixture. The foreign
        // doctrine, words, monument, fuel and work above are all actually earned.
        const doctrine = dawn.dogmas.at(-1)!;
        state.dogmas = [{ ...doctrine, id: 'player-opposite', vectorId: 'M_01' }];
      }
    }
    expect(stonePaidForMonument).toBe(true);
    expect(dawn.words).toContain('C_02');
    expect(state.eventTimes[`foreignHearthPromises:${city.id}`]).toBeGreaterThanOrEqual(2);
    expect(dawn.dogmas.length).toBeGreaterThan(0);
    expect(
      state.foreignPolicy?.ultimata.some(
        (entry) => entry.factionId === dawn.id && entry.kind === 'religious',
      ),
    ).toBe(true);
    expect(validSave(state)).toBe(true);
  });
});
