import { describe, expect, it } from 'vitest';
import { anchoredPinchView, type MapGestureViewport } from './mapGestures';

const viewport: MapGestureViewport = {
  width: 384,
  height: 300,
  baseScale: 0.375,
  worldScaleX: 2.4,
  worldScaleY: 1.6,
};
const anchor = { distance: 40, zoom: 4.5, worldX: 270, worldY: 260 };
function displayed(view: NonNullable<ReturnType<typeof anchoredPinchView>>) {
  return {
    x:
      viewport.width / 2 +
      (anchor.worldX - view.centerX) * viewport.worldScaleX * viewport.baseScale * view.zoom,
    y:
      viewport.height / 2 +
      (anchor.worldY - view.centerY) * viewport.worldScaleY * viewport.baseScale * view.zoom,
  };
}

describe('pinch follows the world point held between the fingers', () => {
  it('keeps an off-centre world point under the fingers when zooming', () => {
    const fingers = { distance: 80, midpointX: 275, midpointY: 205 };
    const next = anchoredPinchView(anchor, fingers, viewport, 4)!;
    expect(next.zoom).toBe(9);
    expect(displayed(next).x).toBeCloseTo(fingers.midpointX, 8);
    expect(displayed(next).y).toBeCloseTo(fingers.midpointY, 8);
  });
  it('also follows two-finger translation with unchanged separation', () => {
    const fingers = { distance: 40, midpointX: 300, midpointY: 100 };
    const next = anchoredPinchView(anchor, fingers, viewport, 4)!;
    expect(next.zoom).toBe(anchor.zoom);
    expect(displayed(next).x).toBeCloseTo(300, 8);
    expect(displayed(next).y).toBeCloseTo(100, 8);
  });
  it('keeps the finger anchor stable at both zoom limits', () => {
    for (const distance of [10, 800]) {
      const fingers = { distance, midpointX: 260, midpointY: 180 };
      const next = anchoredPinchView(anchor, fingers, viewport, 4)!;
      expect(next.zoom).toBe(distance === 10 ? 4 : 16);
      expect(displayed(next).x).toBeCloseTo(260, 8);
      expect(displayed(next).y).toBeCloseTo(180, 8);
    }
  });
  it('ignores a collapsed or incomplete gesture instead of producing invalid coordinates', () => {
    expect(
      anchoredPinchView(
        { ...anchor, distance: 0 },
        { distance: 40, midpointX: 0, midpointY: 0 },
        viewport,
        4,
      ),
    ).toBeNull();
    expect(
      anchoredPinchView(anchor, { distance: 0, midpointX: 0, midpointY: 0 }, viewport, 4),
    ).toBeNull();
    expect(
      anchoredPinchView(
        anchor,
        { distance: 40, midpointX: 0, midpointY: 0 },
        { ...viewport, height: 0 },
        4,
      ),
    ).toBeNull();
  });
});
