import { describe, expect, it } from 'vitest';
import { ensureNaturalAtlas, getNaturalAtlasStatus, visiblePixelBounds } from './mapNaturalAtlas';

describe('painted atlas transparent cutouts', () => {
  it('discards fully transparent cells and almost transparent coloured fringes', () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);
    pixels.set([255, 0, 0, 1], 0);
    pixels.set([0, 255, 0, 2], (8 * 8 - 1) * 4);
    expect(visiblePixelBounds(pixels, 8, 8)).toBeNull();
  });

  it('keeps the visible crown and a separate low root without including matte noise', () => {
    const pixels = new Uint8ClampedArray(10 * 12 * 4);
    const put = (x: number, y: number, alpha: number) => {
      pixels.set([95, 117, 70, alpha], (y * 10 + x) * 4);
    };
    put(0, 0, 1);
    put(9, 11, 2);
    put(2, 1, 255);
    put(7, 3, 120);
    put(5, 10, 255);
    expect(visiblePixelBounds(pixels, 10, 12)).toEqual({ x: 2, y: 1, width: 6, height: 10 });
  });

  it('does not require a browser or fail server-side module imports', async () => {
    expect(await ensureNaturalAtlas()).toBe(false);
    expect(getNaturalAtlasStatus()).toBe('idle');
  });
});
