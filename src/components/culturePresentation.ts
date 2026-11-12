import { getRegionalCultureProfile } from '../game/regionalCultures';
import type { City, Faction, GameState } from '../game/types';
import { isWorldPointRevealed } from '../game/worldDimensions';

const inhabited = (city: City) => Object.values(city.cohorts).some((population) => population > 0);

/** A lost capital does not erase a culture with another encountered settlement. */
export function visibleCultureCity(state: GameState, faction: Faction) {
  const own = state.cities.filter((city) => city.factionId === faction.id && inhabited(city));
  const visible = (city: City) => isWorldPointRevealed(state, city.x, city.y);
  if (own.length)
    return own.find((city) => city.id === faction.cityId && visible(city)) ?? own.find(visible);
  return state.cities.find(
    (city) =>
      city.id === faction.cityId && city.factionId === 'player' && inhabited(city) && visible(city),
  );
}

/** Only events physically visible to the player become a current-activity label. */
export function culturePresentation(state: GameState, faction: Faction) {
  const city = visibleCultureCity(state, faction);
  if (!city) return undefined;
  const annexed = !state.cities.some((entry) => entry.factionId === faction.id && inhabited(entry));
  const truce = !annexed && (faction.peaceUntil ?? 0) > state.time;
  const hostile = !annexed && !truce && (faction.hostile || faction.relation <= -60);
  const profile = getRegionalCultureProfile(faction);
  const visible = (point: { x: number; y: number }) =>
    isWorldPointRevealed(state, point.x, point.y);
  let activity: string | undefined;
  const raid = state.foreignPolicy?.raids.find(
    (entry) =>
      entry.factionId === faction.id &&
      entry.phase !== 'ended' &&
      state.units.some((unit) => unit.hp > 0 && entry.memberIds.includes(unit.id) && visible(unit)),
  );
  const convoy = state.caravans.find(
    (entry) => entry.factionId === faction.id && entry.hp > 0 && !entry.arrived && visible(entry),
  );
  if (!annexed && raid)
    activity = raid.phase === 'returning' ? 'Gli incursori rientrano' : 'Incursori avvistati';
  else if (!annexed && convoy)
    activity =
      convoy.kind === 'colonists'
        ? 'Coloni in viaggio'
        : convoy.kind === 'trade'
          ? 'Carovana in viaggio'
          : 'Convoglio in viaggio';
  else if (
    !annexed &&
    state.buildings.some(
      (building) =>
        building.cityId === city.id &&
        building.hp > 0 &&
        building.completed === false &&
        visible(building),
    )
  )
    activity = 'Una costruzione è in corso';
  return {
    city,
    profile,
    activity,
    annexed,
    hostile,
    status: annexed ? 'Annessa' : truce ? 'Tregua' : hostile ? 'Ostile' : 'In pace',
  };
}
