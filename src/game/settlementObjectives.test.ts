import { describe, expect, it } from 'vitest';
import { createGame, getObjective } from './engine';
import { emptyInventory } from './content';
import type { BuildingKind } from './types';

function village() {
  const s = createGame(6842, 'guided');
  Object.assign(s, {
    tier: 3,
    started: true,
    cities: [],
    factions: [],
    resources: emptyInventory(),
    entities: [],
  });
  s.units = s.units.slice(0, 4);
  for (const id of ['O_05', 'O_04', 'O_03', 'O_02', 'O_01', 'O_06', 'V_08', 'V_07', 'C_02'])
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
  s.resources.food = 200;
  s.resources.stone = 50;
  s.buildings = [
    { id: 'fire', kind: 'campfire', ...s.home, hp: 100, active: true, completed: true },
  ];
  return s;
}
function add(s: ReturnType<typeof village>, kind: BuildingKind) {
  s.buildings.push({ id: kind, kind, ...s.home, hp: 100, active: true, completed: true });
}

describe('settlement objectives respond to actual needs', () => {
  it('leaves the first commands unchanged', () => {
    const s = createGame(6842, 'guided');
    expect(getObjective(s).title).toBe('Dare forma a un pensiero');
  });
  it('prioritises real unburied bodies over a growing vocabulary', () => {
    const s = village();
    s.entities = [{ id: 'dead', kind: 'corpse', ...s.home, amount: 1, hp: 0, maxHp: 100 }];
    expect(getObjective(s).title).toBe('Dare riposo ai morti');
    add(s, 'grave');
    expect(getObjective(s).description).toContain('Assegna un adulto');
    s.entities[0].amount = 0;
    expect(getObjective(s).title).not.toBe('Dare riposo ai morti');
  });
  it('does not count an inactive house as safe housing', () => {
    const s = village();
    const template = s.units[0];
    s.units = Array.from({ length: 12 }, (_, i) => ({ ...template, id: `u-${i}` }));
    add(s, 'house');
    s.buildings.at(-1)!.active = false;
    expect(getObjective(s).title).toBe('Spazio per nuove generazioni');
    s.buildings.at(-1)!.active = true;
    expect(getObjective(s).title).not.toBe('Spazio per nuove generazioni');
  });
  it('asks for maintenance inputs even when current housing is ample', () => {
    const s = village();
    add(s, 'house');
    s.resources.stone = 0;
    expect(getObjective(s)).toMatchObject({
      title: 'La pietra sostiene il villaggio',
      current: 0,
      total: 2,
    });
    s.resources.stone = 2;
    expect(getObjective(s).title).not.toBe('La pietra sostiene il villaggio');
  });
  it('distinguishes raw meat from a cooked food programme', () => {
    const s = village();
    s.resources.meat = 20;
    expect(getObjective(s).title).toBe('Cuocere per la comunità');
    expect(getObjective(s).description).toContain('Sempre');
    s.resources.cooked = 4;
    expect(getObjective(s).title).not.toBe('Cuocere per la comunità');
  });
  it('asks for a working archive after Writing, rather than unrelated words', () => {
    const s = village();
    s.words.O_09 = { retention: 100, custodians: [], uses: 0 };
    expect(getObjective(s).title).toBe('Una casa per la memoria');
    add(s, 'archive');
    s.buildings.at(-1)!.lastEfficiency = 0.5;
    expect(getObjective(s)).toMatchObject({
      title: 'Dare mani alla Scrittura',
      current: 2,
      total: 4,
    });
    s.buildings.at(-1)!.lastEfficiency = 1;
    expect(getObjective(s).title).not.toBe('Dare mani alla Scrittura');
  });
  it('uses real sustained imperial seasons in the late game', () => {
    const s = village();
    s.urbanized = true;
    s.tier = 5;
    s.victoryProgress.imperialSeasons = 6;
    expect(getObjective(s)).toMatchObject({
      title: 'Custodire la pace dell’impero',
      current: 6,
      total: 16,
      progress: 6 / 16,
    });
    s.victory = 'imperial';
    expect(getObjective(s).title).toBe('La storia è compiuta');
  });
});
