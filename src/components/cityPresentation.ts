import { BUILDING_SPECS } from '../game/content';
import type { Building, City, GameState } from '../game/types';
import { isFoundryProducing } from './mapAtmosphere';

export type CityVocation = 'agriculture' | 'industry' | 'commerce' | 'learning';

export const CITY_VOCATION_LABELS: Record<CityVocation, string> = {
  agriculture: 'Granaio dell’Impero',
  industry: 'Polo siderurgico',
  commerce: 'Emporio',
  learning: 'Città universitaria',
};

export interface CityPresentation {
  population: number;
  vocations: CityVocation[];
  vocationLabels: string[];
  institutions: Building[];
  farms: Building[];
  foundries: Building[];
  productiveFoundries: Building[];
  walls?: Building;
  ruinedWalls: boolean;
  wallIntegrity: number;
  palace?: Building;
  market?: Building;
  learningBuilding?: Building;
}

/** Cartographic identity follows real civic orders and extant institutions. */
export function getCityPresentation(state: GameState, city: City): CityPresentation {
  const vocations: CityVocation[] = [];
  for (const vocation of city.vocations) {
    const [, subject, verb, object] = vocation.tokens;
    if (subject !== 'S_09') continue;
    const kind: CityVocation | undefined =
      verb === 'V_09' && object === 'O_04'
        ? 'agriculture'
        : verb === 'V_12' && object === 'O_07'
          ? 'industry'
          : verb === 'V_11' && object === 'O_12'
            ? 'commerce'
            : verb === 'V_05' && object === 'O_09'
              ? 'learning'
              : undefined;
    if (kind && !vocations.includes(kind)) vocations.push(kind);
  }
  const institutions = state.buildings.filter(
    (building) => building.cityId === city.id && building.completed !== false && building.hp > 0,
  );
  const walls = institutions.find((building) => building.kind === 'walls');
  const foundries = institutions.filter((building) => building.kind === 'foundry');
  return {
    population: Object.values(city.cohorts).reduce((sum, cohort) => sum + cohort, 0),
    vocations,
    vocationLabels: vocations.map((vocation) => CITY_VOCATION_LABELS[vocation]),
    institutions,
    farms: institutions.filter((building) => building.kind === 'farm'),
    foundries,
    productiveFoundries: foundries.filter((building) => isFoundryProducing(state, building)),
    walls,
    ruinedWalls: state.buildings.some(
      (building) => building.cityId === city.id && building.kind === 'walls' && building.hp <= 0,
    ),
    wallIntegrity: walls ? Math.max(0, Math.min(1, walls.hp / BUILDING_SPECS.walls.maxHp)) : 0,
    palace: institutions.find((building) => building.kind === 'palace'),
    market: institutions.find((building) => building.kind === 'market'),
    learningBuilding: institutions.find((building) =>
      ['school', 'archive', 'temple'].includes(building.kind),
    ),
  };
}
