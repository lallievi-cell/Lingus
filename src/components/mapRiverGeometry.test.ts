import { describe, expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { riverSegments } from '../game/worldGeneration';
import { createRiverArtGeometry, sampleRiverArt } from './mapRiverGeometry';

describe('shared painted river geometry', () => {
  it('keeps Seed Zero continuous through its original bends and beyond the map edges', () => {
    const geometry = createRiverArtGeometry();
    expect(sampleRiverArt(geometry, -10)).toMatchObject({ x: 1000 / 2.4, y: -50 });
    expect(sampleRiverArt(geometry, geometry.length + 10)).toMatchObject({ x: 610 / 2.4, y: 550 });
    for (const [x, y] of [
      [980, 255],
      [850, 412],
      [780, 598],
    ]) {
      expect(
        geometry.points.some((point) => Math.hypot(point.x - x / 2.4, point.y - y / 1.6) < 0.001),
      ).toBe(true);
    }
    for (let distance = 0; distance < geometry.length; distance += 0.7) {
      const a = sampleRiverArt(geometry, distance);
      const b = sampleRiverArt(geometry, distance + 0.7);
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(0.701);
      expect(Math.hypot(a.dx, a.dy)).toBeCloseTo(1, 6);
    }
  });

  it('keeps rounded generated banks within the real placement margin without changing the world', () => {
    for (const seed of [1, 42, 6842, 1283672715]) {
      const state = createGame(seed, 'classic', 'random');
      const before = structuredClone(state);
      const geometry = createRiverArtGeometry(state);
      const segments = riverSegments(state.sectors);
      expect(segments.length).toBeGreaterThan(0);
      for (let distance = 0; distance <= geometry.length; distance += 1.1) {
        const point = sampleRiverArt(geometry, distance);
        const nearest = Math.min(
          ...segments.map(([a, b]) => {
            const dx = b.x - a.x,
              dy = b.y - a.y;
            const t = Math.max(
              0,
              Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
            );
            return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
          }),
        );
        expect(nearest).toBeLessThanOrEqual(1.26);
      }
      expect(createRiverArtGeometry(state)).toEqual(geometry);
      expect(state).toEqual(before);
    }
  });
});
