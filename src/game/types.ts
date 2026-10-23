export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export type WordKind = 'S' | 'V' | 'O' | 'M' | 'C';
export interface Word {
  id: string;
  label: string;
  kind: WordKind;
  tier: Tier;
  complexity: number;
  description: string;
  recipe: string[];
  event: string;
  hint: string;
  alternatives?: string[][];
  eventTags?: string[];
}
export interface WordMemory {
  retention: number;
  custodians: string[];
  uses: number;
  investment?: number;
  support?: number;
}
/** food is RES_BERRY, never a generic aggregate. */
export type Resource =
  | 'food'
  | 'meat'
  | 'cooked'
  | 'wood'
  | 'stone'
  | 'pelt'
  | 'seed'
  | 'ore'
  | 'ingot'
  | 'tool'
  | 'spear'
  | 'pottery'
  | 'metalArms'
  | 'coin';
export type Inventory = Record<Resource, number>;
export interface ResourceSpec {
  id: string;
  label: string;
  nutrition: number;
  spoil: number;
  wear: number;
  category: 'food' | 'material' | 'currency';
  wordId?: string;
}
export type EntityKind =
  | 'berries'
  | 'tree'
  | 'stone'
  | 'deer'
  | 'wolf'
  | 'alpha'
  | 'mammoth'
  | 'corpse'
  | 'ore'
  | 'seedling'
  | 'ground';
export interface MapEntity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  amount: number;
  hp: number;
  maxHp: number;
  originX?: number;
  originY?: number;
  attacked?: boolean;
  maxAmount?: number;
  sectorId?: string;
  factionId?: string;
  domesticated?: boolean;
  burning?: boolean;
  bornAt?: number;
  resource?: Resource;
  dropped?: number;
}
export type BuildingKind =
  | 'campfire'
  | 'storage'
  | 'depot'
  | 'menhir'
  | 'stele'
  | 'farm'
  | 'pen'
  | 'foundry'
  | 'hut'
  | 'palisade'
  | 'house'
  | 'grave'
  | 'temple'
  | 'walls'
  | 'archive'
  | 'palace'
  | 'market'
  | 'court'
  | 'school'
  | 'workshop';
export interface BuildingSpec {
  id: string;
  label: string;
  maxHp: number;
  workers: number;
  workerKind?: 'any' | 'sage' | 'warrior';
  cost: Partial<Inventory>;
  alternativeCost?: Partial<Inventory>;
  upkeep: Partial<Inventory>;
  upkeepSeason?: number;
  recipe: string[];
  housing?: number;
  capacity?: number;
  unique?: boolean;
  description: string;
}
export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  hp: number;
  active: boolean;
  workerIds?: string[];
  cityId?: string;
  fixedWordId?: string;
  completed?: boolean;
  progress?: number;
  livestock?: number;
  lastEfficiency?: number;
  /** Real village work, retained across the boundary until settlement (decision A-34). */
  seasonWork?: Record<
    string,
    {
      efficiencySeconds: number;
      workerSeconds: Record<string, number>;
      commandSeconds?: Record<string, Record<string, number>>;
    }
  >;
}
export type Caste = 'citizen' | 'warrior' | 'sage' | 'slave';
export interface MemoryEvent {
  tag: string;
  time: number;
  weight: number;
  wordIds: string[];
}
export interface Unit {
  id: string;
  name: string;
  sex?: 'M' | 'F';
  parentIds?: [string, string];
  bornAt?: number;
  deathAt?: number;
  x: number;
  y: number;
  hp: number;
  hunger: number;
  temp: number;
  age: number;
  strength: number;
  intelligence: number;
  action: string;
  targetId?: string;
  tx?: number;
  ty?: number;
  progress: number;
  knows: string[];
  command?: string[];
  carry?: { resource: Resource; amount: number };
  isolation: number;
  sleptThisNight?: boolean;
  restedThisSeason?: boolean;
  caste?: Caste;
  eventMemory?: MemoryEvent[];
  tension?: Record<string, number>;
  cooldowns?: Record<string, number>;
  parasiteUntil?: number;
  plagueUntil?: number;
  huntCount?: number;
  workCycles?: number;
  cityId?: string;
  wealth?: number;
  lawfulSeasons?: number;
  isKing?: boolean;
  factionId?: string;
  paidConstruction?: Partial<Inventory>;
  buildingKind?: BuildingKind;
  equipment?: Resource;
  emancipated?: boolean;
  initialStrength?: number;
  initialIntelligence?: number;
  droppedResource?: Resource;
  lastDamageCause?: string;
  /** A new hostile wound, consumed once by the next individual FSM update. */
  pendingCombatDamage?: boolean;
  lastOrderAt?: number;
  lastNightEvent?: number;
  lastEventAt?: Record<string, number>;
  jobBuildingId?: string;
  suspendedJob?: { buildingId: string; command: string[] };
  craftNeedsPayment?: boolean;
}
export interface Spark {
  id: string;
  wordId: string;
  unitId: string;
  eventLabel: string;
  expiresAt: number;
  recipe: string[];
  hint: string;
  correctTokens?: string[];
}
export type DogmaVector =
  | 'prohibition'
  | 'veneration'
  | 'monopoly'
  | 'sacrifice'
  | 'protection'
  | 'sanctuary'
  | 'property'
  | 'martyr';
