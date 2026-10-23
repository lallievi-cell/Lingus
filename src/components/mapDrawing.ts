import type { GameState, Resource, WorldTarget } from '../game/types';
import { hasBuilding } from '../game/runtime';
import { getCustodianStatuses, type CustodianStatus } from '../game/custodianStatus';
import { getGroundPiles, groundPileFor, resourceKnown, type GroundPile } from './mapResourceLayout';

export const visibleBorderRadius = (state: GameState) => (hasBuilding(state, 'palace') ? 100 : 35);

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 800;
export const WORLD_SIZE = 500;
export const SPRITE_SCALE = 0.2;
export const worldPoint = (x: number, y: number) => ({ x: x * 2.4, y: y * 1.6 });
export const hasConcept = (state: GameState, id: string) => (state.words[id]?.retention ?? 0) > 0;
export function isVisibleAt(state: GameState, x: number, y: number) {
  return (
    state.tier >= 4 ||
    state.sectors.some(
      (s) =>
        s.explored &&
        s.x === Math.min(4, Math.floor(x / 100)) &&
        s.y === Math.min(4, Math.floor(y / 100)),
    )
  );
}

export const entityNames: Record<string, string> = {
  ore: 'Vena mineraria',
  alpha: 'Predatore alfa',
  ground: 'Risorse a terra',
  seedling: 'Germoglio',
  farm: 'Campo agricolo',
  pen: 'Recinto',
  foundry: 'Fonderia',
  archive: 'Archivio',
  palace: 'Palazzo',
  temple: 'Tempio',
  school: 'Scuola',
  workshop: 'Officina',
  court: 'Tribunale',
  market: 'Mercato',
  walls: 'Mura',
  stele: 'Stele',
  berries: 'Bacche selvatiche',
  tree: 'Bosco di betulle',
  stone: 'Affioramento di selce',
  deer: 'Cervo',
  wolf: 'Lupo',
  mammoth: 'Mammut',
  corpse: 'Resti di un compagno',
  campfire: 'Falò centrale',
  storage: 'Pozzo delle scorte',
  depot: 'Deposito dei materiali',
  hut: 'Capanna',
  palisade: 'Palizzata',
  menhir: 'Pietra sacra',
  grave: 'Tumulo',
  house: 'Casa in pietra',
};

