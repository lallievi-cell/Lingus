import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { emptyInventory } from '../game/content';
import { culturePresentation, visibleCultureCity } from './culturePresentation';

function scene() {
  const state = createGame(42, 'classic', 'random', 1000);
  state.tier = 3;
  state.sectors.forEach((sector) => (sector.explored = false));
  const faction = state.factions[0],
    city = state.cities[0];
  state.sectors.find((sector) => sector.x === city.sectorX && sector.y === city.sectorY)!.explored =
    true;
  return { state, faction, city };
}

describe('encountered regional cultures', () => {
  it('shows only a living encountered settlement and never reveals a hidden faction', () => {
    const { state, faction, city } = scene();
    expect(visibleCultureCity(state, faction)?.id).toBe(city.id);
    for (const hidden of state.factions.slice(1))
      expect(culturePresentation(state, hidden)).toBeUndefined();
    Object.assign(city.cohorts, { workers: 0, warriors: 0, sages: 0, slaves: 0 });
    expect(culturePresentation(state, faction)).toBeUndefined();
  });

  it('finds a surviving explored colony without declaring its culture annexed', () => {
    const { state, faction, city } = scene();
    const colony = structuredClone(city);
    Object.assign(colony, { id: 'surviving-colony', x: 650, y: 650, sectorX: 6, sectorY: 6 });
    state.cities.push(colony);
    city.factionId = 'player';
    faction.subjugated = true; // A stale flag cannot erase actual surviving inhabitants.
    expect(culturePresentation(state, faction)).toBeUndefined();
    state.sectors.find((sector) => sector.x === 6 && sector.y === 6)!.explored = true;
    expect(culturePresentation(state, faction)).toMatchObject({
      city: { id: colony.id },
      annexed: false,
      status: 'In pace',
    });
    colony.factionId = 'ruins';
    expect(culturePresentation(state, faction)).toMatchObject({
      city: { id: city.id },
      annexed: true,
      status: 'Annessa',
    });
  });

  it('reports visible travel without revealing the destination or unseen cargo', () => {
    const { state, faction, city } = scene();
    state.caravans.push({
      id: 'visible-colonists',
      kind: 'colonists',
      factionId: faction.id,
      fromCityId: city.id,
      x: 550,
      y: 550,
      resources: { ...emptyInventory(), ingot: 17 },
      population: 30,
      target: { type: 'point', x: 950, y: 950 },
      hp: 100,
    });
    expect(culturePresentation(state, faction)?.activity).toBeUndefined();
    Object.assign(state.caravans[0], { x: city.x, y: city.y });
    const before = JSON.stringify(state);
    const presentation = culturePresentation(state, faction)!;
    expect(presentation.activity).toBe('Coloni in viaggio');
    expect(presentation.activity).not.toMatch(/950|17|ingot|lingott/i);
    expect(presentation.profile?.label).toBe('Gente dei boschi');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('honors an actual truce before showing a hostile status', () => {
    const { state, faction } = scene();
    faction.hostile = true;
    faction.relation = -80;
    faction.peaceUntil = state.time + 90;
    expect(culturePresentation(state, faction)).toMatchObject({ hostile: false, status: 'Tregua' });
    state.time += 91;
    expect(culturePresentation(state, faction)).toMatchObject({ hostile: true, status: 'Ostile' });
  });
});
