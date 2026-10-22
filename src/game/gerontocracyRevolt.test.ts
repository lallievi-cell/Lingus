import { describe, expect, it } from 'vitest';
import { createGame } from './engine';
import { updateImperial } from './imperial';
import { emptyInventory } from './content';
import type { City } from './types';

function world() {
  const s = createGame(6842);
  s.started = true;
  s.tier = 4;
  s.time = 1;
  s.factions = [];
  s.cities = [];
  s.entities = [];
  s.dogmas = [
    {
      id: 'gerontocracy',
      targetId: 'S_04',
      vectorId: 'M_04',
      age: 0,
      weight: 10,
      name: 'Gerontocrazia',
      description: '',
    },
  ];
  s.revoltTension = 70;
  return s;
}

describe('the Bronze Age cost of the priestly oligarchy', () => {
  it('makes the strong working citizens rebel at70 without inventing slave rebels', () => {
    const s = world();
    const korg = s.units[0];
    expect(korg.strength).toBe(8);
    updateImperial(s, 0);
    expect(s.eventTimes.rebellion).toBe(1);
    expect(korg.factionId).toBe('rebels');
    expect(s.units.find((u) => u.name === 'Uma')?.factionId).not.toBe('rebels');
  });
  it('keeps the ordinary threshold before the Bronze Age and when no strong workers exist', () => {
    const early = world();
    early.tier = 3;
    updateImperial(early, 0);
    expect(early.eventTimes.rebellion).toBeUndefined();
    const noStrong = world();
    noStrong.units.forEach((u) => (u.strength = 3));
    updateImperial(noStrong, 0);
    expect(noStrong.eventTimes.rebellion).toBeUndefined();
  });
  it('applies the lower threshold to a city with the relevant warrior cohort', () => {
    const s = world();
    s.urbanized = true;
    s.units = [];
    const city: City = {
      id: 'capital',
      name: 'Capital',
      ...s.home,
      sectorX: 2,
      sectorY: 2,
      factionId: 'player',
      cohorts: { workers: 2, warriors: 1, sages: 1, slaves: 0 },
      resources: emptyInventory(),
      production: emptyInventory(),
      words: [],
      dogmas: [],
      revoltTension: 70,
      housing: 10,
      buildingIds: [],
      vocations: [],
      loyalty: 100,
      assimilation: { active: false, delegateCount: 0 },
      capital: true,
    };
    s.cities.push(city);
    updateImperial(s, 0);
    expect(city.rebelling).toBe(true);
    expect(city.factionId).toBe('rebels');
  });
});
