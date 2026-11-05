import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import type { MapEntity, Unit } from '../game/types';
import { getMapWorkEffects, type MapWorkEffectContext } from './mapWorkEffects';
import { getUnitAnimation } from './unitAnimation';

const worker = (): Unit => ({
  ...createGame(6842).units[0],
  age: 6,
  action: 'gathering',
  targetId: 'source',
});
const context = (kind: MapEntity['kind'] = 'tree'): MapWorkEffectContext => ({
  moving: false,
  ready: true,
  source: { id: 'source', kind, amount: 10 },
  sourceVisible: true,
  resourceKnown: true,
});
const strikePose = (unit: Unit, kind: MapEntity['kind'] = 'tree') => {
  for (let frame = 0; frame < 120; frame++) {
    const pose = getUnitAnimation(unit, frame / 60, {
      moving: false,
      ready: true,
      targetKind: kind,
    });
    if (pose.impact > 0.7) return pose;
  }
  throw new Error('The real work cycle never reached its impact phase');
};

describe('map work accents follow observed activity', () => {
  it('adds brief chips at real chop and mining impacts, never during the lifted stroke', () => {
    const unit = worker();
    for (const kind of ['tree', 'stone', 'ore'] as const) {
      const impact = strikePose(unit, kind);
      const effects = getMapWorkEffects(unit, impact, context(kind));
      expect(effects).toHaveLength(3);
      expect(effects.every((effect) => effect.kind === 'chip' && effect.opacity > 0)).toBe(true);
      const lifted = getUnitAnimation(unit, 0, { moving: false, ready: true, targetKind: kind });
      expect(getMapWorkEffects(unit, { ...lifted, impact: 0 }, context(kind))).toEqual([]);
    }
  });

  it('does not suggest extraction from exhausted, hidden, changed or distant targets', () => {
    const unit = worker();
    const pose = strikePose(unit);
    for (const options of [
      { ...context(), source: { id: 'source', kind: 'tree' as const, amount: 0 } },
      { ...context(), sourceVisible: false },
      { ...context(), source: { id: 'old-source', kind: 'tree' as const, amount: 5 } },
      { ...context(), ready: false },
      { ...context(), moving: true },
      context('ground'),
    ])
      expect(getMapWorkEffects(unit, pose, options)).toEqual([]);
    expect(getMapWorkEffects({ ...unit, action: 'idle' }, pose, context())).toEqual([]);
  });

  it('keeps unknown materials neutral and omits all accents with reduced motion', () => {
    const unit = worker();
    const colors = ['tree', 'stone', 'ore'].map((kind) => {
      const sourceKind = kind as MapEntity['kind'];
      const pose = strikePose(unit, sourceKind);
      const hidden = { ...context(sourceKind), resourceKnown: false };
      expect(getMapWorkEffects(unit, pose, { ...hidden, reducedMotion: true })).toEqual([]);
      return getMapWorkEffects(unit, pose, hidden).map((effect) => effect.color);
    });
    expect(colors[0]).toEqual(colors[1]);
    expect(colors[1]).toEqual(colors[2]);
  });

  it('shows ground contacts only during observed movement, including loaded walking', () => {
    const unit: Unit = {
      ...worker(),
      action: 'returning',
      carry: { resource: 'wood', amount: 1 },
    };
    let visibleContacts = 0;
    for (let frame = 0; frame < 120; frame++) {
      const pose = getUnitAnimation(unit, frame / 60, { moving: true });
      const effects = getMapWorkEffects(unit, pose, { ...context(), moving: true });
      visibleContacts += effects.length;
      expect(effects.length).toBeLessThanOrEqual(2);
      expect(effects.every((effect) => effect.kind === 'foot')).toBe(true);
      expect(getMapWorkEffects(unit, pose, context())).toEqual([]);
      expect(
        getMapWorkEffects(unit, pose, { ...context(), moving: true, reducedMotion: true }),
      ).toEqual([]);
    }
    expect(visibleContacts).toBeGreaterThan(0);
    const waiting = getUnitAnimation(unit, 0, { moving: false });
    expect(getMapWorkEffects(unit, waiting, { ...context(), moving: true })).toEqual([]);
  });

  it('freezes with the pose, keeps a fixed particle budget and leaves simulation data intact', () => {
    const unit = worker();
    const options = context();
    const before = JSON.stringify({ unit, options });
    for (let frame = 0; frame < 600; frame++) {
      const pose = getUnitAnimation(unit, frame / 30, {
        moving: false,
        ready: true,
        targetKind: 'tree',
      });
      const effects = getMapWorkEffects(unit, pose, options);
      expect(effects.length).toBeLessThanOrEqual(3);
      expect(getMapWorkEffects(unit, pose, options)).toEqual(effects);
      for (const effect of effects) {
        expect(Math.abs(effect.x)).toBeLessThan(24);
        expect(Math.abs(effect.y)).toBeLessThan(15);
        expect(effect.opacity).toBeGreaterThanOrEqual(0);
        expect(effect.opacity).toBeLessThanOrEqual(1);
      }
    }
    expect(JSON.stringify({ unit, options })).toBe(before);
  });
});
