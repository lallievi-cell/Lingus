import { BUILDING_SPECS, emptyInventory, WORD_ORDER } from '../../src/game/content';
import { createGame, dismissCampfire, tick } from '../../src/game/engine';
import type { BuildingKind, City, GameState } from '../../src/game/types';

/** Prepared, fully abstract urban cohorts, finite stocks and completed buildings.
 * This isolates continuous late-game routes; it is not a seven-person campaign,
 * a demographic balance test or proof of individual custodian succession.
 * After this fixture, replay code uses only public orders and continuous ticks.
 */
export function preparedUrbanRoute(seed = 6842) {
  const state = createGame(seed, 'guided');
  // Prepared late-game cohorts use the ordinary, pre-opening-balance calendar.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  Object.assign(state, {
    started: true,
    paused: false,
    tier: 5,
    urbanized: true,
    time: 0,
    units: [],
    entities: [],
    buildings: [],
    cities: [],
    factions: [],
    caravans: [],
    traditions: [],
    laws: [],
    dogmas: [],
  });
  state.resources = {
    ...emptyInventory(),
    food: 60,
    meat: 40,
    wood: 140,
    stone: 60,
    seed: 20,
    pottery: 1,
    coin: 2000,
  };
  state.words = Object.fromEntries(
    WORD_ORDER.map((id) => [id, { retention: 100, custodians: [], uses: 0 }]),
  );
  const addCity = (id: string, factionId = 'player', x = 250): City => {
    const own = factionId === 'player';
    const city: City = {
      id,
      name: id,
      x,
      y: 250,
      sectorX: Math.floor(x / 100),
      sectorY: 2,
      factionId,
      cohorts: { workers: own ? 12 : 5, warriors: 0, sages: own ? 8 : 1, slaves: 0 },
      resources: own ? state.resources : { ...state.resources },
      words: own ? [...WORD_ORDER] : ['S_01', 'V_01', 'V_02', 'V_03'],
      dogmas: [],
      revoltTension: 0,
      housing: own ? 20 : 6,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      capital: own,
      garrisonHp: 0,
    };
    state.cities.push(city);
    return city;
  };
  const addBuilding = (city: City, kind: BuildingKind) => {
    const building = {
      id: `${city.id}-${kind}-${state.buildings.length}`,
      kind,
      x: city.x,
      y: city.y,
      cityId: city.id,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      workerIds: [],
      lastEfficiency: 1,
      ...(kind === 'pen' ? { livestock: 4 } : {}),
    };
    state.buildings.push(building);
    city.buildingIds.push(building.id);
    return building;
  };
  const capital = addCity('capital');
  for (const kind of ['campfire', 'storage', 'depot', 'pen', 'pen', 'farm', 'archive'] as const)
    addBuilding(capital, kind);
  return { state, capital, addCity, addBuilding };
}

export function advanceUrbanRoute(state: GameState, until: number) {
  let current = state;
  const boundaries: {
    time: number;
    food: number;
    meat: number;
    coin: number;
    imperialSeasons: number;
  }[] = [];
  while (current.time < until && !current.victory && !current.gameOver) {
    current = tick(current, Math.min(5, until - current.time));
    if (current.campfirePending) {
      boundaries.push({
        time: current.time,
        food: current.resources.food,
        meat: current.resources.meat,
        coin: current.resources.coin,
        imperialSeasons: current.victoryProgress.imperialSeasons,
      });
      current = dismissCampfire(current);
    }
  }
  return { state: current, boundaries };
}
