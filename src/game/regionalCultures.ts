import { INNATE_WORDS } from './content';
import type { BuildingKind, Faction, RegionalCultureId, Resource, Sector } from './types';

export interface RegionalCultureProfile {
  label: string;
  description: string;
  preferredBiomes: readonly Sector['biome'][];
  buildingPriorities: readonly BuildingKind[];
  materialPriorities: readonly Resource[];
  tradePreferences: readonly Resource[];
  expansionIntervalSeconds: number;
  borderFrictionPerSeason: number;
  merchantIntervalSeconds: number;
}

/** Planning preferences, never multipliers for production or free supplies. */
export const REGIONAL_CULTURES: Record<RegionalCultureId, RegionalCultureProfile> = {
  forest: {
    label: 'Gente dei boschi',
    description: 'Cerca boschi e prepara riserve prima di allargare il proprio territorio.',
    preferredBiomes: ['forest', 'plain'],
    buildingPriorities: ['storage', 'depot', 'campfire', 'pen', 'farm', 'archive', 'menhir'],
    materialPriorities: ['wood', 'stone', 'ore'],
    tradePreferences: ['wood', 'food', 'stone', 'ingot', 'coin'],
    expansionIntervalSeconds: 810,
    borderFrictionPerSeason: 3,
    merchantIntervalSeconds: 120,
  },
  stone: {
    label: 'Artigiani della selce',
    description: 'Cerca i rilievi e dà precedenza agli utensili e ai luoghi di lavoro.',
    preferredBiomes: ['mountain', 'plain'],
    buildingPriorities: ['depot', 'campfire', 'workshop', 'storage', 'foundry', 'pen', 'farm'],
    materialPriorities: ['stone', 'wood', 'ore'],
    tradePreferences: ['stone', 'ingot', 'wood', 'food', 'coin'],
    expansionIntervalSeconds: 720,
    borderFrictionPerSeason: 4,
    merchantIntervalSeconds: 120,
  },
  river: {
    label: 'Gente delle rive',
    description: 'Preferisce le rive e i collegamenti fra comunità, proteggendo le scorte.',
    preferredBiomes: ['river', 'plain'],
    buildingPriorities: ['storage', 'pen', 'campfire', 'depot', 'farm', 'market', 'archive'],
    materialPriorities: ['wood', 'stone', 'ore'],
    tradePreferences: ['food', 'wood', 'stone', 'ingot', 'coin'],
    expansionIntervalSeconds: 720,
    borderFrictionPerSeason: 2,
    merchantIntervalSeconds: 90,
  },
  dawn: {
    label: 'Custodi della memoria',
    description: 'Dà precedenza al focolare e ai luoghi in cui conservare e trasmettere il sapere.',
    preferredBiomes: ['plain', 'forest'],
    buildingPriorities: ['campfire', 'menhir', 'archive', 'school', 'storage', 'pen', 'farm'],
    materialPriorities: ['wood', 'stone', 'ore'],
    tradePreferences: ['wood', 'stone', 'food', 'ingot', 'coin'],
    expansionIntervalSeconds: 990,
    borderFrictionPerSeason: 2,
    merchantIntervalSeconds: 180,
  },
  meadow: {
    label: 'Coltivatori dei prati',
    description: 'Cerca terre aperte e prepara fonti di nutrimento durature prima di partire.',
    preferredBiomes: ['plain', 'forest'],
    buildingPriorities: ['farm', 'pen', 'storage', 'campfire', 'depot', 'archive', 'menhir'],
    materialPriorities: ['wood', 'stone', 'ore'],
    tradePreferences: ['food', 'wood', 'stone', 'ingot', 'coin'],
    expansionIntervalSeconds: 720,
    borderFrictionPerSeason: 2,
    merchantIntervalSeconds: 120,
  },
  trail: {
    label: 'Comunità dei cammini',
    description: 'Collega comunità distanti e cerca scambi che possano sostenere nuovi viaggi.',
    preferredBiomes: ['plain', 'river'],
    buildingPriorities: ['storage', 'market', 'depot', 'campfire', 'pen', 'farm', 'archive'],
    materialPriorities: ['wood', 'stone', 'ore'],
    tradePreferences: ['coin', 'ingot', 'stone', 'wood', 'food'],
    expansionIntervalSeconds: 630,
    borderFrictionPerSeason: 1,
    merchantIntervalSeconds: 60,
  },
  highland: {
    label: 'Custodi dei passi',
    description: 'Preferisce i rilievi e difende con maggiore fermezza i confini condivisi.',
    preferredBiomes: ['mountain', 'forest'],
    buildingPriorities: ['campfire', 'storage', 'pen', 'depot', 'foundry', 'workshop', 'farm'],
    materialPriorities: ['stone', 'wood', 'ore'],
    tradePreferences: ['stone', 'ingot', 'wood', 'food', 'coin'],
    expansionIntervalSeconds: 900,
    borderFrictionPerSeason: 6,
    merchantIntervalSeconds: 180,
  },
  clay: {
    label: 'Costruttori delle terre',
    description: 'Consolida gli insediamenti con depositi e luoghi di lavoro prima di espandersi.',
    preferredBiomes: ['plain', 'river'],
    buildingPriorities: ['depot', 'storage', 'workshop', 'campfire', 'farm', 'pen', 'archive'],
    materialPriorities: ['stone', 'wood', 'ore'],
    tradePreferences: ['stone', 'wood', 'food', 'ingot', 'coin'],
    expansionIntervalSeconds: 810,
    borderFrictionPerSeason: 3,
    merchantIntervalSeconds: 90,
  },
};

export function getRegionalCultureProfile(faction: Pick<Faction, 'culture'>) {
  return faction.culture ? REGIONAL_CULTURES[faction.culture] : undefined;
}

export function createRegionalFactions(original: readonly Faction[]): Faction[] {
  const existing = original.map((faction) => ({
    ...faction,
    culture: faction.id.replace('faction-', '') as RegionalCultureId,
  }));
  const additional: [RegionalCultureId, string, string[]][] = [
    ['meadow', 'Le Genti dei Prati', ['O_01', 'O_03', 'V_04', 'V_05', 'M_02']],
    ['trail', 'I Camminatori', ['O_01', 'O_03', 'V_04', 'V_05', 'S_05']],
    ['highland', 'Le Sentinelle dei Monti', ['O_01', 'O_02', 'V_06', 'M_01', 'S_05']],
    ['clay', 'Le Mani d’Argilla', ['O_01', 'O_02', 'O_03', 'V_06', 'V_05']],
  ];
  return [
    ...existing,
    ...additional.map(
      ([culture, name, words]): Faction => ({
        id: `faction-${culture}`,
        cityId: `city-${culture}`,
        culture,
        name,
        words: [...INNATE_WORDS, ...words],
        dogmas: [],
        relation: 0,
        hostile: false,
      }),
    ),
  ];
}
