import type { GameState, RegionalRoadSegment } from '../game/types';
import { riverSegments } from '../game/worldGeneration';

type Point = { x: number; y: number };
type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type Piece = { from: Point; to: Point };
export interface RegionalRouteStyle {
  stage: 'trail' | 'dirt' | 'paved';
  wear: number;
  width: number;
  opacity: number;
}

/** The first trip leaves a trace; accumulated real travel gradually compacts it. */
export function getRegionalRouteStyle(
  state: Pick<GameState, 'tier'>,
  segment: RegionalRoadSegment,
): RegionalRouteStyle {
  const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
  const wear = segment.travelled / Math.max(0.001, length);
  const stage = state.tier >= 5 && wear >= 4 ? 'paved' : wear >= 2 ? 'dirt' : 'trail';
  return {
    stage,
    wear,
    width: stage === 'paved' ? 2.4 : stage === 'dirt' ? 1.8 : 0.85,
    opacity: stage === 'paved' ? 0.85 : stage === 'dirt' ? 0.7 : 0.42,
  };
}

let geographyKey = '';
let water: Piece[] = [];
const landCache = new Map<string, Piece[]>();

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y,
  };
}

function updateWater(state: GameState) {
  const key = `${state.mapGeneration?.mode ?? 'seed-zero'}:${state.sectors.map((s) => `${s.x},${s.y}:${s.biome}`).join('|')}`;
  if (geographyKey === key) return;
  geographyKey = key;
  landCache.clear();
  if (state.mapGeneration?.mode === 'random') {
    // The painted river rounds corners by less than 1.5m; the margin below
    // also keeps road shoulders clear of those rounded water edges.
    water = riverSegments(state.sectors).map(([from, to]) => ({ from, to }));
    if (water.length) return;
  }
  // Same four world-space Béziers as mapTerrainArt's canonical river.
  const point = (x: number, y: number): Point => ({ x: x / 2.4, y: y / 1.6 });
  const curves = [
    [point(1000, -80), point(870, 100), point(1060, 140), point(980, 255)],
    [point(980, 255), point(920, 340), point(820, 297), point(850, 412)],
    [point(850, 412), point(875, 502), point(750, 510), point(780, 598)],
    [point(780, 598), point(810, 698), point(660, 726), point(610, 880)],
  ];
  water = [];
  for (const [a, b, c, d] of curves) {
    let previous = a;
    for (let i = 1; i <= 36; i++) {
      const next = cubic(a, b, c, d, i / 36);
      water.push({ from: previous, to: next });
      previous = next;
    }
  }
}

function distanceToPiece(point: Point, piece: Piece) {
  const dx = piece.to.x - piece.from.x;
  const dy = piece.to.y - piece.from.y;
  const divisor = dx * dx + dy * dy;
  const fraction = divisor
    ? Math.max(
        0,
        Math.min(1, ((point.x - piece.from.x) * dx + (point.y - piece.from.y) * dy) / divisor),
      )
    : 0;
  return Math.hypot(point.x - piece.from.x - dx * fraction, point.y - piece.from.y - dy * fraction);
}

function landPieces(segment: RegionalRoadSegment): Piece[] {
  const { from, to } = segment;
  const key = `${segment.key}:${from.x.toFixed(4)},${from.y.toFixed(4)}:${to.x.toFixed(4)},${to.y.toFixed(4)}`;
  const cached = landCache.get(key);
  if (cached) return cached;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(length / 0.7));
  const pieces: Piece[] = [];
  let open: Piece | undefined;
  for (let i = 0; i < count; i++) {
    const at = (fraction: number) => ({
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    });
    const midpoint = at((i + 0.5) / count);
    // The river itself has a 5.5m half-width. Preserve water and a bank margin;
    // traffic history records a crossing, never an invented bridge structure.
    if (water.some((piece) => distanceToPiece(midpoint, piece) < 7.6)) {
      open = undefined;
      continue;
    }
    const next = at((i + 1) / count);
    if (open) open.to = next;
    else {
      open = { from: at(i / count), to: next };
      pieces.push(open);
    }
  }
  if (landCache.size >= 4096) landCache.delete(landCache.keys().next().value!);
  landCache.set(key, pieces);
  return pieces;
}

/** Roads are ground artwork only: they neither create routes nor speed up travel. */
export function drawRegionalRoutes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  viewport?: Viewport,
) {
  if (state.tier < 4 || !state.regionalRoutes?.length) return;
  updateWater(state);
  ctx.save();
  ctx.beginPath();
  for (const sector of state.sectors)
    if (sector.explored || state.tier >= 4) ctx.rect(sector.x * 240, sector.y * 160, 240, 160);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const scale = Math.max(0.1, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
  const stroke = (piece: Piece, color: string, width: number) => {
    ctx.beginPath();
    ctx.moveTo(piece.from.x * 2.4, piece.from.y * 1.6);
    ctx.lineTo(piece.to.x * 2.4, piece.to.y * 1.6);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  for (const segment of state.regionalRoutes) {
    if (
      viewport &&
      (Math.max(segment.from.x, segment.to.x) < viewport.minX - 2 ||
        Math.min(segment.from.x, segment.to.x) > viewport.maxX + 2 ||
        Math.max(segment.from.y, segment.to.y) < viewport.minY - 2 ||
        Math.min(segment.from.y, segment.to.y) > viewport.maxY + 2)
    )
      continue;
    const style = getRegionalRouteStyle(state, segment);
    const width = Math.max(style.width, 0.65 / scale);
    ctx.globalAlpha = style.opacity;
    for (const piece of landPieces(segment)) {
      // Soft, worn shoulders blend with the pigment of the terrain.
      stroke(piece, '#7e75512e', width + 1.1);
      stroke(piece, style.stage === 'paved' ? '#746d54' : '#aa9062', width);
      if (style.stage === 'dirt') stroke(piece, '#c3ac7e', width * 0.48);
      if (style.stage === 'paved') {
        stroke(piece, '#d0c8aa', width * 0.8);
        ctx.setLineDash([2.2, 0.45]);
        stroke(piece, '#b8ae8e', width * 0.7);
        ctx.setLineDash([]);
        stroke(piece, '#e2dbc2a0', Math.max(0.18, 0.22 / scale));
      }
    }
  }
  ctx.restore();
}
