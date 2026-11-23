import type { GameState } from '../game/types';
import { getWorldSize, isWorldPointRevealed, WORLD_SECTOR_SIZE } from '../game/worldDimensions';
import { hasPhysicalCamp } from '../game/physicalCamp';
import { unitIsSeatedAboard } from './mapMaritimeArt';
import type { TerrainImage } from './mapTerrainArt';

const WIDTH = 134;
const HEIGHT = 88;
const SECTOR_MARGIN = WORLD_SECTOR_SIZE / 2;

type Point = { x: number; y: number };
type Viewport = { minX: number; minY: number; maxX: number; maxY: number };
type Frame = { x: number; y: number; span: number };

function chartFrame(revealed: readonly Point[], size: number, regional: boolean): Frame {
  if (regional || !revealed.length) return { x: 0, y: 0, span: size };
  const left = Math.min(...revealed.map((sector) => sector.x)) * WORLD_SECTOR_SIZE;
  const top = Math.min(...revealed.map((sector) => sector.y)) * WORLD_SECTOR_SIZE;
  const right = (Math.max(...revealed.map((sector) => sector.x)) + 1) * WORLD_SECTOR_SIZE;
  const bottom = (Math.max(...revealed.map((sector) => sector.y)) + 1) * WORLD_SECTOR_SIZE;
  const span = Math.min(size, Math.max(right - left, bottom - top) + 2 * SECTOR_MARGIN);
  return {
    x: Math.max(0, Math.min(size - span, (left + right - span) / 2)),
    y: Math.max(0, Math.min(size - span, (top + bottom - span) / 2)),
    span,
  };
}

function project(frame: Frame, x: number, y: number) {
  return { x: ((x - frame.x) * WIDTH) / frame.span, y: ((y - frame.y) * HEIGHT) / frame.span };
}

function drawBase(
  context: CanvasRenderingContext2D,
  frame: Frame,
  size: number,
  revealed: readonly Point[],
  regional: boolean,
  terrain: TerrainImage,
  dpr: number,
) {
  const { x, y, span } = frame;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#252d28';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  // Filtering a cropped source can sample across its edge in Canvas2D.
  // Regional charts have no hidden neighbors and can use filtered artwork.
  context.imageSmoothingEnabled = regional;

  // Sample only the revealed source rectangles. A tint on the printed
  // ground leaves the opaque slate between surveyed sectors untouched.
  const drawSurvey = (left: number, top: number, metres: number) => {
    const point = project(frame, left, top);
    const far = project(frame, left + metres, top + metres);
    const startX = Math.round(point.x * dpr);
    const startY = Math.round(point.y * dpr);
    const width = Math.round(far.x * dpr) - startX;
    const height = Math.round(far.y * dpr) - startY;
    context.drawImage(
      terrain,
      (left * terrain.width) / size,
      (top * terrain.height) / size,
      (metres * terrain.width) / size,
      (metres * terrain.height) / size,
      startX,
      startY,
      width,
      height,
    );
    context.fillStyle = '#56472836';
    context.fillRect(startX, startY, width, height);
  };
  if (regional) drawSurvey(x, y, span);
  else
    for (const sector of revealed)
      drawSurvey(sector.x * WORLD_SECTOR_SIZE, sector.y * WORLD_SECTOR_SIZE, WORLD_SECTOR_SIZE);

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.strokeStyle = '#ddc78e39';
  context.lineWidth = 0.5;
  context.beginPath();
  for (let line = WORLD_SECTOR_SIZE; line < size; line += WORLD_SECTOR_SIZE) {
    const point = project(frame, line, line);
    context.moveTo(point.x, 0);
    context.lineTo(point.x, HEIGHT);
    context.moveTo(0, point.y);
    context.lineTo(WIDTH, point.y);
  }
  context.stroke();
}

function marker(
  context: CanvasRenderingContext2D,
  point: Point,
  pigment: string,
  radius: number,
  shape: 'dot' | 'diamond' | 'square' | 'hull',
) {
  const { x, y } = point;
  context.fillStyle = pigment;
  context.strokeStyle = '#201f18';
  context.lineWidth = 0.8;
  context.beginPath();
  if (shape === 'dot') context.arc(x, y, radius, 0, Math.PI * 2);
  if (shape === 'square') context.rect(x - radius, y - radius, 2 * radius, 2 * radius);
  if (shape === 'diamond') {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
  }
  if (shape === 'hull') {
    context.moveTo(x - radius, y - 1.1);
    context.lineTo(x + radius, y - 1.1);
    context.lineTo(x + radius * 0.52, y + 1.2);
    context.lineTo(x - radius * 0.52, y + 1.2);
    context.closePath();
  }
  context.fill();
  context.stroke();
}

