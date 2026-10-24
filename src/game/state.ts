import { HOME, INNATE_WORDS, BASE_HOUSING, emptyInventory } from './content';
import { generateWorld } from './worldGeneration';
import type { City, Faction, GameState, MapEntity, MapMode, Sector, Unit } from './types';

/** Exactly the seven Seed Zero people, in the order stated in the final GDD. */
export function createInitialState(
  seed = 6842,
  playMode: 'guided' | 'classic' = 'classic',
  mapMode: MapMode = 'seed-zero',
): GameState {
  const people: [string, number, number, number, number, number][] = [
    ['Korg', 8, 8, 4, 100, 20],
    ['Ayla', 10, 4, 8, 100, 20],
    ['Nara', 6, 5, 6, 100, 20],
    ['Oru', 7, 6, 5, 100, 20],
    ['Tala', 6, 5, 5, 100, 20],
    ['Uma', 14, 3, 9, 80, 30],
    ['Ilo', 2, 2, 6, 60, 10],
  ];
  const units: Unit[] = people.map(([name, age, strength, intelligence, hp, hunger], i) => ({
    id: `unit-${i}`,
    name,
    sex: (['M', 'F', 'F', 'M', 'F', 'F', 'M'] as const)[i],
    x: HOME.x + Math.cos(i * 2.4) * 4,
    y: HOME.y + Math.sin(i * 2.4) * 4,
    hp,
    hunger,
    temp: 100,
    age: playMode === 'guided' && name === 'Uma' ? 12 : age,
    strength,
    intelligence,
    initialStrength: strength,
    initialIntelligence: intelligence,
    action: 'idle',
    progress: 0,
    knows: [...INNATE_WORDS],
    isolation: 0,
    caste: 'citizen',
    eventMemory: [],
    tension: {},
    cooldowns: {},
    huntCount: 0,
    workCycles: 0,
    wealth: 0,
    lawfulSeasons: 0,
    factionId: 'player',
  }));
  const sectors: Sector[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      sectors.push({
        id: `sector-${x}-${y}`,
        x,
        y,
        explored: x === 2 && y === 2,
        faunaCapacity: 20,
        initialFauna: x === 2 && y === 2 ? 8 : 0,
        biome: x === 4 ? 'mountain' : x === 3 ? 'river' : x < 2 ? 'forest' : 'plain',
      });
  const entities: MapEntity[] = [];
  const add = (kind: MapEntity['kind'], x: number, y: number, amount: number, hp: number) =>
    entities.push({
      id: `entity-${entities.length}`,
      kind,
      x,
      y,
      amount,
      maxAmount: amount,
      hp,
      maxHp: hp,
      originX: x,
      originY: y,
      sectorId: 'sector-2-2',
    });
  [
    [243, 244],
    [257, 248],
    [250, 267],
  ].forEach(([x, y]) => add('berries', x, y, 20, 1));
  [
    [223, 229],
    [226, 226],
    [230, 224],
    [236, 222],
    [242, 220],
    [259, 222],
    [266, 226],
    [275, 230],
    [280, 238],
    [283, 249],
    [278, 275],
    [270, 282],
    [239, 283],
    [224, 275],
    [217, 260],
  ].forEach(([x, y]) => add('tree', x, y, 20, 100));
  [
    [238, 233],
    [271, 262],
  ].forEach(([x, y]) => add('stone', x, y, 100, 100));
  [
    [261, 269],
    [268, 273],
    [274, 266],
    [225, 215],
    [230, 211],
    [278, 245],
  ].forEach(([x, y]) => add('deer', x, y, 2, 30));
  add('wolf', 202, 214, 1, 45);
  add('wolf', 296, 285, 1, 45);
  add('ore', 289, 208, 500, 100);
  for (const sector of sectors.filter((z) => z.x !== 2 || z.y !== 2)) {
    const ox = sector.x * 100,
      oy = sector.y * 100;
    const extra = (kind: MapEntity['kind'], x: number, y: number, amount: number, hp: number) => {
      add(kind, ox + x, oy + y, amount, hp);
      entities[entities.length - 1].sectorId = sector.id;
    };
    for (const [x, y] of [
      [30, 38],
      [51, 47],
      [71, 63],
    ])
      extra('berries', x, y, 20, 1);
    for (let i = 0; i < 10; i++) extra('tree', 13 + ((i * 19) % 76), 17 + ((i * 23) % 70), 20, 100);
    for (const [x, y] of [
      [28, 22],
      [73, 77],
    ])
      extra('stone', x, y, 100, 100);
    for (let i = 0; i < 6; i++) extra('deer', 18 + ((i * 13) % 67), 30 + ((i * 11) % 55), 2, 30);
    if (sector.biome === 'mountain') extra('ore', 81, 24, 500, 100);
    if ((sector.x + sector.y) % 3 === 0) extra('alpha', 83, 79, 3, 120);
    if (sector.x === 4 && sector.y === 0) extra('mammoth', 85, 17, 10, 300);
  }
  const factions: Faction[] = [
    {
      id: 'faction-forest',
      name: 'Il Popolo dei Rami',
      words: [...INNATE_WORDS, 'O_01', 'O_03', 'V_04', 'M_01', 'S_05'],
      dogmas: [],
      relation: 0,
      hostile: false,
      cityId: 'city-forest',
    },
    {
      id: 'faction-stone',
      name: 'Le Voci della Selce',
      words: [...INNATE_WORDS, 'O_01', 'O_02', 'V_06', 'O_05', 'M_01'],
      dogmas: [],
      relation: 0,
      hostile: false,
      cityId: 'city-stone',
    },
    {
      id: 'faction-river',
      name: 'I Figli del Fiume',
      words: [...INNATE_WORDS, 'O_01', 'O_04', 'V_04', 'V_05', 'M_02'],
      dogmas: [],
      relation: 0,
      hostile: false,
      cityId: 'city-river',
    },
    {
      id: 'faction-dawn',
      name: 'I Custodi dell’Alba',
      words: [...INNATE_WORDS, 'O_01', 'O_03', 'C_01', 'M_01', 'M_03'],
      dogmas: [],
      relation: 0,
      hostile: false,
      cityId: 'city-dawn',
    },
  ];
  const corners = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  const cities: City[] = factions.map((f, i) => {
    const [sectorX, sectorY] = corners[i],
      resources = emptyInventory();
    resources.food = 20;
    resources.wood = 20;
    resources.stone = 10;
    const city: City = {
      id: f.cityId,
      name: f.name,
      x: sectorX * 100 + 50,
      y: sectorY * 100 + 50,
      sectorX,
      sectorY,
      factionId: f.id,
      cohorts: { workers: 8, warriors: 2, sages: 2, slaves: 0 },
      resources,
      words: [...f.words],
      dogmas: [],
      revoltTension: 0,
      housing: 20,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { delegateCount: 0, active: false },
      production: emptyInventory(),
      garrisonHp: 200,
      occupation: 0,
      foundedAt: 0,
      lawfulSeasons: 0,
      corruption: 0,
    };
    sectors.find((s) => s.x === sectorX && s.y === sectorY)!.cityId = city.id;
    return city;
  });
  const state: GameState = {
    version: 2,
    playMode,
    mapGeneration: { mode: mapMode, seed: seed >>> 0, version: 1 },
    seed: seed >>> 0,
    time: 0,
    seasonIndex: 0,
    paused: false,
    speed: 1,
    started: false,
    units,
    entities,
    buildings: [],
    resources: emptyInventory(),
    words: Object.fromEntries(
      INNATE_WORDS.map((id) => [
        id,
        { retention: 100, custodians: units.map((u) => u.id), uses: 0, investment: 0, support: 0 },
      ]),
    ),
    tier: 0,
    voice: 3,
    voiceProgress: 0,
    cohesion: 100,
    attention: 0,
    nightCount: 0,
    sparks: [],
    dogmas: [],
    tribeEvents: [],
    logs: [
      {
        id: 'log-0',
        time: 0,
        text: 'Sette vite nella valle. Quattro parole innate: Gruppo, Andare, Mangiare, Colpire.',
        tone: 'info',
      },
    ],
    explored: [{ ...HOME }],
    stats: {
      commands: 0,
      discoveries: 0,
      hunts: 0,
      deaths: 0,
      births: 0,
      taught: 0,
      seasonsSurvived: 0,
      trades: 0,
      conquests: 0,
    },
    campfirePending: false,
    gameOver: null,
    milestone: false,
    tension: {},
    cooldowns: {},
    eventTimes: {},
    nightSleeping: 0,
    lastHunt: -1000,
    revision: 1000,
    cities,
    factions,
    battalions: [],
    caravans: [],
    traditions: [],
    laws: [],
    sectors,
    inequality: 0,
    revoltTension: 0,
    corruption: 0,
    urbanized: false,
    kingId: null,
    government: 'tribe',
    victory: null,
    victoryProgress: { imperialSeasons: 0 },
    tierDeficitSeasons: 0,
    lockedSlot: false,
    emancipated: false,
    philosophy: false,
    disasters: {
      storm: false,
      drought: false,
      blizzard: false,
      lightning: false,
      lastSummerYear: 0,
      lastWinterYear: 0,
    },
    home: { ...HOME },
    burntWood: 0,
  };
  if (mapMode === 'random') Object.assign(state, generateWorld(seed >>> 0, factions));
  return state;
}
export const INITIAL_HOUSING = BASE_HOUSING;
