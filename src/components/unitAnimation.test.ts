import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { getUnitAnimation } from './unitAnimation';

const adult = () => ({ ...createGame(6842).units[0], age: 6 });

describe('action animation follows real movement and interaction', () => {
  it('walks to a resource before chopping, and stops walking when the worker arrives', () => {
    const unit = { ...adult(), action: 'gathering', tx: 280, ty: 250 };
    expect(getUnitAnimation(unit, 10, { moving: true, targetKind: 'tree' }).kind).toBe('walk');
    // The command target can remain far away from a legal interaction slot.
    expect(
      getUnitAnimation(unit, 10, { moving: false, ready: true, targetKind: 'tree' }).kind,
    ).toBe('chop');
    expect(
      getUnitAnimation(unit, 10, { moving: false, ready: false, targetKind: 'tree' }).kind,
    ).toBe('idle');
  });

  it('distinguishes extracting, picking up, crafting and eating instead of a single labor loop', () => {
    const unit = { ...adult(), action: 'gathering' };
    expect(getUnitAnimation(unit, 5, { moving: false, targetKind: 'stone' }).kind).toBe('mine');
    expect(getUnitAnimation(unit, 5, { moving: false, targetKind: 'ground' }).kind).toBe('gather');
    expect(getUnitAnimation({ ...unit, action: 'crafting' }, 5).kind).toBe('craft');
    expect(getUnitAnimation({ ...unit, action: 'eating' }, 5).kind).toBe('eat');
    expect(
      getUnitAnimation({ ...unit, action: 'moving' }, 5, { moving: false, targetKind: 'farm' })
        .kind,
    ).toBe('idle');
  });

  it('carries the actual load with supported hands and uses the real held weapon for attacks', () => {
    const unit = adult();
    const carrier = {
      ...unit,
      action: 'returning',
      carry: { resource: 'wood' as const, amount: 1 },
    };
    const loaded = getUnitAnimation(carrier, 7, { moving: true });
    const unloaded = getUnitAnimation({ ...carrier, carry: undefined }, 7, { moving: true });
    expect(loaded.kind).toBe('carry');
    expect(unloaded.kind).toBe('walk');
    expect(loaded.leftHand).not.toEqual(unloaded.leftHand);
    expect(
      getUnitAnimation({ ...unit, action: 'hunting' }, 7, {
        moving: false,
        equipment: { held: 'spear' },
      }).kind,
    ).toBe('thrust');
    expect(
      getUnitAnimation({ ...unit, action: 'hunting' }, 7, { moving: false, equipment: {} }).kind,
    ).toBe('strike');
  });

  it('keeps the pose and grip deterministic in paused time without changing game state', () => {
    const unit = { ...adult(), action: 'crafting' };
    const before = JSON.stringify(unit);
    const pose = getUnitAnimation(unit, 12.25, { facing: -1, equipment: { held: 'workpiece' } });
    expect(getUnitAnimation(unit, 12.25, { facing: -1, equipment: { held: 'workpiece' } })).toEqual(
      pose,
    );
    expect(
      getUnitAnimation(unit, 12.4, { facing: -1, equipment: { held: 'workpiece' } }).rightHand,
    ).not.toEqual(pose.rightHand);
    const opposite = getUnitAnimation(unit, 12.25, { facing: 1, equipment: { held: 'workpiece' } });
    expect(pose.rightHand.x).toBe(-opposite.rightHand.x);
    expect(pose.rightHand.y).toBe(opposite.rightHand.y);
    expect(JSON.stringify(unit)).toBe(before);
  });

  it('keeps newborns still and sleep separate from stale travel or work orders', () => {
    const unit = { ...adult(), action: 'sleeping', tx: 280, ty: 270 };
    expect(getUnitAnimation(unit, 5, { moving: true }).kind).toBe('sleep');
    expect(
      getUnitAnimation({ ...unit, age: 0, action: 'gathering' }, 5, {
        moving: true,
        targetKind: 'tree',
      }).kind,
    ).toBe('idle');
  });
  it('shows a real meal or delivery gesture without replacing new work or locomotion', () => {
    const unit = { ...adult(), action: 'idle' };
    expect(getUnitAnimation(unit, 5, { moving: false, recentEvent: 'meal' }).kind).toBe('eat');
    expect(getUnitAnimation(unit, 5, { moving: false, recentEvent: 'deposit' }).kind).toBe(
      'deposit',
    );
    expect(getUnitAnimation(unit, 5, { moving: true, recentEvent: 'deposit' }).kind).toBe('walk');
    expect(
      getUnitAnimation({ ...unit, action: 'crafting' }, 5, {
        moving: false,
        recentEvent: 'deposit',
      }).kind,
    ).toBe('craft');
    expect(
      getUnitAnimation({ ...unit, action: 'combat' }, 5, { moving: false, recentEvent: 'meal' })
        .kind,
    ).toBe('strike');
  });
});