export interface Dogma {
  id: string;
  targetId: string;
  vectorId: string;
  name: string;
  age: number;
  weight: number;
  description: string;
  vector?: DogmaVector;
  bornAt?: number;
  reforming?: boolean;
  private?: boolean;
}
export interface LogEntry {
  id: string;
  time: number;
  text: string;
  tone: 'info' | 'good' | 'warning' | 'danger' | 'discovery';
}
/** Persistent, bounded history of changes the player should be able to notice. */
export interface TribeEvent {
  id: string;
  time: number;
  kind: 'birth' | 'death' | 'word-lost';
  unitId?: string;
  parentIds?: [string, string];
  wordId?: string;
  cause?: string;
  wordIds?: string[];
  lostWordIds?: string[];
}
export interface Target {
  type: 'point' | 'entity' | 'unit' | 'building' | 'city' | 'battalion' | 'caravan';
  id?: string;
  x: number;
  y: number;
}
export type WorldTarget = Target;
export interface Compilation {
  valid: boolean;
  message: string;
  action?: string;
  requiresTarget: boolean;
  subject?: string;
  verb?: string;
  args?: string[];
  condition?: string;
  kind?: 'direct' | 'tradition' | 'law' | 'dogma';
  buildingKind?: BuildingKind;
  cost?: Partial<Inventory>;
}
export interface Tradition {
  id: string;
  tokens: string[];
  target?: Target;
  subjectId?: string;
  createdAt: number;
  name?: string;
}
export interface Law {
  id: string;
  tokens: string[];
  name: string;
  subjectId: string;
  verbId: string;
  objectId: string;
  modifierId: string;
  sanctionId: string;
  prohibitive: boolean;
  age: number;
  description?: string;
}
export interface Cohorts {
  workers: number;
  warriors: number;
  sages: number;
  slaves: number;
}
export interface City {
  frontlineSageIds?: string[];
  id: string;
  name: string;
  x: number;
  y: number;
  sectorX: number;
  sectorY: number;
  factionId: string;
  cohorts: Cohorts;
  resources: Inventory;
  words: string[];
  dogmas: Dogma[];
  revoltTension: number;
  housing: number;
  buildingIds: string[];
  vocations: Tradition[];
  loyalty: number;
  assimilation: { delegateCount: number; active: boolean };
  production: Inventory;
  capital?: boolean;
  garrisonHp?: number;
  occupation?: number;
  foundedAt?: number;
  seasonFoodConsumed?: number;
  lawfulSeasons?: number;
  lastTax?: number;
  corruption?: number;
  rebelling?: boolean;
}
export interface Faction {
  eventMemory?: MemoryEvent[];
  tension?: Record<string, number>;
  craftCycles?: Record<string, number>;
  id: string;
  name: string;
  words: string[];
  dogmas: Dogma[];
  relation: number;
  hostile: boolean;
  cityId: string;
  lastTradeAt?: number;
  lastExpansionAt?: number;
  subjugated?: boolean;
  peaceUntil?: number;
  intelligibility?: number;
}
export interface Battalion {
  frontlineSageIds?: string[];
  id: string;
  name: string;
  x: number;
  y: number;
  cityId: string;
  factionId: string;
  hp: number;
  maxHp: number;
  morale: number;
  targetId?: string;
  target?: Target;
  tx?: number;
  ty?: number;
  action: string;
  catapult: boolean;
  cavalry?: boolean;
  occupation: number;
  attackProgress?: number;
  lastSoldierLoss?: number;
  metalWeapons?: number;
}
export interface Caravan {
  customsPaid?: number;
  customsRefused?: boolean;
  gift?: boolean;
  id: string;
  kind: 'trade' | 'tax' | 'colonists' | 'delegate';
  x: number;
  y: number;
  fromCityId: string;
  toCityId?: string;
  factionId: string;
  resources: Inventory;
  population: number;
  target: Target;
  hp: number;
  arrived?: boolean;
  corruption?: number;
  words?: string[];
  dogmas?: Dogma[];
  delegateCount?: number;
  returning?: boolean;
  progress?: number;
  sourceResource?: Resource;
  amount?: number;
}
export interface Sector {
  id: string;
  x: number;
  y: number;
  explored: boolean;
  faunaCapacity: number;
  initialFauna?: number;
  biome: 'forest' | 'plain' | 'mountain' | 'river';
  cityId?: string;
}
export interface DisasterState {
  storm: boolean;
  drought: boolean;
  blizzard: boolean;
  lightning: boolean;
  lastSummerYear: number;
  lastWinterYear: number;
}
export interface GameState {
  version: 2;
  playMode?: 'guided' | 'classic';
  seed: number;
  time: number;
  seasonIndex: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  started: boolean;
  units: Unit[];
  entities: MapEntity[];
  buildings: Building[];
  resources: Inventory;
  words: Record<string, WordMemory>;
  tier: Tier;
  voice: number;
  voiceProgress: number;
  cohesion: number;
  attention: number;
  nightCount: number;
  sparks: Spark[];
  dogmas: Dogma[];
  logs: LogEntry[];
  tribeEvents?: TribeEvent[];
  explored: { x: number; y: number }[];
  stats: {
    commands: number;
    discoveries: number;
    hunts: number;
    deaths: number;
    births: number;
    taught: number;
    seasonsSurvived: number;
    trades?: number;
    conquests?: number;
  };
  campfirePending: boolean;
  gameOver: string | null;
  milestone: boolean;
  tension: Record<string, number>;
  cooldowns: Record<string, number>;
  eventTimes: Record<string, number>;
  nightSleeping: number;
  lastHunt: number;
  revision: number;
  cities: City[];
  factions: Faction[];
  battalions: Battalion[];
  caravans: Caravan[];
  traditions: Tradition[];
  laws: Law[];
  sectors: Sector[];
  inequality: number;
  revoltTension: number;
  corruption: number;
  urbanized: boolean;
  kingId: string | null;
  government: 'tribe' | 'monarchy' | 'republic';
  victory: null | 'imperial' | 'cultural' | 'philosophical';
  victoryProgress: { imperialSeasons: number };
  tierDeficitSeasons: number;
  lockedSlot: boolean;
  emancipated: boolean;
  philosophy: boolean;
  disasters: DisasterState;
  home: { x: number; y: number };
  burntWood: number;
  pendingSeason?: boolean;
  recentTrauma?: { tag: string; time: number };
  dogmaReformTargets?: string[];
  lastCraftWord?: string;
  lastCraftUnit?: string;
  bornWords?: Record<string, number>;
  lostArchive?: boolean;
  foodPriority?: { subjectId: string; unitId?: string };
}
export interface Objective {
  title: string;
  description: string;
  progress: number;
  current: number;
  total: number;
  wordId?: string;
}
