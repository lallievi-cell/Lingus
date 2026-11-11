import type { MapEntity } from '../game/types';
import { drawPainterlyNature } from './mapNatureArt';
import { getNaturalAtlasStatus } from './mapNaturalAtlas';

// Below ten CSS pixels per tree, individual limbs and canopy sway add work
// without readable detail. The same painted silhouette stays at its real anchor.
export function usesOverviewNature(contextScale: number, pixelRatio = 1) {
  return contextScale / Math.max(1, pixelRatio) < 0.65;
}

export function boundedMapLabelX(x: number, textWidth: number, min: number, max: number) {
  const half = Math.min(textWidth, Math.max(0, max - min)) / 2;
  return Math.max(min + half, Math.min(max - half, x));
}

const MAX_SILHOUETTES = 128;
const silhouettes = new Map<string, HTMLCanvasElement>();
const LEFT = -70,
  TOP = -85,
  WIDTH = 140,
  HEIGHT = 110,
  PIXELS = 0.5;

function variant(id: string) {
  let seed = 2166136261;
  for (let index = 0; index < id.length; index++)
    seed = Math.imul(seed ^ id.charCodeAt(index), 16777619);
  return (seed >>> 0) % 8;
}

/** Small composite sprites keep species, season and exhaustion visible, while
 * actual movement, hit testing and quantities continue to use the live state. */
export function drawOverviewNature(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  seasonIndex: number,
  unknown: boolean,
  x: number,
  y: number,
  spriteScale: number,
) {
  const key = `${getNaturalAtlasStatus()}:${entity.kind}:${variant(entity.id)}:${seasonIndex % 4}:${unknown}:${entity.amount <= 0}:${entity.hp <= 0}`;
  let canvas = silhouettes.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = WIDTH * PIXELS;
    canvas.height = HEIGHT * PIXELS;
    const painter = canvas.getContext('2d')!;
    painter.scale(PIXELS, PIXELS);
    painter.translate(-LEFT, -TOP);
    drawPainterlyNature(painter, entity, 0, seasonIndex, unknown, {
      units: [],
      simulationTime: 0,
      reducedMotion: true,
      sessionKey: 'overview-silhouettes',
    });
    if (silhouettes.size >= MAX_SILHOUETTES) silhouettes.delete(silhouettes.keys().next().value!);
    silhouettes.set(key, canvas);
  }
  ctx.drawImage(
    canvas,
    x + LEFT * spriteScale,
    y + TOP * spriteScale,
    WIDTH * spriteScale,
    HEIGHT * spriteScale,
  );
}
