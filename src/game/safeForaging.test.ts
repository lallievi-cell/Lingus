import { describe, expect, it } from 'vitest';
import { createGame, issueCommand } from './engine';
import { updateUnits } from './simulation';
import { safeAutonomousRoute } from './safeForaging';

function scene(hunger = 65) {
  const state = createGame(6842, 'guided');
  state.time = 565;
  state.units = [state.units[0]];
  Object.assign(state.units[0], { ...state.home, hunger, temp: 60, action: 'idle' });
  state.entities = [
    {
      id: 'distant-meal',
      kind: 'ground',
      resource: 'food',
      x: 200,
      y: 200,
      hp: 0,
      maxHp: 1,
      amount: 5,
    },
  ];
  state.buildings = [
    { id: 'fire', kind: 'campfire', ...state.home, hp: 100, active: true, completed: true },
  ];
  return state;
}

describe('a warm community avoids futile freezing food trips', () => {
  it('keeps a sheltered person warm rather than sending ordinary appetite into lethal cold', () => {
    const state = scene();
    updateUnits(state, 0.25);
    expect(state.units[0].action).not.toBe('eating');
    expect(state.units[0].targetId).not.toBe('distant-meal');
    expect(state.units[0].temp).toBeGreaterThanOrEqual(60);
    expect(state.entities[0].amount).toBe(5);
  });
  it('still seeks food in an urgent hunger emergency', () => {
    const state = scene(95);
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).toBe('distant-meal');
    expect(state.units[0].action).toBe('eating');
  });
  it('starts foraging normally when spring makes the trip safe', () => {
    const state = scene();
    state.time = 600.25;
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).toBe('distant-meal');
  });
  it('honours an explicit meal order and preserves the previous Guided behaviour', () => {
    const explicit = scene();
    Object.assign(explicit.units[0], {
      action: 'eating',
      command: ['S_01', 'V_02'],
      targetId: 'distant-meal',
    });
    updateUnits(explicit, 0.25);
    expect(explicit.units[0].targetId).toBe('distant-meal');
    const legacy = scene();
    delete legacy.openingBalanceVersion;
    delete legacy.openingCouncilsCompleted;
    legacy.time = 330;
    updateUnits(legacy, 0.25);
    expect(legacy.units[0].targetId).toBe('distant-meal');
  });
});

describe('Guided autonomous meals avoid visible predator routes', () => {
  function spring() {
    const state = scene();
    state.time = 600.25;
    state.entities[0].x = 280;
    state.entities[0].y = 250;
    state.entities.push({
      id: 'known-alpha',
      kind: 'alpha',
      x: 280,
      y: 275,
      hp: 120,
      maxHp: 120,
      amount: 3,
    });
    return state;
  }

  it('chooses an actually safe meal instead of an alpha-side source, even when very hungry', () => {
    const state = spring();
    state.units[0].hunger = 95;
    state.entities[1].y = 270;
    state.entities.push({ ...state.entities[0], id: 'safe-meal', x: 220 });
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).toBe('safe-meal');
    expect(state.entities.map((entry) => entry.amount)).toEqual([5, 3, 5]);
  });

  it('checks the whole outward and return route rather than only the meal location', () => {
    const state = spring();
    Object.assign(state.entities[1], { x: 290, y: 250 });
    const away = { x: 330, y: 290 };
    const meal = { x: 330, y: 250 };
    expect(safeAutonomousRoute(state, away, meal)).toBe(false);
    expect(safeAutonomousRoute(state, state.home, { x: 220, y: 250 })).toBe(true);
  });

  it('reconsiders an autonomous meal when a live predator moves onto its route', () => {
    const state = spring();
    Object.assign(state.units[0], { action: 'eating', targetId: 'distant-meal' });
    state.entities[1].y = 270;
    updateUnits(state, 0.25);
    expect(state.units[0].targetId).not.toBe('distant-meal');
    expect(state.entities[0].amount).toBe(5);
  });

  it('preserves a direct risky meal and Classic instincts', () => {
    const explicit = spring();
    explicit.entities[1].y = 270;
    Object.assign(explicit.units[0], {
      action: 'eating',
      command: ['S_01', 'V_02'],
      targetId: 'distant-meal',
    });
    updateUnits(explicit, 0.25);
    expect(explicit.units[0].targetId).toBe('distant-meal');
    const classic = spring();
    classic.playMode = 'classic';
    classic.entities[1].y = 270;
    updateUnits(classic, 0.25);
    expect(classic.units[0].targetId).toBe('distant-meal');
  });

  it('chooses a safe fallback for an untargeted spoken meal, without overriding an explicit target', () => {
    const state = spring();
    state.tier = 1;
    state.words.O_04 = { retention: 100, custodians: [state.units[0].id], uses: 0 };
    state.entities[1].y = 270;
    state.entities.push({ ...state.entities[0], id: 'safe-meal', x: 220 });
    const automatic = issueCommand(state, ['S_01', 'V_02', 'O_04']);
    expect(automatic.units[0].targetId).toBe('safe-meal');
    expect(automatic.voice).toBe(state.voice - 1);
    const explicit = issueCommand(state, ['S_01', 'V_02', 'O_04'], {
      type: 'entity',
      id: 'distant-meal',
      x: 280,
      y: 250,
    });
    expect(explicit.units[0].targetId).toBe('distant-meal');
  });

  it('does not infer an unexplored predator, or treat a dead or domesticated animal as a threat', () => {
    const state = spring();
    state.entities[0].x = 350;
    Object.assign(state.entities[1], { x: 350, y: 250 });
    expect(safeAutonomousRoute(state, state.home, state.entities[0])).toBe(true);
    state.sectors.find((sector) => sector.x === 3 && sector.y === 2)!.explored = true;
    expect(safeAutonomousRoute(state, state.home, state.entities[0])).toBe(false);
    state.entities[1].hp = 0;
    expect(safeAutonomousRoute(state, state.home, state.entities[0])).toBe(true);
    state.entities[1].hp = 120;
    state.entities[1].domesticated = true;
    expect(safeAutonomousRoute(state, state.home, state.entities[0])).toBe(true);
  });

  it('uses existing palisade protection only while the whole trip stays within its real radius', () => {
    const state = spring();
    Object.assign(state.entities[1], { x: 265, y: 250 });
    state.buildings.push({
      id: 'wall',
      kind: 'palisade',
      ...state.home,
      hp: 400,
      active: true,
      completed: true,
    });
    expect(safeAutonomousRoute(state, state.home, { x: 260, y: 250 })).toBe(true);
    expect(safeAutonomousRoute(state, state.home, { x: 264, y: 250 })).toBe(false);
    expect(safeAutonomousRoute(state, state.home, { x: 270, y: 250 })).toBe(false);
    state.buildings[1].active = false;
    expect(safeAutonomousRoute(state, state.home, { x: 260, y: 250 })).toBe(false);
  });
});
