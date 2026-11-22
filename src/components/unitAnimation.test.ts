import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { getUnitAnimation } from './unitAnimation';

const adult = () => ({ ...createGame(6842).units[0], age: 6 });

describe('action animation follows real movement and interaction', () => {
  it('fishes only while working at the actual dry shore point and carries the real catch away', () => {
    const unit = { ...adult(), action: 'gathering', progress: 1.5 };
    const target = { x: unit.x + 1, y: unit.y };
    expect(getUnitAnimation(unit, 10, { moving: false, targetKind: 'fishery', target }).kind).toBe(
      'fish',
    );
    expect(getUnitAnimation(unit, 10, { moving: true, targetKind: 'fishery', target }).kind).toBe(
      'walk',
    );
    expect(
      getUnitAnimation({ ...unit, progress: 0 }, 10, {
        moving: false,
        targetKind: 'fishery',
        target,
      }).kind,
    ).toBe('idle');
    expect(
      getUnitAnimation(unit, 10, {
        moving: false,
        targetKind: 'fishery',
        target: { x: unit.x + 4, y: unit.y },
      }).kind,
    ).toBe('idle');
    expect(
      getUnitAnimation(unit, 10, { moving: false, ready: false, targetKind: 'fishery', target })
        .kind,
    ).toBe('idle');
    expect(
      getUnitAnimation(
        { ...unit, action: 'returning', carry: { resource: 'fish', amount: 1 } },
        10,
        { moving: true, targetKind: 'fishery', target },
      ).kind,
    ).toBe('carry');
  });
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

  it('braces a depicted bundle with both hands and keeps its short stride separate from an empty walk', () => {
    const carrier = {
      ...adult(),
      action: 'returning',
      carry: { resource: 'wood' as const, amount: 2 },
    };
    const frames = Array.from({ length: 24 }, (_, frame) => frame / 24);
    const widestStep = (carrying: boolean) =>
      Math.max(
        ...frames.map((time) =>
          Math.abs(
            getUnitAnimation(carrying ? carrier : { ...carrier, carry: undefined }, time, {
              moving: true,
              facing: 1,
              wideCarry: true,
            }).step,
          ),
        ),
      );
    expect(widestStep(true)).toBeLessThan(widestStep(false));
    const compact = getUnitAnimation(carrier, 2, { moving: false, facing: 1 });
    const wide = getUnitAnimation(carrier, 2, { moving: false, facing: 1, wideCarry: true });
    expect(wide.step).toBe(0);
    expect(wide.rightHand.x - wide.leftHand.x).toBeGreaterThan(
      compact.rightHand.x - compact.leftHand.x,
    );
    const mirrored = getUnitAnimation(carrier, 2, { moving: false, facing: -1, wideCarry: true });
    expect(mirrored.leftHand).toEqual({ x: -wide.leftHand.x, y: wide.leftHand.y });
    expect(mirrored.rightHand).toEqual({ x: -wide.rightHand.x, y: wide.rightHand.y });
    const unloaded = { ...carrier, carry: undefined };
    expect(getUnitAnimation(unloaded, 2, { moving: false, wideCarry: true })).toEqual(
      getUnitAnimation(unloaded, 2, { moving: false }),
    );
  });

  it('strikes low into stone, swings higher into wood and never depicts contact while waiting', () => {
    const unit = { ...adult(), action: 'gathering' };
    const frames = Array.from({ length: 90 }, (_, frame) => frame / 60);
    const poses = (targetKind: 'tree' | 'stone', ready: boolean) =>
      frames.map((time) =>
        getUnitAnimation(unit, time, { moving: false, facing: 1, targetKind, ready }),
      );
    const wood = poses('tree', true).find((pose) => pose.impact > 0.8);
    const stone = poses('stone', true).find((pose) => pose.impact > 0.8);
    expect(wood).toBeDefined();
    expect(stone).toBeDefined();
    expect(stone!.bodyDrop).toBeGreaterThan(wood!.bodyDrop);
    expect(stone!.rightHand.y).toBeGreaterThan(wood!.rightHand.y + 3);
    expect(poses('tree', false).every((pose) => pose.kind === 'idle' && pose.impact === 0)).toBe(
      true,
    );
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
