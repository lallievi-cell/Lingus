import { describe, expect, it } from 'vitest';
import { emptyInventory } from './content';
import { compileSentence, createGame, issueCommand, tick } from './engine';

function settlement() {
  const s = createGame(6842, 'classic');
  Object.assign(s, {
    started: true,
    tier: 3,
    time: 5,
    cities: [],
    factions: [],
    entities: [],
    resources: emptyInventory(),
  });
  s.units = s.units.slice(0, 4);
  s.units.forEach((u, i) =>
    Object.assign(u, {
      x: 250 + i * 0.5,
      y: 250,
      age: 6,
      hunger: 10,
      temp: 100,
      action: 'idle',
      command: undefined,
    }),
  );
  for (const id of ['C_02', 'V_07', 'O_04', 'O_05', 'O_02', 'V_06', 'O_03'])
    s.words[id] = { retention: 100, custodians: s.units.map((u) => u.id), uses: 0 };
  s.buildings = [
    { id: 'fire', kind: 'campfire', x: 250, y: 250, hp: 100, active: true, completed: true },
  ];
  return s;
}

describe('real paid artisan traditions', () => {
  it('turns a registered cooking phrase into repeated meals, charging every worker and cycle', () => {
    let s = settlement();
    s.resources.meat = 8;
    const tokens = ['C_02', 'S_01', 'V_07', 'O_04', 'O_05'];
    expect(compileSentence(s, tokens).valid).toBe(true);
    s = issueCommand(s, tokens);
    expect(s.traditions).toHaveLength(1);
    const voice = s.voice;
    s = tick(s, 13);
    expect(s.resources.cooked).toBe(8);
    expect(s.resources.meat).toBe(0);
    expect(s.voice).toBe(voice);
    s = tick(s, 20);
    expect(s.resources.cooked).toBe(8);
  });
  it('does not pay or produce when there is no active fire or no raw meat', () => {
    let s = settlement();
    s.resources.meat = 3;
    s = issueCommand(s, ['C_02', 'S_01', 'V_07', 'O_04', 'O_05']);
    s.buildings[0].active = false;
    s = tick(s, 5);
    expect(s.resources.meat).toBe(3);
    expect(s.resources.cooked).toBe(0);
    expect(s.units.some((u) => u.action === 'cooking')).toBe(false);
  });
  it('stops a daytime tradition at night without starting another paid cycle', () => {
    let s = settlement();
    s.time = 65;
    s.resources.meat = 8;
    s = issueCommand(s, ['C_02', 'S_01', 'V_07', 'O_04', 'O_05']);
    s = tick(s, 5);
    expect(s.resources.meat).toBe(8);
    expect(s.resources.cooked).toBe(0);
  });
  it('leaves nearby inputs untouched when the camp has no room for the output', () => {
    let s = settlement();
    s.resources.wood = 30;
    s.entities = [
      {
        id: 'local-stone',
        kind: 'ground',
        resource: 'stone',
        x: 250,
        y: 250,
        hp: 1,
        maxHp: 1,
        amount: 5,
      },
    ];
    s = issueCommand(s, ['C_02', 'S_01', 'V_06', 'O_02']);
    expect(s.traditions).toHaveLength(1);
    s = tick(s, 10);
    expect(s.resources.tool).toBe(0);
    expect(s.entities[0].amount).toBe(5);
    expect(s.resources.wood).toBe(30);
  });
  it('charges stone and wood for each traditionally crafted spear', () => {
    let s = settlement();
    Object.assign(s.resources, { stone: 3, wood: 2 });
    s = issueCommand(s, ['C_02', 'S_01', 'V_06', 'O_02', 'O_03']);
    s = tick(s, 10);
    expect(s.resources.spear).toBe(2);
    expect(s.resources.stone).toBe(1);
    expect(s.resources.wood).toBe(0);
    expect(s.resources.tool).toBe(0);
  });
});
