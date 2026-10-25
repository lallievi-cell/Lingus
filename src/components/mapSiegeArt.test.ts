import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { BUILDING_SPECS } from '../game/content';
import type { Battalion, Building } from '../game/types';
import { deriveSiegePresentation, getSiegeProjectile } from './mapSiegeArt';

function fixture() {
  const state = createGame(6842);
  Object.assign(state, { tier: 4, urbanized: true, time: 20.25, paused: false });
  const city = state.cities[0];
  Object.assign(city, { x: 250, y: 250, garrisonHp: 100, occupation: 28 });
  const battalion: Battalion = {
    id: 'siege-army',
    name: 'Guardia',
    x: 248,
    y: 250,
    cityId: 'home',
    factionId: 'player',
    hp: 1000,
    maxHp: 1000,
    morale: 1,
    targetId: city.id,
    action: 'conquering',
    catapult: true,
    occupation: 12,
  };
  const wall: Building = {
    id: 'actual-walls',
    cityId: city.id,
    kind: 'walls',
    x: city.x,
    y: city.y,
    hp: 1200,
    active: true,
  };
  state.battalions = [battalion];
  state.buildings = [wall];
  return { state, city, battalion, wall };
}

function confirmShot(scene: ReturnType<typeof fixture>) {
  scene.battalion.lastSiegeShot = {
    time: scene.state.time,
    cityId: scene.city.id,
    wallId: scene.wall.id,
    fromX: scene.battalion.x,
    fromY: scene.battalion.y,
    damage: 200,
  };
}

describe('regional sieges reflect real attack state', () => {
  it('reads actual walls, then garrison, then the individual 30-second occupation counter', () => {
    const scene = fixture();
    const { state, city, battalion, wall } = scene;
    expect(deriveSiegePresentation(state, battalion)).toMatchObject({
      phase: 'walls',
      wallRatio: 1200 / BUILDING_SPECS.walls.maxHp,
      occupationSeconds: 0,
    });
    // Maintenance inactivity does not remove the walls' defense in attackCity.
    wall.active = false;
    expect(deriveSiegePresentation(state, battalion)?.phase).toBe('walls');
    wall.hp = 0;
    expect(deriveSiegePresentation(state, battalion)?.phase).toBe('garrison');
    city.garrisonHp = 0;
    expect(deriveSiegePresentation(state, battalion)).toMatchObject({
      phase: 'occupation',
      occupationSeconds: 12,
      occupationRatio: 0.4,
    });
    battalion.action = 'attacking';
    expect(deriveSiegePresentation(state, battalion)).toMatchObject({
      phase: 'sacking',
      occupationSeconds: 0,
    });
  });

  it('ignores incomplete walls and stale city occupation after retreat, death, distance or capture', () => {
    const { state, city, battalion, wall } = fixture();
    wall.completed = false;
    expect(deriveSiegePresentation(state, battalion)?.phase).toBe('garrison');
    battalion.action = 'moving';
    expect(deriveSiegePresentation(state, battalion)).toBeUndefined();
    battalion.action = 'conquering';
    battalion.hp = 0;
    expect(deriveSiegePresentation(state, battalion)).toBeUndefined();
    battalion.hp = 1000;
    battalion.x = city.x - 4;
    expect(deriveSiegePresentation(state, battalion)).toBeUndefined();
    battalion.x = city.x;
    city.factionId = battalion.factionId;
    expect(deriveSiegePresentation(state, battalion)).toBeUndefined();
    city.factionId = 'ruins';
    expect(deriveSiegePresentation(state, battalion)).toBeUndefined();
  });

  it('never fires merely because a catapult is present or attack progress advances', () => {
    const scene = fixture();
    scene.battalion.attackProgress = 0.6;
    expect(getSiegeProjectile(scene.state, scene.battalion, 20.6)).toBeUndefined();
    confirmShot(scene);
    const projectile = getSiegeProjectile(scene.state, scene.battalion, 20.55)!;
    expect(projectile.progress).toBeGreaterThan(0);
    expect(projectile.progress).toBeLessThan(1);
    const straightY =
      projectile.from.y + (projectile.to.y - projectile.from.y) * projectile.progress;
    expect(projectile.position.y).toBeLessThan(straightY);
  });

  it('keeps the final confirmed hit after a breach, but expires it and never redirects it to a new target', () => {
    const scene = fixture();
    confirmShot(scene);
    const original = getSiegeProjectile(scene.state, scene.battalion, 20.55)!;
    scene.wall.hp = 0;
    scene.battalion.targetId = scene.state.cities[1].id;
    scene.battalion.action = 'moving';
    scene.battalion.x = 240;
    expect(getSiegeProjectile(scene.state, scene.battalion, 20.55)).toEqual(original);
    expect(getSiegeProjectile(scene.state, scene.battalion, 21.1)).toBeUndefined();
    scene.battalion.lastSiegeShot!.damage = 0;
    expect(getSiegeProjectile(scene.state, scene.battalion, 20.55)).toBeUndefined();
  });

  it('freezes the exact projectile during pause and uses a static breach cue with reduced motion', () => {
    const scene = fixture();
    confirmShot(scene);
    scene.state.time = 20.55;
    scene.state.paused = true;
    expect(getSiegeProjectile(scene.state, scene.battalion, 23)).toEqual(
      getSiegeProjectile(scene.state, scene.battalion, 24),
    );
    scene.state.paused = false;
    const still = getSiegeProjectile(scene.state, scene.battalion, 20.55, { reducedMotion: true })!;
    expect(still.position).toEqual(still.to);
    expect(still.progress).toBe(1);
    expect(still.reducedMotion).toBe(true);
  });

  it('culls unrelated, hidden or off-screen sources and preserves the saved simulation verbatim', () => {
    const scene = fixture();
    confirmShot(scene);
    const before = structuredClone(scene.state);
    getSiegeProjectile(scene.state, scene.battalion, 20.55);
    deriveSiegePresentation(scene.state, scene.battalion);
    expect(scene.state).toEqual(before);
    expect(
      getSiegeProjectile(scene.state, scene.battalion, 20.55, {
        viewport: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      }),
    ).toBeUndefined();
    scene.battalion.lastSiegeShot!.wallId = 'another-wall';
    expect(getSiegeProjectile(scene.state, scene.battalion, 20.55)).toBeUndefined();
    scene.state.tier = 3;
    expect(deriveSiegePresentation(scene.state, scene.battalion)).toBeUndefined();
  });
});