export function seededRandom(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function polygon(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

/** Small physical silhouettes, shared by piles and a person's actual carried load. */
function drawMaterial(
  ctx: CanvasRenderingContext2D,
  resource: Resource,
  x: number,
  y: number,
  recognized: boolean,
) {
  if (!recognized) {
    rock(ctx, x - 8, y + 2, 11, 1, true);
    rock(ctx, x + 8, y + 2, 10, 0, true);
    rock(ctx, x, y - 4, 11, 1, true);
    return;
  }
  if (resource === 'wood') {
    const log = (px: number, py: number) => {
      polygon(
        ctx,
        [
          [px - 15, py - 5],
          [px + 10, py - 8],
          [px + 15, py - 3],
          [px + 15, py + 4],
          [px - 14, py + 6],
        ],
        '#806044',
      );
      polygon(
        ctx,
        [
          [px - 15, py - 5],
          [px + 10, py - 8],
          [px + 15, py - 3],
          [px - 12, py + 1],
        ],
        '#aa8055',
      );
      line(
        ctx,
        [
          [px - 10, py - 2],
          [px + 9, py - 5],
        ],
        '#c89c66',
        1.5,
      );
      oval(ctx, px + 14, py, 4.8, 5.6, '#d3b37b');
      ctx.strokeStyle = '#99724e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px + 14, py, 2.5, 3.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    log(x - 9, y + 2);
    log(x + 9, y + 5);
    log(x, y - 8);
    line(
      ctx,
      [
        [x - 6, y - 11],
        [x - 7, y + 10],
      ],
      '#e3cda0',
      2.2,
    );
  } else if (resource === 'stone' || resource === 'ore') {
    rock(ctx, x - 13, y + 3, 11, 1);
    rock(ctx, x + 12, y + 4, 12, 0);
    rock(ctx, x, y - 3, 15, 1);
    if (resource === 'ore')
      line(
        ctx,
        [
          [x - 7, y - 11],
          [x + 2, y - 6],
          [x - 1, y + 1],
          [x + 9, y - 1],
        ],
        '#6e9a85',
        3,
      );
    else
      line(
        ctx,
        [
          [x - 8, y - 9],
          [x - 2, y - 13],
          [x + 7, y - 6],
        ],
        '#e8e7d1',
        2,
      );
  } else if (resource === 'meat' || resource === 'cooked') {
    const cooked = resource === 'cooked';
    polygon(
      ctx,
      [
        [x - 22, y + 5],
        [x - 14, y - 9],
        [x + 4, y - 14],
        [x + 19, y - 4],
        [x + 21, y + 7],
        [x + 5, y + 13],
      ],
      cooked ? '#936445' : '#b96f60',
    );
    polygon(
      ctx,
      [
        [x - 17, y + 3],
        [x - 11, y - 5],
        [x + 2, y - 10],
        [x + 14, y - 3],
        [x + 14, y + 5],
        [x + 3, y + 8],
      ],
      cooked ? '#b58254' : '#d4937d',
    );
    oval(ctx, x + 5, y, 6, 5, '#f0dfb7');
    oval(ctx, x + 5, y, 2.3, 2, cooked ? '#97694c' : '#b47766');
    line(
      ctx,
      [
        [x - 13, y + 2],
        [x - 6, y - 1],
        [x - 5, y - 5],
      ],
      '#edc1a2',
      1.5,
    );
    if (cooked)
      for (let i = 0; i < 3; i++)
        line(
          ctx,
          [
            [x - 13 + i * 6, y - 6],
            [x - 8 + i * 6, y + 5],
          ],
          '#73563d',
          1.5,
        );
  } else if (resource === 'food') {
    polygon(
      ctx,
      [
        [x - 23, y + 3],
        [x - 12, y - 9],
        [x + 21, y + 1],
        [x + 9, y + 10],
        [x - 9, y + 11],
      ],
      '#6d8656',
    );
    line(
      ctx,
      [
        [x - 18, y + 4],
        [x + 17, y + 3],
      ],
      '#a6b778',
      1,
    );
    for (const [dx, dy] of [
      [-12, 0],
      [-3, -6],
      [7, -2],
      [12, 4],
      [1, 5],
      [-8, 6],
    ]) {
      oval(ctx, x + dx, y + dy, 5, 4.7, '#a4524e');
      oval(ctx, x + dx - 1, y + dy - 1, 1.4, 1.2, '#d99c80');
      line(
        ctx,
        [
          [x + dx, y + dy - 4],
          [x + dx + 1, y + dy - 7],
        ],
        '#566845',
        1.2,
      );
    }
  } else if (resource === 'pelt') {
    polygon(
      ctx,
      [
        [x - 20, y - 7],
        [x - 12, y - 11],
        [x - 6, y - 7],
        [x + 10, y - 12],
        [x + 18, y - 6],
        [x + 14, y],
        [x + 20, y + 8],
        [x + 9, y + 11],
        [x + 2, y + 7],
        [x - 12, y + 12],
        [x - 19, y + 5],
      ],
      '#aa875b',
    );
    polygon(
      ctx,
      [
        [x - 15, y - 5],
        [x + 9, y - 8],
        [x + 12, y + 5],
        [x - 10, y + 8],
      ],
      '#ccb083',
    );
    line(
      ctx,
      [
        [x - 13, y + 5],
        [x + 11, y + 1],
      ],
      '#8c6a48',
      1.5,
    );
  } else if (resource === 'seed') {
    oval(ctx, x, y + 1, 15, 11, '#bba474');
    polygon(
      ctx,
      [
        [x - 10, y - 5],
        [x - 6, y - 15],
        [x + 7, y - 15],
        [x + 11, y - 5],
      ],
      '#d1be8a',
    );
    line(
      ctx,
      [
        [x - 9, y - 8],
        [x + 9, y - 8],
      ],
      '#7c704d',
      2,
    );
    for (let i = 0; i < 5; i++) oval(ctx, x + 19 + (i % 2) * 4, y + 2 - i * 3, 2.3, 1.3, '#b7a16a');
  } else if (resource === 'ingot') {
    for (const [dx, dy] of [
      [-11, 4],
      [10, 4],
      [0, -7],
    ]) {
      polygon(
        ctx,
        [
          [x + dx - 12, y + dy + 4],
          [x + dx - 8, y + dy - 4],
          [x + dx + 10, y + dy - 6],
          [x + dx + 13, y + dy + 2],
        ],
        '#7d8b80',
      );
      line(
        ctx,
        [
          [x + dx - 7, y + dy - 3],
          [x + dx + 9, y + dy - 5],
        ],
        '#c2c7ad',
        2,
      );
    }
  } else if (resource === 'pottery') {
    oval(ctx, x + 10, y + 4, 12, 9, '#a16a4b');
    oval(ctx, x - 7, y, 12, 12, '#bd895e');
    oval(ctx, x - 7, y - 8, 8, 3, '#744f3b');
    line(
      ctx,
      [
        [x - 16, y - 2],
        [x - 14, y + 5],
      ],
      '#d9b380',
      2,
    );
  } else if (resource === 'coin') {
    for (const [dx, dy] of [
      [-10, 5],
      [6, 7],
      [0, -1],
      [13, -2],
    ]) {
      oval(ctx, x + dx, y + dy, 8, 4.5, '#9b7c3c');
      oval(ctx, x + dx, y + dy - 2, 8, 4.5, '#d0b364');
      line(
        ctx,
        [
          [x + dx - 3, y + dy - 2],
          [x + dx + 3, y + dy - 2],
        ],
        '#f0db9c',
        1.4,
      );
    }
  } else if (resource === 'spear' || resource === 'metalArms') {
    for (const [dx, dy] of [
      [-6, 4],
      [5, -2],
    ]) {
      line(
        ctx,
        [
          [x + dx - 16, y + dy + 11],
          [x + dx + 12, y + dy - 11],
        ],
        '#8a6946',
        3,
      );
      polygon(
        ctx,
        [
          [x + dx + 8, y + dy - 13],
          [x + dx + 22, y + dy - 18],
          [x + dx + 15, y + dy - 5],
        ],
        resource === 'metalArms' ? '#a6b4a5' : '#a2a69b',
      );
    }
  } else {
    polygon(
      ctx,
      [
        [x - 18, y + 5],
        [x - 12, y - 9],
        [x + 6, y - 15],
        [x + 19, y - 3],
        [x + 10, y + 10],
        [x - 4, y + 12],
      ],
      '#78877c',
    );
    polygon(
      ctx,
      [
        [x - 12, y - 6],
        [x + 5, y - 11],
        [x + 15, y - 2],
        [x + 5, y + 4],
      ],
      '#bac2af',
    );
    line(
      ctx,
      [
        [x - 6, y + 8],
        [x + 2, y - 5],
        [x + 13, y - 2],
      ],
      '#dce0c7',
      1.2,
    );
  }
}

function drawGroundPile(ctx: CanvasRenderingContext2D, state: GameState, pile: GroundPile) {
  const p = worldPoint(pile.x, pile.y);
  oval(ctx, p.x + 2, p.y + 5, 29, 12, '#394a302b');
  oval(ctx, p.x, p.y + 2, 27, 10, '#d1bd8b55');
  drawMaterial(ctx, pile.resource, p.x, p.y, resourceKnown(state, pile.resource));
}

function tree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  variant = 0,
  snow = false,
  unknown = false,
) {
  const palette = unknown
    ? ['#777d79', '#949b96', '#b8beb7']
    : snow
      ? ['#657b69', '#849684', '#a5b4a1']
      : ['#405e49', '#587553', '#7d925e'];
  oval(ctx, x + size * 0.26, y + 2, size * 0.62, size * 0.19, '#37492d22');
  ctx.fillStyle = unknown ? '#7a7b71' : '#6e6850';
  ctx.fillRect(x - size * 0.07, y - size * 0.7, size * 0.14, size * 0.78);
  if (variant % 3 === 0) {
    polygon(
      ctx,
      [
        [x, y - size * 1.9],
        [x - size * 0.58, y - size * 0.7],
        [x + size * 0.58, y - size * 0.7],
      ],
      palette[0],
    );
    polygon(
      ctx,
      [
        [x - size * 0.06, y - size * 1.64],
        [x - size * 0.72, y - size * 0.25],
        [x + size * 0.62, y - size * 0.25],
      ],
      palette[1],
    );
    polygon(
      ctx,
      [
        [x - size * 0.08, y - size * 1.64],
        [x - size * 0.72, y - size * 0.25],
        [x - size * 0.08, y - size * 0.35],
      ],
      palette[2],
    );
    if (snow)
      line(
        ctx,
        [
          [x - size * 0.45, y - size * 0.74],
          [x - size * 0.07, y - size * 1.5],
        ],
        '#dfe8db',
        size * 0.13,
      );
  } else {
    oval(ctx, x - size * 0.26, y - size * 0.9, size * 0.56, size * 0.54, palette[0]);
    oval(ctx, x + size * 0.29, y - size * 1.07, size * 0.57, size * 0.58, palette[1]);
    oval(ctx, x - size * 0.12, y - size * 1.32, size * 0.57, size * 0.58, palette[2]);
    oval(
      ctx,
      x - size * 0.25,
      y - size * 1.54,
      size * 0.28,
      size * 0.19,
      unknown ? '#ced1c7' : snow ? '#e2e7d7' : '#b0b97e',
    );
    line(
      ctx,
      [
        [x, y - size * 0.72],
        [x - size * 0.23, y - size * 1.02],
      ],
      unknown ? '#969d9388' : '#65714a88',
      0.8,
    );
  }
}

function rock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shade = 0,
  unknown = false,
) {
  oval(ctx, x + size * 0.12, y + 2, size * 0.86, size * 0.26, '#59634b20');
  polygon(
    ctx,
    [
      [x - size, y],
      [x - size * 0.75, y - size * 0.75],
      [x - size * 0.08, y - size * 1.12],
      [x + size * 0.72, y - size * 0.68],
      [x + size, y - size * 0.05],
      [x + size * 0.3, y + size * 0.24],
    ],
    unknown ? '#969c96' : shade ? '#939c8a' : '#8f9580',
  );
  polygon(
    ctx,
    [
      [x - size * 0.75, y - size * 0.75],
      [x - size * 0.08, y - size * 1.12],
      [x + size * 0.72, y - size * 0.68],
      [x + size * 0.06, y - size * 0.4],
    ],
    unknown ? '#bdc1b9' : '#bcc1a6',
  );
  polygon(
    ctx,
    [
      [x + size * 0.06, y - size * 0.4],
      [x + size * 0.72, y - size * 0.68],
      [x + size, y - size * 0.05],
      [x + size * 0.3, y + size * 0.24],
    ],
    unknown ? '#777f78' : '#747f70',
  );
  line(
    ctx,
    [
      [x - size * 0.6, y - size * 0.3],
      [x - size * 0.18, y - size * 0.62],
      [x + size * 0.06, y - size * 0.4],
    ],
    unknown ? '#d4d7cd' : '#d1d1b9',
    0.8,
  );
}

function riverPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(1000, -80);
  ctx.bezierCurveTo(870, 100, 1060, 140, 980, 255);
  ctx.bezierCurveTo(920, 340, 820, 297, 850, 412);
  ctx.bezierCurveTo(875, 502, 750, 510, 780, 598);
  ctx.bezierCurveTo(810, 698, 660, 726, 610, 880);
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rotation = 0,
  size = 13,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `italic ${size}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6572518c';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function createTerrain(seed: number, seasonIndex: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH * 3;
  canvas.height = MAP_HEIGHT * 3;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(3, 3);
  const random = seededRandom(seed || 42);
  const winter = seasonIndex % 4 === 3;
  const autumn = seasonIndex % 4 === 2;
  ctx.fillStyle = winter ? '#d4dbc4' : autumn ? '#c7cc9c' : '#cbd2a3';
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // Broad translucent washes give the terrain the uneven surface of a painted atlas.
  for (let i = 0; i < 120; i++) {
    const x = random() * MAP_WIDTH,
      y = random() * MAP_HEIGHT;
    const color = winter
      ? ['#e5e6d2', '#c7d2ba', '#bac8ac', '#f1edda']
      : ['#e2d9ab', '#b5c394', '#b0c29a', '#dad6a3', '#d7d5a5'];
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, 60 + random() * 120);
    gradient.addColorStop(0, color[i % color.length] + 'bb');
    gradient.addColorStop(1, color[i % color.length] + '00');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 200, y - 200, 400, 400);
  }

  // A dry, sunlit clearing in which the tribe begins.
  const clearing = ctx.createRadialGradient(588, 422, 25, 588, 422, 265);
  clearing.addColorStop(0, winter ? '#ece8d3' : '#e7dfb3');
  clearing.addColorStop(0.6, winter ? '#e0dfc5cc' : '#ddd6a8bb');
  clearing.addColorStop(1, '#e0d8a800');
  ctx.fillStyle = clearing;
  ctx.fillRect(270, 140, 640, 570);

  // Quiet contour lines on the uplands.
  ctx.save();
  ctx.strokeStyle = '#7c8b6221';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.ellipse(200, 100, 90 + i * 24, 35 + i * 13, -0.17, Math.PI * 0.12, Math.PI * 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(1110, 610, 60 + i * 20, 55 + i * 12, -0.25, Math.PI * 0.4, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();

  // River: sand banks, an outer dark edge, flat turquoise water, and fine currents.
  ctx.lineCap = 'round';
  riverPath(ctx);
  ctx.strokeStyle = '#c0b88c55';
  ctx.lineWidth = 52;
  ctx.stroke();
  riverPath(ctx);
  ctx.strokeStyle = '#e5ddb2';
  ctx.lineWidth = 43;
  ctx.stroke();
  riverPath(ctx);
  ctx.strokeStyle = winter ? '#9ebeb1' : '#88b5a2';
  ctx.lineWidth = 27;
  ctx.stroke();
  riverPath(ctx);
  ctx.strokeStyle = winter ? '#b9d2c4' : '#add0b8';
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.save();
  ctx.translate(-4, -1);
  riverPath(ctx);
  ctx.strokeStyle = '#dde5c777';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 85; i++) {
    const y = random() * 800;
    const x =
      y < 250
        ? 980 + Math.sin(y / 75) * 26
        : y < 450
          ? 885 - Math.sin((y - 250) / 100) * 47
          : 850 - (y - 450) * 0.55;
    line(
      ctx,
      [
        [x - 4, y],
        [x + 6, y - 1],
      ],
      '#e1ecd099',
      0.7,
    );
  }

  // Walked paths are marks in the soil, not roads yet.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#b4ab7d20';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(590, 420);
  ctx.bezierCurveTo(525, 413, 480, 385, 425, 354);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(590, 420);
  ctx.bezierCurveTo(640, 415, 672, 370, 700, 325);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(590, 420);
  ctx.bezierCurveTo(551, 453, 530, 492, 484, 535);
  ctx.stroke();
  ctx.restore();

  // Grain and small grass strokes are baked once so the moving world stays cheap.
  for (let i = 0; i < 12000; i++) {
    const x = random() * MAP_WIDTH,
      y = random() * MAP_HEIGHT;
    ctx.fillStyle = random() > 0.5 ? '#758b4921' : '#fff6cb33';
    ctx.fillRect(x, y, 0.2 + random() * 0.5, 0.2 + random() * 0.3);
  }
  for (let i = 0; i < 650; i++) {
    const x = random() * MAP_WIDTH,
      y = random() * MAP_HEIGHT;
    ctx.strokeStyle = winter ? '#a4b39266' : '#8b9f6266';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 1.5, y - 3.5);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1.5, y - 2);
    ctx.stroke();
    if (i % 9 === 0) oval(ctx, x, y - 3, 1.2, 1, autumn ? '#bb916c' : '#efe8b0');
  }

  // Scenery stays visibly smaller than resource entities: every full tree or rock on the
  // map is a real, selectable simulation node rather than a decorative false target.
  for (let i = 0; i < 350; i++) {
    const x = random() * MAP_WIDTH,
      y = random() * MAP_HEIGHT;
    oval(ctx, x, y, 0.5 + random() * 1.8, 0.3 + random() * 0.8, winter ? '#a8b59d30' : '#899e6530');
  }
  for (let i = 0; i < 80; i++) {
    const x = random() * MAP_WIDTH,
      y = random() * MAP_HEIGHT;
    rock(ctx, x, y, 0.7 + random() * 1.1);
  }

  label(ctx, 'I L   B O S C O   D E L L E   O R I G I N I', 206, 290, -0.12, 11);
  label(ctx, 'Le alte pietre', 1064, 710, -0.13, 13);
  label(ctx, 'Il fiume delle nebbie', 920, 500, -0.8, 13);
  label(ctx, 'Terre ancora senza nome', 635, 102, 0, 13);
  return canvas;
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: GameState['entities'][number],
  time: number,
  seasonIndex: number,
  selected: boolean,
  unknown = false,
) {
  const { x, y } = worldPoint(entity.x, entity.y);
  const idNumber = Array.from(entity.id).reduce((n, c) => n + c.charCodeAt(0), 0);
  const winter = seasonIndex % 4 === 3;
  if (entity.kind === 'tree') {
    if (entity.amount <= 0) {
      polygon(
        ctx,
        [
          [x - 9, y + 3],
          [x - 8, y - 9],
          [x + 8, y - 9],
          [x + 10, y + 3],
        ],
        unknown ? '#858b80' : '#87664a',
      );
      oval(ctx, x, y - 9, 8, 4, unknown ? '#b0b4a6' : '#d8bc86');
      line(
        ctx,
        [
          [x - 10, y + 3],
          [x - 15, y + 6],
        ],
        '#73775a',
        2,
      );
      line(
        ctx,
        [
          [x + 7, y + 2],
          [x + 14, y + 5],
        ],
        '#73775a',
        2,
      );
    } else {
      tree(ctx, x, y, 26, idNumber, winter, unknown);
      if (entity.maxAmount && entity.amount < entity.maxAmount)
        line(
          ctx,
          [
            [x - 2, y - 10],
            [x + 2, y - 7],
            [x - 2, y - 4],
          ],
          unknown ? '#b0b4a6' : '#d8bc86',
          2,
        );
    }
  } else if (entity.kind === 'berries') {
    oval(ctx, x + 4, y + 3, 17, 5, '#59694425');
    oval(ctx, x - 7, y - 5, 12, 8, winter ? '#8d9c77' : '#697b49');
    oval(ctx, x + 7, y - 8, 12, 10, winter ? '#9fa98a' : '#809158');
    oval(ctx, x - 1, y - 12, 10, 8, winter ? '#aab397' : '#9ca168');
    if (entity.amount > 0 && !winter) {
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4 + idNumber;
        oval(
          ctx,
          x + Math.cos(a) * 11,
          y - 9 + Math.sin(a) * 7,
          1.9,
          1.8,
          winter ? '#9c6d67' : '#a76454',
        );
      }
    }
  } else if (entity.kind === 'stone') {
    if (entity.amount <= 0) {
      rock(ctx, x - 5, y + 2, 6, 1, unknown);
      rock(ctx, x + 7, y + 3, 4, 0, unknown);
      return;
    }
    // Embedded bedrock is a continuous slab; extracted stone is a loose pile.
    oval(ctx, x + 2, y + 8, 31, 9, '#59644e29');
    polygon(
      ctx,
      [
        [x - 28, y + 8],
        [x - 23, y - 5],
        [x - 10, y - 10],
        [x + 2, y - 19],
        [x + 24, y - 8],
        [x + 28, y + 6],
        [x + 16, y + 12],
      ],
      unknown ? '#858b85' : '#879487',
    );
    polygon(
      ctx,
      [
        [x - 23, y - 5],
        [x - 10, y - 10],
        [x + 2, y - 19],
        [x + 24, y - 8],
        [x + 5, y - 3],
        [x - 4, y + 4],
      ],
      unknown ? '#afb4aa' : '#b9c0ac',
    );
    polygon(
      ctx,
      [
        [x + 5, y - 3],
        [x + 24, y - 8],
        [x + 28, y + 6],
        [x + 16, y + 12],
      ],
      unknown ? '#949c93' : '#99a690',
    );
    // The pale continuous seam separates this deposit from loose fragments.
    line(
      ctx,
      [
        [x - 20, y + 2],
        [x - 3, y - 6],
        [x + 1, y - 13],
        [x + 17, y - 5],
      ],
      '#e9e2c0',
      1.5,
    );
  } else if (
    entity.kind === 'deer' ||
    entity.kind === 'wolf' ||
    entity.kind === 'alpha' ||
    entity.kind === 'mammoth'
  ) {
    if (entity.hp <= 0) {
      ctx.save();
      ctx.translate(x, y);
      const size = entity.kind === 'mammoth' ? 1.7 : entity.kind === 'alpha' ? 1.2 : 1;
      ctx.scale(size, size);
      oval(ctx, 1, 5, 25, 8, '#3547302b');
      oval(ctx, -2, 0, 18, 8, '#977c5b');
      oval(ctx, -5, -2, 13, 6, '#b3976f');
      line(
        ctx,
        [
          [-12, 2],
          [-19, 10],
          [-23, 10],
        ],
        '#6d604a',
        2.5,
      );
      line(
        ctx,
        [
          [3, 3],
          [9, 11],
          [13, 10],
        ],
        '#6d604a',
        2.5,
      );
      oval(ctx, 17, -2, 8, 4.5, '#aa8e65');
      line(
        ctx,
        [
          [18, -3],
          [21, -2],
        ],
        '#504d3e',
        1.3,
      );
      polygon(
        ctx,
        [
          [12, -5],
          [10, -11],
          [16, -6],
        ],
        '#76664d',
      );
      if (entity.kind === 'deer') {
        line(
          ctx,
          [
            [12, -6],
            [9, -13],
            [5, -15],
          ],
          '#786c50',
          1.5,
        );
        line(
          ctx,
          [
            [9, -11],
            [13, -15],
          ],
          '#786c50',
          1.3,
        );
      }
      // A resting silhouette and exposed pale ribs distinguish a carcass from live fauna.
      line(
        ctx,
        [
          [-7, -4],
          [-7, 4],
        ],
        '#d6c7a0',
        1.6,
      );
      line(
        ctx,
        [
          [-2, -5],
          [-2, 4],
        ],
        '#d6c7a0',
        1.6,
      );
      line(
        ctx,
        [
          [3, -4],
          [3, 3],
        ],
        '#d6c7a0',
        1.6,
      );
      ctx.restore();
      return;
    }
    const bob = Math.sin(time * 1.6 + idNumber) * 0.6;
    const mammoth = entity.kind === 'mammoth';
    const wolf = entity.kind === 'wolf' || entity.kind === 'alpha';
    const scale = mammoth ? 2 : entity.kind === 'alpha' ? 1.5 : 1;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(scale, scale);
    oval(ctx, 1, 3, 13, 4, '#35473025');
    const coat = mammoth ? '#786c54' : wolf ? '#768176' : '#ac8b60';
    const dark = mammoth ? '#5d5747' : wolf ? '#535f57' : '#806c4f';
    line(
      ctx,
      [
        [-7, -4],
        [-7, 6],
        [-9, 8],
      ],
      dark,
      2.1,
    );
    line(
      ctx,
      [
        [5, -3],
        [6, 7],
        [8, 8],
      ],
      dark,
      2.1,
    );
    oval(ctx, -1, -6, 11, mammoth ? 8 : 5, coat);
    if (mammoth) {
      oval(ctx, 10, -8, 7, 8, coat);
      ctx.strokeStyle = dark;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(14, -8);
      ctx.bezierCurveTo(20, -2, 13, 10, 20, 8);
      ctx.stroke();
      ctx.strokeStyle = '#e6dfc2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, -5);
      ctx.quadraticCurveTo(22, 3, 23, -3);
      ctx.stroke();
      oval(ctx, 7, -10, 5, 6, dark);
    } else {
      line(
        ctx,
        [
          [7, -6],
          [11, -15],
        ],
        coat,
        4,
      );
      oval(ctx, 12, -15, 5.5, 3.7, coat);
      polygon(
        ctx,
        [
          [8, -17],
          [8, -23],
          [12, -18],
        ],
        dark,
      );
      if (wolf)
        polygon(
          ctx,
          [
            [11, -17],
            [14, -23],
            [16, -16],
          ],
          dark,
        );
      else {
        line(
          ctx,
          [
            [10, -18],
            [8, -26],
            [5, -28],
          ],
          dark,
          1.2,
        );
        line(
          ctx,
          [
            [8, -23],
            [12, -27],
          ],
          dark,
          1,
        );
      }
      line(
        ctx,
        [
          [-10, -7],
          [-15, wolf ? -12 : -9],
        ],
        coat,
        wolf ? 3 : 2,
      );
      oval(ctx, 15, -15, 0.9, 0.9, '#2f3c33');
      if (!wolf) oval(ctx, -7, -7, 3, 2, '#d4be8f');
    }
    ctx.restore();
  } else if (entity.kind === 'corpse') {
    oval(ctx, x, y, 9, 3, '#796b5b');
    line(
      ctx,
      [
        [x - 7, y - 3],
        [x + 8, y + 3],
      ],
      '#ddcfaa',
      2,
    );
    line(
      ctx,
      [
        [x - 6, y + 3],
        [x + 7, y - 4],
      ],
      '#ddcfaa',
      2,
    );
  }
  if (selected && entity.hp !== undefined && entity.maxHp && entity.hp < entity.maxHp) {
    const ratio = Math.max(0, entity.hp / entity.maxHp);
    ctx.fillStyle = '#334a3b33';
    ctx.fillRect(x - 15, y + 18, 30, 3);
    ctx.fillStyle = '#b4805a';
    ctx.fillRect(x - 15, y + 18, 30 * ratio, 3);
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: GameState['buildings'][number],
  time: number,
) {
  const { x, y } = worldPoint(building.x, building.y);
  if (building.kind === 'campfire') {
    const flicker = Math.sin(time * 9) * 2;
    oval(ctx, x, y + 3, 21, 10, '#8b6f4033');
    for (let i = 0; i < 8; i++)
      rock(ctx, x + Math.cos((i * Math.PI) / 4) * 17, y + Math.sin((i * Math.PI) / 4) * 9, 3.6);
    line(
      ctx,
      [
        [x - 10, y - 2],
        [x + 9, y + 2],
      ],
      '#73573d',
      4,
    );
    line(
      ctx,
      [
        [x - 8, y + 3],
        [x + 8, y - 3],
      ],
      '#a08255',
      4,
    );
    if (building.active) {
      const glow = ctx.createRadialGradient(x, y - 5, 1, x, y - 5, 40);
      glow.addColorStop(0, '#efc17444');
      glow.addColorStop(1, '#efc17400');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 40, y - 45, 80, 80);
      ctx.fillStyle = '#ce8243';
      ctx.beginPath();
      ctx.moveTo(x - 9, y);
      ctx.quadraticCurveTo(x - 15, y - 13, x - 1, y - 28 - flicker);
      ctx.quadraticCurveTo(x + 3, y - 17, x + 8, y - 22);
      ctx.quadraticCurveTo(x + 17, y - 3, x + 7, y);
      ctx.fill();
      ctx.fillStyle = '#f3d383';
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.quadraticCurveTo(x - 6, y - 8, x + 1, y - 17 + flicker);
      ctx.quadraticCurveTo(x + 9, y - 3, x + 4, y);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const p = (time * 0.18 + i * 0.2) % 1;
        oval(
          ctx,
          x + Math.sin(time + i) * p * 13,
          y - 22 - p * 70,
          2 + p * 10,
          2 + p * 5,
          `rgba(119,122,104,${(1 - p) * 0.14})`,
        );
      }
    } else {
      // Cenere grigia fredda nel focolare spento
      oval(ctx, x, y, 14, 7, 'rgba(48, 42, 32, 0.45)');
      oval(ctx, x, y - 1, 9, 4, 'rgba(35, 30, 22, 0.55)');
    }
  } else if (building.kind === 'hut' || building.kind === 'house') {
    const stoneHouse = building.kind === 'house';
    oval(ctx, x + 5, y + 3, 28, 9, '#37472f22');
    polygon(
      ctx,
      [
        [x - 23, y],
        [x - 23, y - 25],
        [x + 14, y - 25],
        [x + 22, y],
        [x, y + 9],
      ],
      stoneHouse ? '#b5ad8b' : '#9e8d62',
    );
    polygon(
      ctx,
      [
        [x - 28, y - 21],
        [x - 2, y - 52],
        [x + 27, y - 20],
        [x + 3, y - 8],
      ],
      stoneHouse ? '#a08b66' : '#b7a36b',
    );
    polygon(
      ctx,
      [
        [x - 2, y - 52],
        [x + 27, y - 20],
        [x + 3, y - 8],
      ],
      '#8c805b',
    );
    for (let i = 0; i < 7; i++)
      line(
        ctx,
        [
          [x - 2 - i * 2.6, y - 48 + i * 3.2],
          [x + 17 - i * 2.6, y - 23 + i * 2],
        ],
        '#d8c38c77',
        0.9,
      );
    polygon(
      ctx,
      [
        [x - 8, y + 4],
        [x - 8, y - 13],
        [x + 2, y - 14],
        [x + 2, y + 6],
      ],
      '#4c5140',
    );
  } else if (building.kind === 'menhir' || building.kind === 'grave') {
    oval(ctx, x, y + 2, 21, 7, '#364b3022');
    if (building.kind === 'grave') {
      oval(ctx, x, y - 2, 23, 11, '#aaa783');
      rock(ctx, x, y - 9, 13);
    } else {
      polygon(
        ctx,
        [
          [x - 13, y + 2],
          [x - 10, y - 37],
          [x - 4, y - 48],
          [x + 7, y - 45],
          [x + 14, y - 29],
          [x + 11, y + 3],
        ],
        '#8a9680',
      );
      polygon(
        ctx,
        [
          [x - 4, y - 48],
          [x + 7, y - 45],
          [x + 14, y - 29],
          [x + 11, y + 3],
          [x + 2, y],
        ],
        '#6d7d6c',
      );
      line(
        ctx,
        [
          [x - 5, y - 30],
          [x, y - 36],
          [x + 4, y - 29],
          [x - 1, y - 24],
          [x + 3, y - 18],
        ],
        '#d4cca7',
        1.8,
      );
    }
  } else if (building.kind === 'stele') {
    oval(ctx, x, y + 2, 19, 7, '#364b3022');
    polygon(
      ctx,
      [
        [x - 12, y + 2],
        [x - 13, y - 39],
        [x - 5, y - 45],
        [x + 10, y - 40],
        [x + 13, y + 2],
      ],
      '#a7ac95',
    );
    polygon(
      ctx,
      [
        [x + 7, y - 41],
        [x + 13, y - 36],
        [x + 13, y + 2],
        [x + 7, y],
      ],
      '#788975',
    );
    for (let i = 0; i < 5; i++)
      line(
        ctx,
        [
          [x - 7, y - 32 + i * 6],
          [x + 5, y - 31 + i * 6],
        ],
        '#63765e',
        1.4,
      );
  } else if (building.kind === 'farm') {
    polygon(
      ctx,
      [
        [x - 37, y - 11],
        [x + 7, y - 29],
        [x + 39, y + 3],
        [x - 7, y + 23],
      ],
      '#8e8056',
    );
    for (let i = 0; i < 7; i++) {
      line(
        ctx,
        [
          [x - 30 + i * 6, y - 7 - i * 2.5],
          [x - 4 + i * 6, y + 17 - i * 2.5],
        ],
        '#b3aa70',
        2,
      );
      for (let j = 0; j < 5; j++) {
        const px = x - 26 + i * 6 + j * 5,
          py = y - 6 - i * 2.5 + j * 5;
        line(
          ctx,
          [
            [px - 2, py - 3],
            [px, py],
            [px + 2, py - 4],
          ],
          '#a4b071',
          1.5,
        );
      }
    }
  } else if (building.kind === 'pen') {
    oval(ctx, x, y + 1, 33, 17, '#b3ad7d44');
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6,
        px = x + Math.cos(a) * 32,
        py = y + Math.sin(a) * 16;
      line(
        ctx,
        [
          [px, py],
          [px, py - 16],
        ],
        '#827651',
        2,
      );
    }
    ctx.strokeStyle = '#8b805a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 32, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < Math.min(3, building.livestock ?? 2); i++) {
      const px = x - 10 + i * 11,
        py = y + (i % 2) * 7 - 7;
      oval(ctx, px, py, 8, 4.5, '#b7ab87');
      oval(ctx, px + 7, py - 3, 3, 3, '#8b8268');
      line(
        ctx,
        [
          [px - 3, py + 2],
          [px - 3, py + 7],
        ],
        '#7d765b',
        1.5,
      );
      line(
        ctx,
        [
          [px + 3, py + 2],
          [px + 3, py + 7],
        ],
        '#7d765b',
        1.5,
      );
    }
  } else if (building.kind === 'foundry') {
    oval(ctx, x + 2, y + 3, 30, 10, '#37472f22');
    polygon(
      ctx,
      [
        [x - 24, y],
        [x - 23, y - 29],
        [x - 12, y - 42],
        [x + 13, y - 40],
        [x + 23, y - 25],
        [x + 23, y],
      ],
      '#a49a7c',
    );
    polygon(
      ctx,
      [
        [x - 13, y + 1],
        [x - 13, y - 15],
        [x - 5, y - 22],
        [x + 5, y - 20],
        [x + 11, y - 13],
        [x + 11, y + 1],
      ],
      '#4f5548',
    );
    ctx.fillStyle = '#827d66';
    ctx.fillRect(x + 7, y - 59, 11, 28);
    if (building.active) {
      oval(ctx, x - 1, y - 6, 8, 5, '#c18b44');
      polygon(
        ctx,
        [
          [x - 7, y - 4],
          [x, y - 18],
          [x + 6, y - 3],
        ],
        '#e9b95e',
      );
      for (let i = 0; i < 3; i++)
        oval(
          ctx,
          x + 13 + Math.sin(time + i) * 4,
          y - 66 - i * 10,
          5 + i * 2,
          4 + i * 2,
          '#6e786b33',
        );
    }
    line(
      ctx,
      [
        [x - 20, y - 24],
        [x - 13, y - 23],
      ],
      '#d1c5a2',
      1.2,
    );
  } else if (building.kind === 'walls') {
    oval(ctx, x, y, 35, 18, '#a7aa8c33');
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI,
        px = x - Math.cos(a) * 35,
        py = y + Math.sin(a) * 13;
      polygon(
        ctx,
        [
          [px - 4, py],
          [px - 4, py - 22],
          [px + 4, py - 22],
          [px + 4, py],
        ],
        i % 2 ? '#a2aa91' : '#909d85',
      );
    }
    for (const dx of [-34, 34]) {
      ctx.fillStyle = '#aeb39b';
      ctx.fillRect(x + dx - 6, y - 32, 13, 33);
      for (let i = 0; i < 3; i++) ctx.fillRect(x + dx - 6 + i * 5, y - 36, 3, 7);
    }
    polygon(
      ctx,
      [
        [x - 5, y + 11],
        [x - 5, y - 5],
        [x + 5, y - 5],
        [x + 5, y + 11],
      ],
      '#687b64',
    );
  } else if (['temple', 'palace', 'court', 'archive', 'school'].includes(building.kind)) {
    const palace = building.kind === 'palace',
      temple = building.kind === 'temple',
      school = building.kind === 'school';
    oval(ctx, x + 2, y + 5, 38, 11, '#37472f22');
    polygon(
      ctx,
      [
        [x - 32, y + 2],
        [x - 32, y - 26],
        [x + 28, y - 26],
        [x + 28, y + 2],
      ],
      '#b5b093',
    );
    polygon(
      ctx,
      [
        [x - 37, y - 26],
        [x - 4, y - 48],
        [x + 34, y - 26],
      ],
      palace ? '#9b8066' : '#aaa185',
    );
    if (palace || temple || building.kind === 'court') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#ded5b4';
        ctx.fillRect(x - 24 + i * 14, y - 26, 5, 26);
        ctx.fillStyle = '#8d967c';
        ctx.fillRect(x - 25 + i * 14, y - 1, 7, 4);
      }
      line(
        ctx,
        [
          [x - 36, y + 6],
          [x + 33, y + 6],
        ],
        '#8c967d',
        5,
      );
      line(
        ctx,
        [
          [x - 39, y + 10],
          [x + 36, y + 10],
        ],
        '#aeb295',
        4,
      );
    } else {
      for (let i = 0; i < 4; i++) {
        polygon(
          ctx,
          [
            [x - 25 + i * 13, y - 5],
            [x - 25 + i * 13, y - 17],
            [x - 18 + i * 13, y - 17],
            [x - 18 + i * 13, y - 5],
          ],
          '#73836c',
        );
      }
      polygon(
        ctx,
        [
          [x - 4, y + 1],
          [x - 4, y - 18],
          [x + 4, y - 18],
          [x + 4, y + 1],
        ],
        '#5c6d59',
      );
    }
    if (palace) {
      line(
        ctx,
        [
          [x + 21, y - 37],
          [x + 21, y - 67],
        ],
        '#6d775c',
        2,
      );
      polygon(
        ctx,
        [
          [x + 21, y - 67],
          [x + 40, y - 61],
          [x + 21, y - 54],
        ],
        '#9d8150',
      );
    }
    if (temple) {
      ctx.strokeStyle = '#c8b67e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - 3, y - 35, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (building.kind === 'court') {
      line(
        ctx,
        [
          [x - 4, y - 43],
          [x - 4, y - 30],
          [x - 12, y - 39],
          [x + 5, y - 39],
        ],
        '#6c7c63',
        1.6,
      );
    }
    if (building.kind === 'archive') {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? '#a18d6a' : '#c4b48e';
        ctx.fillRect(x - 18 + i * 6, y - 30, 4, 8);
      }
    }
    if (school) {
      line(
        ctx,
        [
          [x - 9, y - 36],
          [x - 3, y - 33],
          [x + 4, y - 36],
        ],
        '#e2d4ad',
        2,
      );
      line(
        ctx,
        [
          [x - 3, y - 33],
          [x - 3, y - 28],
        ],
        '#e2d4ad',
        1.5,
      );
    }
  } else if (building.kind === 'market') {
    oval(ctx, x + 2, y + 4, 32, 10, '#37472f22');
    ctx.fillStyle = '#8d815f';
    ctx.fillRect(x - 24, y - 12, 46, 13);
    for (const dx of [-24, 22])
      line(
        ctx,
        [
          [x + dx, y + 2],
          [x + dx, y - 34],
        ],
        '#746e4d',
        2,
      );
    for (let i = 0; i < 6; i++)
      polygon(
        ctx,
        [
          [x - 29 + i * 10, y - 31],
          [x - 19 + i * 10, y - 31],
          [x - 14 + i * 10, y - 17],
          [x - 24 + i * 10, y - 17],
        ],
        i % 2 ? '#d0bd8b' : '#9b8765',
      );
    for (let i = 0; i < 4; i++)
      oval(ctx, x - 15 + i * 10, y - 10, 4, 3, ['#ac976a', '#8e9a6e', '#b29d78', '#8a9367'][i]);
  } else if (building.kind === 'workshop') {
    oval(ctx, x + 2, y + 4, 32, 10, '#37472f22');
    polygon(
      ctx,
      [
        [x - 25, y],
        [x - 25, y - 27],
        [x + 15, y - 27],
        [x + 15, y],
      ],
      '#a19570',
    );
    polygon(
      ctx,
      [
        [x - 31, y - 27],
        [x - 8, y - 43],
        [x + 22, y - 27],
      ],
      '#8e8560',
    );
    const wx = x + 23,
      wy = y - 7;
    ctx.strokeStyle = '#7a7552';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wx, wy, 15, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + (building.active ? time * 0.2 : 0);
      line(
        ctx,
        [
          [wx, wy],
          [wx + Math.cos(a) * 15, wy + Math.sin(a) * 15],
        ],
        '#a08d61',
        2,
      );
    }
    oval(ctx, wx, wy, 3, 3, '#6d7355');
  } else if (building.kind === 'palisade') {
    for (let i = 0; i < 9; i++) {
      const px = x - 29 + i * 7,
        py = y + Math.sin(i * 0.4) * 5;
      polygon(
        ctx,
        [
          [px - 2, py],
          [px - 2, py - 24],
          [px, py - 30],
          [px + 3, py - 24],
          [px + 3, py],
        ],
        i % 2 ? '#9d9062' : '#857854',
      );
    }
    line(
      ctx,
      [
        [x - 30, y - 12],
        [x + 29, y - 9],
      ],
      '#75694d',
      2,
    );
  } else {
    oval(ctx, x, y + 1, 25, 10, '#514d2f33');
    if (building.kind === 'storage') {
      oval(ctx, x, y - 1, 20, 9, '#9e9470');
      oval(ctx, x, y - 3, 15, 6, '#665f47');
      polygon(
        ctx,
        [
          [x - 21, y - 5],
          [x - 6, y - 17],
          [x + 21, y - 6],
          [x + 4, y + 3],
        ],
        '#b5a471',
      );
      line(
        ctx,
        [
          [x - 13, y - 6],
          [x - 1, y - 12],
          [x + 13, y - 5],
        ],
        '#d0bf8d',
        1,
      );
    } else {
      for (let i = 0; i < 5; i++) {
        line(
          ctx,
          [
            [x - 16, y - i * 3],
            [x + 8, y - i * 3 - 3],
          ],
          '#988459',
          5,
        );
        rock(ctx, x + 15, y + 2 - i * 2, 4);
      }
      line(
        ctx,
        [
          [x - 23, y],
          [x - 23, y - 27],
          [x + 18, y - 27],
          [x + 22, y],
        ],
        '#706f4c',
        2,
      );
      polygon(
        ctx,
        [
          [x - 27, y - 28],
          [x - 8, y - 39],
          [x + 24, y - 29],
          [x + 7, y - 17],
        ],
        '#aba471',
      );
    }
  }
  if (!building.active) {
    oval(ctx, x + 20, y - 26, 5, 5, '#ae7f58');
    ctx.fillStyle = '#f8f0d9';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x + 20, y - 23);
  }
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: GameState['units'][number],
  time: number,
  selected: boolean,
  carryRecognized: boolean,
  custodian?: CustodianStatus,
  isGroupMember = false,
) {
  const { x, y } = worldPoint(unit.x, unit.y);
  const id = Array.from(unit.id).reduce((n, c) => n + c.charCodeAt(0), 0);
  const moving = /mov|walk|gather|hunt|carry|return|flee|going|and|raccog|port|esplor/i.test(
    unit.action,
  );
  const sleeping = /sleep|dorm/i.test(unit.action);
  const bob = moving ? Math.sin(time * 9 + id) * 0.7 : Math.sin(time * 2 + id) * 0.2;
  const colors = ['#987f51', '#637c6c', '#ad805a', '#8e8266', '#767d8a', '#b39b66', '#77804e'];
  const tunic = colors[id % colors.length];
  const skin = ['#c2a07a', '#b9946d', '#c5a780'][id % 3];
  ctx.save();
  ctx.translate(x, y + bob);
  if (isGroupMember) {
    const pulse = 0.42 + Math.sin(time * 3.5 + id) * 0.16;
    ctx.save();
    ctx.fillStyle = `rgba(217, 169, 78, ${pulse})`;
    ctx.strokeStyle = `rgba(189, 137, 47, ${pulse + 0.25})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(2, 3, 10.5, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  oval(ctx, 2, 3, 7, 2.7, '#39482d33');
  if (sleeping) {
    oval(ctx, 0, 0, 7, 3.3, tunic);
    oval(ctx, 6, -1, 2.7, 2.7, skin);
    ctx.font = 'italic 9px Georgia';
    ctx.fillStyle = '#6a775a';
    ctx.fillText('z', 7, -8);
  } else {
    const leg = moving ? Math.sin(time * 9 + id) * 3 : 0;
    line(
      ctx,
      [
        [-1, -3],
        [-2 - leg, 3],
        [-1 - leg, 4],
      ],
      '#5f5a45',
      2,
    );
    line(
      ctx,
      [
        [2, -3],
        [3 + leg, 3],
        [4 + leg, 4],
      ],
      '#776547',
      2,
    );
    polygon(
      ctx,
      [
        [-3, -13],
        [3, -13],
        [5, -3],
        [-4, -3],
      ],
      tunic,
    );
    line(
      ctx,
      [
        [-3, -11],
        [-6, -6 + leg * 0.3],
      ],
      skin,
      2,
    );
    line(
      ctx,
      [
        [3, -11],
        [6, -7 - leg * 0.3],
      ],
      skin,
      2,
    );
    oval(ctx, 0, -16, 3.6, 4, skin);
    oval(ctx, -0.3, -18.5, 3.8, 2.1, unit.age >= 14 ? '#9a9c84' : '#595943');
    if (/gather|colp|hunt|work|craft|estr|schegg/i.test(unit.action))
      line(
        ctx,
        [
          [6, -10],
          [10 + Math.sin(time * 6) * 3, -19],
        ],
        '#76674c',
        1.5,
      );
  }
  if (unit.carry && unit.carry.amount > 0 && !sleeping) {
    ctx.save();
    ctx.translate(8, -7);
    ctx.scale(0.38, 0.38);
    drawMaterial(ctx, unit.carry.resource, 0, 0, carryRecognized);
    ctx.restore();
  }
  if (unit.isolation && unit.isolation > 3 && unit.isolation < 30) {
    oval(ctx, -7, -22, 4.5, 4.5, '#5e755b');
    ctx.fillStyle = '#f8f1db';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', -7, -19.5);
  }
  if (unit.hp < 45 || unit.hunger > 80) {
    oval(ctx, 8, -22, 4.5, 4.5, unit.hp < 45 ? '#af7659' : '#bc9a50');
    ctx.fillStyle = '#f8f1db';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 8, -19.5);
  }
  if (custodian) {
    const color =
      custodian.risk === 'critical'
        ? '#ad5941'
        : custodian.risk === 'ageing'
          ? '#a87a32'
          : '#597a66';
    // A voice, separate from the diamond that opens a discovery puzzle.
    ctx.save();
    ctx.translate(-15, -28);
    if (custodian.risk !== 'safe') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.2 + (1 + Math.sin(time * 3)) * 0.15;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + Math.sin(time * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    oval(ctx, 0, 0, 7.5, 6.5, '#fff8e6');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    polygon(
      ctx,
      [
        [-4, 4],
        [-6, 9],
        [0, 6],
      ],
      color,
    );
    oval(ctx, -2.5, 0, 1.1, 1.1, color);
    line(
      ctx,
      [
        [0, -2.5],
        [2, 0],
        [0, 2.5],
      ],
      color,
      1.3,
    );
    line(
      ctx,
      [
        [2.5, -4],
        [5, 0],
        [2.5, 4],
      ],
      color,
      1.1,
    );
    ctx.restore();
  }
  if (selected) {
    ctx.font = '11px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#334d3c';
    ctx.fillText(unit.name, 0, -29);
  }
  ctx.restore();
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  ready = false,
  ghost = false,
) {
  const p = worldPoint(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = ready ? '#f7f0cf' : '#fff8de';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#3d503955';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.ellipse(0, 2, 22 + Math.sin(time * 2) * 0.7, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8c8955';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 2, 25, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!ghost) {
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      line(
        ctx,
        [
          [Math.cos(angle) * 28, Math.sin(angle) * 16 + 2],
          [Math.cos(angle) * 34, Math.sin(angle) * 20 + 2],
        ],
        '#425c43',
        1.5,
      );
    }
  }
  ctx.restore();
}

