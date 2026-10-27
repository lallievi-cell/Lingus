/** Pinch geometry uses CSS pixels, independent of canvas resolution and DPR. */
export interface MapPinchAnchor {
  distance: number;
  zoom: number;
  worldX: number;
  worldY: number;
}
export interface MapGestureViewport {
  width: number;
  height: number;
  /** Scale at zoom one, in CSS pixels per logical map pixel. */
  baseScale: number;
  worldScaleX: number;
  worldScaleY: number;
}

export function anchoredPinchView(
  anchor: MapPinchAnchor,
  fingers: { distance: number; midpointX: number; midpointY: number },
  viewport: MapGestureViewport,
  minimumZoom: number,
  maximumZoom = 16,
) {
  if (
    anchor.distance <= 8 ||
    fingers.distance <= 8 ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    viewport.baseScale <= 0 ||
    viewport.worldScaleX <= 0 ||
    viewport.worldScaleY <= 0
  )
    return null;
  const zoom = Math.max(
    minimumZoom,
    Math.min(
      maximumZoom,
      Math.round(((anchor.zoom * fingers.distance) / anchor.distance) * 100) / 100,
    ),
  );
  const scale = viewport.baseScale * zoom;
  return {
    zoom,
    centerX:
      anchor.worldX - (fingers.midpointX - viewport.width / 2) / scale / viewport.worldScaleX,
    centerY:
      anchor.worldY - (fingers.midpointY - viewport.height / 2) / scale / viewport.worldScaleY,
  };
}
