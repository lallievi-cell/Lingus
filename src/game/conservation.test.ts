import { describe, expect, it } from 'vitest';
import { emptyInventory, HOME } from './content';
import { createGame, issueCommand, tick } from './engine';
import { processWork } from './simulation';
import type { GameState } from './types';

/** Small food fixtures isolate instinct, explicit meals and the learned flag. */
function camp(known = true, mode: 'classic' | 'guided' = 'classic') {
  const s = createGame(6842, mode);
  Object.assign(s, {
    started: true,
    time: 10,
    cities: [],
    factions: [],
    resources: emptyInventory(),
  });
  s.units = s.units.slice(0, 1);
  Object.assign(s.units[0], { ...HOME, age: 8, hp: 100, hunger: 60, temp: 100, action: 'idle' });
  s.entities = [
    { id: 'berries', kind: 'berries', ...HOME, amount: 5, maxAmount: 5, hp: 1, maxHp: 1 },
  ];
  if (known) {
    s.words.V_05 = { retention: 100, custodians: [s.units[0].id], uses: 0 };
    s.units[0].knows.push('V_05');
  }
  return s;
}
function advance(s: GameState, seconds: number) {
  for (let remaining = seconds; remaining > 0; remaining -= 0.25) s = tick(s, 0.25);
  return s;
}

describe('Conservare limits autonomous meals without overriding Mangiare', () => {
  it.each(['classic', 'guided'] as const)(
    'stops an instinctive %s meal once no longer hungry and leaves the rest available',
    (mode) => {
      const s = advance(camp(true, mode), 5);
      expect(s.entities[0].amount).toBe(4);
      expect(s.units[0].hunger).toBeCloseTo(39);
      expect(s.units[0].action).not.toBe('eating');
      expect(s.units[0].command).toBeUndefined();
      expect(s.resources.food).toBe(0);
    },
  );

  it.each(['undiscovered', 'forgotten'] as const)(
    'retains the earlier autonomous binge while Conservare is %s',
    (knowledge) => {
      let s = camp(knowledge === 'forgotten');
      if (knowledge === 'forgotten') s.words.V_05.retention = 0;
      // A real meal now includes the walk to a place beside the food. Wait for
      // satiety, rather than requiring all bites at the former shared anchor.
      for (let elapsed = 0; elapsed < 8 && s.units[0].hunger >= 1; elapsed += 0.25)
        s = tick(s, 0.25);
      expect(s.entities[0].amount).toBe(2);
      expect(s.units[0].hunger).toBeLessThan(1);
    },
  );

  it('honors an explicit Mangiare order to satiety even after Conservare', () => {
    let s = camp();
    s = issueCommand(s, ['S_01', 'V_02'], { type: 'entity', id: 'berries', ...HOME });
    s = advance(s, 5);
    expect(s.stats.commands).toBe(1);
    expect(s.entities[0].amount).toBe(2);
    expect(s.units[0].hunger).toBeLessThan(1);
  });

  it('also keeps a commanded traditional meal to satiety', () => {
    const s = camp();
    Object.assign(s.units[0], {
      action: 'eating',
      command: ['C_02', 'S_01', 'V_02', 'O_04'],
      targetId: 'berries',
    });
    for (let i = 0; i < 3; i++) processWork(s, s.units[0], 1.5);
    expect(s.entities[0].amount).toBe(2);
    expect(s.units[0].hunger).toBe(0);
  });

  it.each([20, 70])(
    'conserves the automatic meal after a real hunt at hunger %s despite retaining Colpire',
    (hunger) => {
      let s = camp();
      Object.assign(s.entities[0], { kind: 'deer', amount: 2, hp: 1, maxHp: 100 });
      s.units[0].hunger = hunger;
      s = issueCommand(s, ['S_01', 'V_03'], { type: 'entity', id: 'berries', ...HOME });
      s = advance(s, 4);
      expect(s.stats.hunts).toBe(1);
      expect(s.entities[0].hp).toBe(0);
      expect(s.entities[0].amount).toBe(hunger < 60 ? 2 : 1);
      expect(s.units[0].hunger).toBeLessThan(60);
      expect(s.units[0].command).toBeUndefined();
    },
  );

  it('uses an actual delivery at the camp instead of pursuing the distant node selected before it arrived', () => {
    const s = camp();
    s.entities[0].x += 50;
    Object.assign(s.units[0], { action: 'eating', targetId: 'berries', hunger: 70 });
    // A real stored ration is now available; the earlier target remains unchanged.
    s.resources.food = 1;
    processWork(s, s.units[0], 0.25);
    expect(s.resources.food).toBe(0);
    expect(s.entities[0].amount).toBe(5);
    expect(s.units[0].hunger).toBe(45);
    expect(s.units[0].x).toBe(HOME.x);
    expect(s.units[0].action).toBe('idle');
  });

  it('cannot consume that delivered stock outside its physical reach or through a food taboo', () => {
    const s = camp();
    s.entities[0].x += 50;
    Object.assign(s.units[0], {
      x: HOME.x + 11,
      action: 'eating',
      targetId: 'berries',
      hunger: 70,
    });
    s.resources.food = 1;
    processWork(s, s.units[0], 0.25);
    expect(s.resources.food).toBe(1);
    expect(s.units[0].hunger).toBe(70);
    expect(s.units[0].x).toBeGreaterThan(HOME.x + 11);
    expect(Math.hypot(s.units[0].x - (HOME.x + 11), s.units[0].y - HOME.y)).toBeCloseTo(1);
    s.units[0].x = HOME.x;
    s.dogmas.push({
      id: 'food-taboo',
      targetId: 'V_02',
      vectorId: 'M_01',
      name: 'Pasto vietato',
      description: '',
      weight: 10,
      age: 0,
    });
    processWork(s, s.units[0], 0.25);
    expect(s.resources.food).toBe(1);
    expect(s.units[0].hunger).toBe(70);
  });

  it('stops an already satisfied autonomous meal before moving or paying another bite when the word becomes known', () => {
    let s = camp();
    s.entities[0].x += 20;
    Object.assign(s.units[0], { action: 'eating', targetId: 'berries', hunger: 40 });
    s = advance(s, 0.25);
    expect(s.entities[0].amount).toBe(5);
    expect(s.units[0].x).toBe(HOME.x);
    expect(s.units[0].action).toBe('idle');
  });

  it('seeks another real meal when hunger returns and leaves stored-food consumption unchanged', () => {
    let s = advance(camp(), 40);
    expect(s.entities[0].amount).toBe(3);
    expect(s.units[0].hunger).toBeCloseTo(42);
    expect(s.units[0].hp).toBe(100);
    s = camp();
    s.entities = [];
    s.resources.food = 5;
    s = advance(s, 5);
    expect(s.resources.food).toBe(4);
    expect(s.units[0].hunger).toBeCloseTo(39);
  });
});