function drawCampground(ctx: CanvasRenderingContext2D, state: GameState) {
  if (state.urbanized || !state.home) return;
  const p = worldPoint(state.home.x, state.home.y);
  const isNight = state.time % 90 >= 60;

  ctx.save();

  // 1. Terra battuta soffusa (acquerello caldo organico) per il giaciglio comune
  // Raggio 10m esatto (regola matematica di simulazione per il sonno e la comprensione di "Qui")
  const rx = 10 * 2.4;
  const ry = 10 * 1.6;
  const clearing = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, rx);
  clearing.addColorStop(0, isNight ? 'rgba(54, 62, 42, 0.22)' : 'rgba(215, 204, 168, 0.38)');
  clearing.addColorStop(0.7, isNight ? 'rgba(54, 62, 42, 0.08)' : 'rgba(215, 204, 168, 0.16)');
  clearing.addColorStop(1, 'rgba(215, 204, 168, 0)');
  ctx.fillStyle = clearing;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Linea cartografica di confine del riposo (stile curva di livello Lingus, fine e discreta)
  ctx.strokeStyle = isNight ? 'rgba(185, 168, 120, 0.32)' : 'rgba(110, 125, 90, 0.32)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  terrain: HTMLCanvasElement,
  time: number,
  selected: WorldTarget | null,
  hovered: WorldTarget | null,
  commandReady: boolean,
  groupAnchor?: WorldTarget | null,
  isGroupActive = false,
  ping?: { x: number; y: number; time: number } | null,
  orderFeedback?: {
    from: { x: number; y: number }[];
    to: { x: number; y: number };
    time: number;
  } | null,
) {
  ctx.drawImage(terrain, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  drawCampground(ctx, state);
  const piles = getGroundPiles(state);
  const custodians = new Map(getCustodianStatuses(state).map((status) => [status.unitId, status]));
  const focused = hovered?.type === 'building' ? hovered : selected;
  const fire =
    focused?.type === 'building'
      ? state.buildings.find((b) => b.id === focused.id && b.kind === 'campfire')
      : undefined;
  if (fire?.active && fire.hp > 0 && isVisibleAt(state, fire.x, fire.y)) {
    const center = worldPoint(fire.x, fire.y);
    ctx.save();
    ctx.beginPath();
    // This range uses world metres; the flame sprite itself is deliberately small.
    ctx.ellipse(center.x, center.y, 15 * 2.4, 15 * 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d49b3912';
    ctx.fill();
    ctx.strokeStyle = '#aa792872';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1.5, 1.5]);
    ctx.stroke();
    ctx.restore();
  }
  const liveAnchor =
    groupAnchor && !state.urbanized
      ? groupAnchor.type === 'unit'
        ? (state.units.find((u) => u.id === groupAnchor.id && u.hp > 0) ?? groupAnchor)
        : groupAnchor
      : null;

  if (liveAnchor) {
    const p = worldPoint(liveAnchor.x, liveAnchor.y);
    ctx.save();
    if (isGroupActive) {
      const pulse = 0.5 + Math.sin(time * 3) * 0.15;
      ctx.strokeStyle = `rgba(217, 169, 78, ${pulse + 0.25})`;
      ctx.fillStyle = 'rgba(217, 169, 78, 0.07)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 2.5]);
    } else {
      ctx.strokeStyle = '#71885977';
      ctx.fillStyle = '#91aa6612';
      ctx.lineWidth = 0.45;
      ctx.setLineDash([1.4, 1.5]);
    }
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 15 * 2.4, 15 * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Animazione ad onda del gruppo (ping quando viene cliccato/spostato)
  if (ping && time - ping.time >= 0 && time - ping.time <= 1.0) {
    const progress = (time - ping.time) / 1.0;
    const r = progress * 15;
    const p = worldPoint(ping.x, ping.y);
    const alpha = (1 - progress) * 0.75;
    ctx.save();
    ctx.strokeStyle = `rgba(217, 169, 78, ${alpha})`;
    ctx.lineWidth = 1.3 * (1 - progress * 0.4);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 2.4, r * 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Linee di esecuzione dell'ordine verso il bersaglio (Action Beams)
  if (orderFeedback && time - orderFeedback.time >= 0 && time - orderFeedback.time <= 1.2) {
    const elapsed = time - orderFeedback.time;
    const alpha = (1 - elapsed / 1.2) * 0.75;
    const targetP = worldPoint(orderFeedback.to.x, orderFeedback.to.y);
    ctx.save();
    ctx.strokeStyle = `rgba(224, 180, 80, ${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    for (const source of orderFeedback.from) {
      const srcP = worldPoint(source.x, source.y);
      ctx.beginPath();
      ctx.moveTo(srcP.x, srcP.y);
      ctx.lineTo(targetP.x, targetP.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  const liveTarget = (target: WorldTarget) =>
    target.type === 'unit'
      ? (state.units.find((u) => u.id === target.id) ?? target)
      : target.type === 'entity'
        ? (groundPileFor(state, target.id, piles) ??
          state.entities.find((e) => e.id === target.id) ??
          target)
        : target.type === 'city'
          ? (state.cities.find((c) => c.id === target.id) ?? target)
          : target;
  const sprite = (point: { x: number; y: number }, draw: () => void, scale = SPRITE_SCALE) => {
    const p = worldPoint(point.x, point.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.translate(-p.x, -p.y);
    draw();
    ctx.restore();
  };
  if (selected) {
    const p = liveTarget(selected);
    sprite(
      p,
      () => drawSelection(ctx, p.x, p.y, time, commandReady),
      selected.type === 'city' ? 1 : SPRITE_SCALE,
    );
  }
  if (hovered && hovered.id !== selected?.id) {
    const p = liveTarget(hovered);
    sprite(
      p,
      () => drawSelection(ctx, p.x, p.y, time, commandReady, true),
      hovered.type === 'city' ? 1 : SPRITE_SCALE,
    );
  }
  const objects: { y: number; draw: () => void }[] = [];
  for (const entity of state.entities) {
    if (
      entity.kind === 'ground' ||
      (entity.amount <= 0 && !['tree', 'stone'].includes(entity.kind)) ||
      !isVisibleAt(state, entity.x, entity.y) ||
      (entity.kind === 'ore' && !hasConcept(state, 'O_07'))
    )
      continue;
    if (
      entity.kind === 'wolf' &&
      state.time % 90 < 60 &&
      !entity.attacked &&
      !state.units.some((u) => u.hp > 0 && Math.hypot(u.x - entity.x, u.y - entity.y) < 20)
    )
      continue;
    const unknown =
      (entity.kind === 'tree' && !hasConcept(state, 'O_03')) ||
      (entity.kind === 'stone' && !hasConcept(state, 'O_02'));
    objects.push({
      y: entity.y,
      draw: () =>
        sprite(entity, () => {
          if (entity.kind === 'ore') {
            const p = worldPoint(entity.x, entity.y);
            rock(ctx, p.x, p.y, 18);
            line(
              ctx,
              [
                [p.x - 8, p.y - 12],
                [p.x, p.y - 4],
                [p.x + 10, p.y - 10],
              ],
              '#649e78',
              3,
            );
          } else if (entity.kind === 'seedling') {
            const p = worldPoint(entity.x, entity.y);
            oval(ctx, p.x, p.y + 2, 9, 4, '#877e5440');
            line(
              ctx,
              [
                [p.x, p.y + 2],
                [p.x, p.y - 14],
              ],
              '#5b7b4f',
              2,
            );
            oval(ctx, p.x - 5, p.y - 10, 6, 3, '#7d9d63');
            oval(ctx, p.x + 5, p.y - 14, 6, 3, '#90a96e');
          } else
            drawEntity(ctx, entity, time, state.seasonIndex, selected?.id === entity.id, unknown);
        }),
    });
  }
  for (const pile of piles) {
    if (!isVisibleAt(state, pile.entity.x, pile.entity.y)) continue;
    objects.push({
      y: pile.y + 0.1,
      draw: () => sprite(pile, () => drawGroundPile(ctx, state, pile)),
    });
  }
  if (!state.urbanized)
    for (const b of state.buildings.filter((b) => b.hp > 0 && isVisibleAt(state, b.x, b.y)))
      objects.push({ y: b.y, draw: () => sprite(b, () => drawBuilding(ctx, b, time)) });
  for (const unit of state.units.filter(
    (u) =>
      u.hp > 0 &&
      isVisibleAt(state, u.x, u.y) &&
      (!state.urbanized ||
        u.isKing ||
        ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
  ))
    objects.push({
      y: unit.y + 0.3,
      draw: () =>
        sprite(unit, () => {
          const isGroupMember = !!(
            isGroupActive &&
            liveAnchor &&
            Math.hypot(unit.x - liveAnchor.x, unit.y - liveAnchor.y) <= 15
          );
          drawUnit(
            ctx,
            unit,
            time,
            selected?.id === unit.id && hasConcept(state, 'S_02'),
            !!unit.carry && resourceKnown(state, unit.carry.resource),
            custodians.get(unit.id),
            isGroupMember,
          );
        }),
    });
  for (const city of state.cities.filter(
    (c) => isVisibleAt(state, c.x, c.y) && c.factionId !== 'ruins',
  ))
    objects.push({
      y: city.y,
      draw: () => {
        const p = worldPoint(city.x, city.y),
          own = city.factionId === 'player';
        oval(ctx, p.x, p.y + 2, 19, 7, '#3a4b3025');
        sprite(
          city,
          () => {
            for (let i = 0; i < 5; i++)
              drawBuilding(
                ctx,
                {
                  id: 'city-roof',
                  kind: i === 4 && city.capital ? 'palace' : 'house',
                  x: city.x + (i % 3) * 11 - 10,
                  y: city.y + Math.floor(i / 3) * 15 - 8,
                  hp: 400,
                  active: true,
                },
                time,
              );
          },
          0.45,
        );
        // Urbanization keeps the actual institutions visible around the city node.
        const institutions = state.buildings.filter(
          (b) =>
            b.cityId === city.id &&
            b.hp > 0 &&
            b.completed !== false &&
            ['walls', 'market', 'court', 'temple', 'archive', 'school', 'workshop'].includes(
              b.kind,
            ),
        );
        for (let i = 0; i < institutions.length; i++) {
          const angle = -Math.PI + (i * Math.PI * 2) / Math.max(7, institutions.length);
          const building = {
            ...institutions[i],
            x: city.x + Math.cos(angle) * 18,
            y: city.y + Math.sin(angle) * 22,
          };
          sprite(building, () => drawBuilding(ctx, building, time), 0.18);
        }
        ctx.fillStyle = own ? '#456a48' : '#a57855';
        ctx.fillRect(p.x - 1, p.y - 27, 1.4, 15);
        polygon(
          ctx,
          [
            [p.x, p.y - 27],
            [p.x + 11, p.y - 23],
            [p.x, p.y - 19],
          ],
          own ? '#6d8b54' : '#b38e6c',
        );
        ctx.font = '10px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#465b3d';
        ctx.fillText(city.name, p.x, p.y + 23);
        if (hasConcept(state, 'O_08')) {
          ctx.font = '7px sans-serif';
          ctx.fillStyle = '#7e896c';
          ctx.fillText(`${Object.values(city.cohorts).reduce((n, v) => n + v, 0)}`, p.x, p.y + 33);
        }
      },
    });
  for (const b of state.battalions.filter((b) => b.hp > 0 && isVisibleAt(state, b.x, b.y)))
    objects.push({
      y: b.y,
      draw: () => {
        const p = worldPoint(b.x, b.y);
        for (let i = 0; i < 3; i++) {
          oval(
            ctx,
            p.x + (i - 1) * 5,
            p.y - 7,
            3,
            5,
            b.factionId === 'player' ? '#5d7953' : '#9a6853',
          );
          line(
            ctx,
            [
              [p.x + (i - 1) * 5 + 3, p.y],
              [p.x + (i - 1) * 5 + 3, p.y - 18],
            ],
            '#605e49',
            1,
          );
        }
        if (b.catapult) rock(ctx, p.x + 12, p.y, 5);
      },
    });
  for (const c of state.caravans.filter(
    (c) => c.hp > 0 && !c.arrived && isVisibleAt(state, c.x, c.y),
  ))
    objects.push({
      y: c.y,
      draw: () => {
        const p = worldPoint(c.x, c.y);
        ctx.fillStyle =
          c.kind === 'colonists' ? '#b29863' : c.kind === 'delegate' ? '#899484' : '#9c855b';
        ctx.fillRect(p.x - 5, p.y - 8, 11, 7);
        oval(ctx, p.x - 4, p.y, 2, 2, '#60674e');
        oval(ctx, p.x + 5, p.y, 2, 2, '#60674e');
      },
    });
  objects.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  for (const spark of state.sparks) {
    const u = state.units.find((u) => u.id === spark.unitId && u.hp > 0);
    if (!u) continue;
    sprite(u, () => {
      const p = worldPoint(u.x, u.y),
        x = p.x,
        y = p.y - 36 + Math.sin(time * 3) * 2;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 25);
      glow.addColorStop(0, '#f9e4a477');
      glow.addColorStop(1, '#f9e4a400');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 25, y - 25, 50, 50);
      polygon(
        ctx,
        [
          [x, y - 10],
          [x + 8, y],
          [x, y + 10],
          [x - 8, y],
        ],
        '#f7e5b0',
      );
      ctx.strokeStyle = '#a38740';
      ctx.lineWidth = 1;
      ctx.stroke();
      line(
        ctx,
        [
          [x + 1, y - 6],
          [x - 3, y + 1],
          [x + 2, y + 1],
          [x - 1, y + 6],
        ],
        '#987c35',
        2,
      );
    });
  }
  if (hasConcept(state, 'O_10')) {
    const p = worldPoint(state.home.x, state.home.y),
      radius = visibleBorderRadius(state);
    ctx.strokeStyle = '#a5ae6a99';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * 2.4, radius * 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (state.tier >= 4) {
    ctx.strokeStyle = '#8c947738';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo((i * MAP_WIDTH) / 5, 0);
      ctx.lineTo((i * MAP_WIDTH) / 5, MAP_HEIGHT);
      ctx.moveTo(0, (i * MAP_HEIGHT) / 5);
      ctx.lineTo(MAP_WIDTH, (i * MAP_HEIGHT) / 5);
      ctx.stroke();
    }
  }
  for (let sy = 0; sy < 5; sy++)
    for (let sx = 0; sx < 5; sx++)
      if (!isVisibleAt(state, sx * 100 + 50, sy * 100 + 50)) {
        ctx.fillStyle = '#e3e1cbf5';
        ctx.fillRect(
          (sx * MAP_WIDTH) / 5,
          (sy * MAP_HEIGHT) / 5,
          MAP_WIDTH / 5 + 0.5,
          MAP_HEIGHT / 5 + 0.5,
        );
      }

  // Twilight comes from the simulation, so pausing also pauses the day.
  const seasonTime = state.time % 90;
  const darkness =
    seasonTime < 54
      ? 0
      : seasonTime < 65
        ? (seasonTime - 54) / 11
        : seasonTime < 84
          ? 1
          : (90 - seasonTime) / 6;
  if (darkness > 0) {
    ctx.fillStyle = `rgba(35,53,66,${darkness * 0.38})`;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    for (const fire of state.buildings.filter((b) => b.kind === 'campfire' && b.active)) {
      const p = worldPoint(fire.x, fire.y);
      const light = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 36);
      light.addColorStop(0, `rgba(245,188,98,${darkness * 0.26})`);
      light.addColorStop(0.55, `rgba(245,188,98,${darkness * 0.08})`);
      light.addColorStop(1, '#f5bc6200');
      ctx.fillStyle = light;
      ctx.fillRect(p.x - 36, p.y - 36, 72, 72);
    }
  }

  // Unexplored margins fade into the paper rather than a hard black RTS mask.
  const vignette = ctx.createRadialGradient(600, 405, 280, 600, 405, 720);
  vignette.addColorStop(0, '#e9e6cd00');
  vignette.addColorStop(0.55, '#e9e6cd00');
  vignette.addColorStop(1, '#e9e6cddd');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // A few birds provide scale, never gameplay information.
  ctx.strokeStyle = '#546d534d';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    const x = ((time * 3 + 140 + i * 17) % 1400) - 100,
      y = 130 + Math.sin(time * 0.04 + i) * 15 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 2);
    ctx.quadraticCurveTo(x - 2, y - 4 - Math.sin(time * 2) * 2, x, y);
    ctx.quadraticCurveTo(x + 2, y - 4 - Math.sin(time * 2) * 2, x + 4, y - 2);
    ctx.stroke();
  }
}