function drawMarkers(context: CanvasRenderingContext2D, state: GameState, frame: Frame) {
  const visible = (point: Point) => isWorldPointRevealed(state, point.x, point.y);
  for (const unit of state.units) {
    const foreign = !!unit.factionId && unit.factionId !== 'player';
    const deployedChief = ['delegating', 'frontline', 'frontline-returning'].includes(unit.action);
    if (
      unit.hp > 0 &&
      (!state.urbanized || foreign || unit.isKing || deployedChief) &&
      !unitIsSeatedAboard(state, unit) &&
      visible(unit)
    )
      marker(context, project(frame, unit.x, unit.y), foreign ? '#dd9c7c' : '#f5deb7', 1.4, 'dot');
  }
  for (const boat of state.boats ?? [])
    if (boat.hp > 0 && visible(boat))
      marker(
        context,
        project(frame, boat.x, boat.y),
        boat.status === 'building' ? '#bfb286' : '#f3d38c',
        3,
        'hull',
      );
  for (const city of state.cities)
    if (visible(city))
      marker(
        context,
        project(frame, city.x, city.y),
        city.factionId === 'player' ? '#f1c47b' : '#e39b78',
        2.5,
        'square',
      );
  for (const army of state.battalions)
    if (army.hp > 0 && visible(army))
      marker(
        context,
        project(frame, army.x, army.y),
        army.factionId === 'player' ? '#dfcd92' : '#d98869',
        2,
        'diamond',
      );
  if (!state.urbanized && hasPhysicalCamp(state) && visible(state.home)) {
    const camp = project(frame, state.home.x, state.home.y);
    marker(context, camp, '#e1b46a', 4, 'diamond');
    marker(context, camp, '#fcf0cc', 1.25, 'diamond');
  }
}

function drawCamera(context: CanvasRenderingContext2D, frame: Frame, viewport: Viewport) {
  const start = project(frame, viewport.minX, viewport.minY);
  const end = project(frame, viewport.maxX, viewport.maxY);
  const width = end.x - start.x;
  const height = end.y - start.y;
  context.strokeStyle = '#25201cca';
  context.lineWidth = 2.5;
  context.strokeRect(start.x, start.y, width, height);
  context.strokeStyle = '#ffebbf';
  context.lineWidth = 1;
  context.strokeRect(start.x, start.y, width, height);
}

export function createMapChartPainter() {
  const paper = document.createElement('canvas');
  const underlay = paper.getContext('2d')!;
  let cachedTerrain: TerrainImage | undefined;
  let cachedArea = '';
  let cachedFrame: Frame;
  let lastState: GameState | undefined;
  let lastView: Viewport | undefined;
  let lastDpr: number | undefined;

  return (
    context: CanvasRenderingContext2D,
    state: GameState,
    terrain: TerrainImage,
    viewport: Viewport,
    dpr: number,
  ) => {
    const width = Math.round(WIDTH * dpr);
    const height = Math.round(HEIGHT * dpr);
    const canvas = context.canvas;
    if (
      lastState === state &&
      cachedTerrain === terrain &&
      lastView?.minX === viewport.minX &&
      lastView.minY === viewport.minY &&
      lastView.maxX === viewport.maxX &&
      lastView.maxY === viewport.maxY &&
      lastDpr === dpr &&
      canvas.width === width &&
      canvas.height === height
    )
      return;

    const size = getWorldSize(state);
    const regional = state.tier >= 4;
    const revealed = regional ? [] : state.sectors.filter((sector) => sector.explored);
    const areaKey = `${size}:${regional}:${dpr}:${revealed.map(({ x, y }) => `${x},${y}`).join(';')}`;
    if (cachedTerrain !== terrain || cachedArea !== areaKey) {
      paper.width = width;
      paper.height = height;
      cachedFrame = chartFrame(revealed, size, regional);
      drawBase(underlay, cachedFrame, size, revealed, regional, terrain, dpr);
      cachedArea = areaKey;
      cachedTerrain = terrain;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(paper, 0, 0);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMarkers(context, state, cachedFrame);
    drawCamera(context, cachedFrame, viewport);
    lastState = state;
    lastView = viewport;
    lastDpr = dpr;
  };
}
