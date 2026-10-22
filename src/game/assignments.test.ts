import { describe, expect, it } from 'vitest';
import { BUILDING_SPECS, WORD_ORDER } from './content';
import { createGame, issueCommand, tick } from './engine';
import { buildingEfficiency } from './runtime';

function world() {
  const s = createGame();
  s.started = true;
  s.tier = 5;
  for (const id of WORD_ORDER)
    s.words[id] = { retention: 100, uses: 0, custodians: [s.units[0].id] };
  s.buildings.push({
    id: 'school',
    kind: 'school',
    ...s.home,
    hp: 400,
    active: true,
    workerIds: [],
  });
  return s;
}

describe('physical reassignment of building workers', () => {
  it('uses the school phrase to fill real sage positions without building or charging materials again', () => {
    const s = world();
    const assigned = issueCommand(s, ['S_01', 'V_08', 'O_02', 'S_04'], {
      type: 'building',
      id: 'school',
      ...s.home,
    });
    expect(assigned.voice).toBe(2);
    expect(assigned.stats.commands).toBe(1);
    expect(assigned.resources.stone).toBe(0);
    expect(assigned.buildings).toHaveLength(1);
    expect(
      assigned.buildings[0].workerIds
        ?.map((id) => assigned.units.find((u) => u.id === id)?.name)
        .sort(),
    ).toEqual(['Ayla', 'Uma']);
    expect(assigned.units.filter((u) => u.jobBuildingId === 'school')).toHaveLength(2);
    const worked = tick(assigned, 2);
    expect(buildingEfficiency(worked, worked.buildings[0])).toBe(0.5);
  });
  it('rejects incompatible workers before spending voice', () => {
    const s = world();
    for (const u of s.units) u.intelligence = 5;
    const rejected = issueCommand(s, ['S_01', 'V_08', 'O_02', 'S_04'], {
      type: 'building',
      id: 'school',
      ...s.home,
    });
    expect(rejected.voice).toBe(3);
    expect(rejected.stats.commands).toBe(0);
    expect(rejected.buildings[0].workerIds).toEqual([]);
  });
  it('keeps an explicitly selected workplace instead of assigning the nearest building', () => {
    const s = world();
    s.buildings.push({ ...s.buildings[0], id: 'selected-school', x: s.home.x + 10, workerIds: [] });
    const assigned = issueCommand(s, ['S_01', 'V_08', 'O_02', 'S_04'], {
      type: 'building',
      id: 'selected-school',
      x: s.home.x + 10,
      y: s.home.y,
    });
    expect(assigned.buildings[0].workerIds).toEqual([]);
    expect(assigned.buildings[1].workerIds).toHaveLength(2);
  });
  it('does not call the entire tribe from a foreign campfire', () => {
    const s = world();
    const foreign = s.cities[0];
    s.buildings.push({
      ...foreign,
      id: 'foreign-fire',
      kind: 'campfire',
      hp: BUILDING_SPECS.campfire.maxHp,
      active: true,
      cityId: foreign.id,
    });
    const result = issueCommand(s, ['S_01', 'V_01'], { type: 'point', x: 250, y: 260 }, undefined, {
      ...foreign,
      type: 'building',
      id: 'foreign-fire',
    });
    expect(result.stats.commands).toBe(0);
    expect(result.voice).toBe(3);
  });
});
