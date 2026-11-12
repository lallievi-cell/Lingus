import { BIOME_PROFILES, biomeEffectsEnabled, terrainBiomeAt } from '../game/biomes';
import { hasWord } from '../game/runtime';
import { isWorldPointRevealed } from '../game/worldDimensions';
import { isDryLandPoint, isLandPoint } from '../game/landNavigation';
import type { GameState, WorldTarget } from '../game/types';

type Point = { x: number; y: number };

/** Describe the ground actually seen here, without teaching undiscovered concepts. */
export function biomePresentation(state: GameState, point: Point | null | undefined) {
  if (
    !point ||
    !biomeEffectsEnabled(state) ||
    !isWorldPointRevealed(state, point.x, point.y) ||
    !isLandPoint(state, point)
  )
    return null;
  const biome = terrainBiomeAt(state, point);
  if (!biome) return null;
  const profile = BIOME_PROFILES[biome];
  const numbered = hasWord(state, 'O_08');
  const extraTime = Math.round((profile.travelCost - 1) * 100);
  return {
    biome,
    label: profile.label,
    description: profile.description,
    movement:
      extraTime === 0
        ? 'Cammino agevole, senza rallentamenti dovuti al terreno.'
        : numbered
          ? `Spostamenti: ${extraTime}% di tempo in più rispetto alla prateria, a parità di distanza.`
          : 'Il terreno rallenta gli spostamenti rispetto alla prateria.',
    farming:
      hasWord(state, 'V_09') && isDryLandPoint(state, point)
        ? numbered
          ? `Raccolto: ${Math.round(profile.farmYield * 100)}% rispetto alla prateria, a parità di addetti e condizioni.`
          : profile.farmYield > 1
            ? 'Suolo fertile: i campi rendono più che in prateria.'
            : profile.farmYield < 1
              ? 'Suolo meno fertile: i campi rendono meno che in prateria.'
              : 'Fertilità regolare: è il terreno di riferimento per i raccolti.'
        : null,
  };
}

/** A moving selection may contain stale click coordinates; use its live location. */
export function targetBiomePresentation(state: GameState, target: WorldTarget | null) {
  if (!target) return null;
  const point =
    target.type === 'unit'
      ? state.units.find((unit) => unit.id === target.id && unit.hp > 0)
      : target.type === 'entity'
        ? state.entities.find((entity) => entity.id === target.id)
        : target.type === 'building'
          ? state.buildings.find((building) => building.id === target.id && building.hp > 0)
          : target.type === 'city'
            ? state.cities.find((city) => city.id === target.id && city.factionId !== 'ruins')
            : target.type === 'battalion'
              ? state.battalions.find((army) => army.id === target.id && army.hp > 0)
              : target.type === 'caravan'
                ? state.caravans.find((caravan) => caravan.id === target.id)
                : target;
  return biomePresentation(state, point);
}
