import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, emptyInventory } from './content';
import { allocateCityWorkers } from './imperial';
import { createInitialState } from './state';
import type { BuildingKind, City, GameState, Unit } from './types';

function fixture() {
  const s = createInitialState(1);
  const u = s.units[0];
  s.units = [u];
  u.cityId = 'own';
  u.age = 8;
  u.strength = 3;
  u.intelligence = 8;
  u.caste = 'sage';
  s.kingId = u.id;
  const c: City = {
    id: 'own',
    name: 'own',
    x: 250,
    y: 250,
    sectorX: 2,
    sectorY: 2,
    factionId: 'player',
    cohorts: { workers: 0, warriors: 0, sages: 1, slaves: 0 },
    resources: emptyInventory(),
    production: emptyInventory(),
    words: [],
    dogmas: [],
    buildingIds: [],
    vocations: [],
    revoltTension: 0,
    loyalty: 100,
    housing: 10,
    assimilation: { active: false, delegateCount: 0 },
  };
  s.cities.push(c);
  s.dogmas = [
    {
      id: 'fire-monopoly',
      targetId: 'O_05',
      vectorId: 'S_07',
      age: 0,
      weight: 10,
      name: 'Fuoco del Re',
      description: '',
    },
  ];
  return { s, c, u };
}
function building(s: GameState, c: City, kind: BuildingKind, id: string = kind) {
  const b = {
    id,
    kind,
    x: c.x,
    y: c.y,
    cityId: c.id,
    workerIds: [],
    active: true,
    hp: BUILDING_SPECS[kind].maxHp,
  };
  s.buildings.push(b);
  c.buildingIds.push(id);
  return b;
}

describe('urban identity reservations for individual and royal monopolies', () => {
  it('reserves a scholarly king once and removes his actual sage capacity', () => {
    const { s, c } = fixture();
    building(s, c, 'foundry', 'first-foundry');
    building(s, c, 'foundry', 'second-foundry');
    building(s, c, 'archive');
    allocateCityWorkers(s, c);
    expect(s.buildings.map((b) => b.lastEfficiency)).toEqual([0.25, 0, 0]);
    expect(c.cohorts).toEqual({ workers: 0, warriors: 0, sages: 1, slaves: 0 });
  });
  it('does not reuse a king already assigned through an ordinary sage cohort', () => {
    const { s, c } = fixture();
    building(s, c, 'archive');
    building(s, c, 'foundry');
    allocateCityWorkers(s, c);
    expect(s.buildings.map((b) => b.lastEfficiency)).toEqual([0.25, 0]);
  });
  it('shares reservations across an individual monopoly and all represented cohorts', () => {
    const { s, c, u } = fixture();
    const extra = Array.from(
      { length: 4 },
      (_, i): Unit => ({
        ...u,
        id: `person-${i}`,
        name: `Person ${i}`,
        caste: i === 0 ? 'warrior' : 'citizen',
        strength: i === 0 ? 8 : 3,
        intelligence: 3,
      }),
    );
    s.units.push(...extra);
    c.cohorts = { workers: 3, warriors: 1, sages: 1, slaves: 0 };
    s.dogmas[0].vectorId = 'S_02';
    building(s, c, 'foundry', 'first-foundry');
    building(s, c, 'foundry', 'second-foundry');
    building(s, c, 'archive');
    allocateCityWorkers(s, c);
    expect(s.buildings.map((b) => b.lastEfficiency)).toEqual([1, 0.25, 0]);
  });
});
