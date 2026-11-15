import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';
import { createGame, issueCommand, parseGame, serializeGame } from './engine';
import { validSave } from './saveValidation';
import { migrateCoastalInventories } from './coastalInventoryMigration';
import { createCoastGeometry } from './coastGeometry';
import { createBuilding } from './simulation';

describe('coastal save compatibility', () => {
  it('migrates absent fields in every old inventory without replacing present invalid data', () => {
    const inventories = Array.from({ length: 7 }, () => ({ food: 2 }) as Record<string, unknown>);
    const state = {
      resources: inventories[0],
      cities: [{ resources: inventories[1], production: inventories[2] }],
      caravans: [{ resources: inventories[3] }],
      foreignPolicy: {
        raids: [
          { resources: inventories[4] },
          { resources: inventories[5] },
          { resources: inventories[6] },
        ],
      },
    };
    inventories[0].fish = -1;
    inventories[1].fish = null;
    inventories[2].fish = '3';
    inventories[3].fish = NaN;
    migrateCoastalInventories(state);
    expect(inventories.map((stock) => stock.fish)).toEqual([-1, null, '3', NaN, 0, 0, 0]);
    expect(inventories.every((stock) => stock.cookedFish === 0)).toBe(true);
    const legacy = createGame();
    delete (legacy.resources as Partial<typeof legacy.resources>).fish;
    delete (legacy.resources as Partial<typeof legacy.resources>).cookedFish;
    for (const city of legacy.cities)
      for (const stock of [city.resources, city.production]) {
        delete (stock as Partial<typeof stock>).fish;
        delete (stock as Partial<typeof stock>).cookedFish;
      }
    expect(parseGame(serializeGame(legacy))?.resources.fish).toBe(0);
    expect(
      parseGame(serializeGame(legacy))?.cities.every(
        (city) => city.resources.cookedFish === 0 && city.production.fish === 0,
      ),
    ).toBe(true);
  });

  it('strictly validates opt-in metadata, actual fishery ground and complete new inventories', () => {
    const state = createInitialState(42, 'guided', 'random', 1000);
    expect(validSave(state)).toBe(true);
    expect(parseGame(serializeGame(state))).toEqual({ ...state, paused: true });
    for (const override of [
      { coastalRules: 2 },
      { landNavigation: undefined },
      { regionalCultures: undefined },
      { biomeRules: undefined },
      { worldSize: undefined },
      { mode: 'seed-zero' },
    ]) {
      const invalid = structuredClone(state);
      Object.assign(invalid.mapGeneration!, override);
      expect(validSave(invalid)).toBe(false);
    }
    const incomplete = structuredClone(state);
    delete (incomplete.resources as Partial<typeof incomplete.resources>).fish;
    expect(parseGame(serializeGame(incomplete))).toBeNull();
    const wet = structuredClone(state),
      fishery = wet.entities.find((entity) => entity.kind === 'fishery')!;
    Object.assign(fishery, createCoastGeometry(state)!.points[10]);
    expect(validSave(wet)).toBe(false);
    const wrong = structuredClone(state);
    wrong.units[0].cookInput = 'meat' as never;
    expect(validSave(wrong)).toBe(false);
    let paid = structuredClone(state);
    paid.started = true;
    paid.tier = 2;
    paid.units = paid.units.slice(0, 1);
    Object.assign(paid.units[0], { ...paid.home, age: 8 });
    for (const word of ['V_07', 'O_04', 'O_05']) {
      paid.words[word] = { retention: 100, uses: 0, custodians: [paid.units[0].id] };
      paid.units[0].knows.push(word);
    }
    createBuilding(paid, 'campfire', paid.home.x, paid.home.y);
    paid.resources.fish = 1;
    paid = issueCommand(paid, ['S_01', 'V_07', 'O_04', 'O_05']);
    expect(paid.stats.commands).toBe(1);
    expect(paid.resources.fish).toBe(0);
    expect(parseGame(serializeGame(paid))?.units[0].cookInput).toBe('fish');
    for (const override of [
      { action: 'idle' },
      { action: 'dead' },
      { hp: 0 },
      { command: undefined },
      { command: ['S_01', 'V_04', 'O_04'] },
      { command: ['S_01', 'V_07', 'O_02', 'O_05'] },
      { craftNeedsPayment: true },
    ]) {
      const invalid = structuredClone(paid);
      Object.assign(invalid.units[0], override);
      expect(parseGame(serializeGame(invalid))).toBeNull();
    }
    const legacyPaid = createGame();
    Object.assign(legacyPaid.units[0], {
      action: 'cooking',
      command: ['S_01', 'V_07', 'O_04', 'O_05'],
      cookInput: 'fish',
    });
    expect(parseGame(serializeGame(legacyPaid))).toBeNull();
  });
});
