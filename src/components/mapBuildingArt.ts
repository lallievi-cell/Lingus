import { BUILDING_SPECS } from '../game/content';
import type { Building, BuildingKind } from '../game/types';

type Point = [number, number];
const supported = new Set<BuildingKind>([
  'campfire',
  'storage',
  'depot',
  'menhir',
  'stele',
  'farm',
  'pen',
  'foundry',
  'hut',
  'palisade',
  'house',
  'grave',
  'temple',
  'walls',
  'archive',
  'palace',
  'market',
  'court',
  'school',
  'workshop',
]);
const textures = new Map<BuildingKind, HTMLCanvasElement>();

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function shape(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  fill: string | CanvasGradient,
  outline?: string,
) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
}
function line(ctx: CanvasRenderingContext2D, points: Point[], color: string, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function wash(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, color.slice(0, 7) + '00');
  oval(ctx, x, y, radius, radius * 0.48, gradient);
}
function gradient(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  x = -20,
  y = -40,
  width = 45,
  height = 48,
) {
  const paint = ctx.createLinearGradient(x, y, x + width, y + height);
  colors.forEach((color, i) => paint.addColorStop(i / (colors.length - 1), color));
  return paint;
}
function material(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  colors: string[],
  type: 'stone' | 'rock' | 'wood' | 'hide' | 'thatch',
  seed = 31,
) {
  shape(ctx, points, gradient(ctx, colors), '#3e493e75');
  ctx.save();
  ctx.clip();
  const rng = random(seed);
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  if (type === 'stone') {
    for (let row = 0, y = top + 6; y < bottom + 8; row++, y += 6.5) {
      line(
        ctx,
        [
          [left - 2, y],
          [right + 2, y + 1.4],
        ],
        '#48544877',
        0.75,
      );
      for (let x = left - 5 + (row % 2) * 7; x < right; x += 11 + rng() * 5) {
        const blockWidth = 8 + rng() * 5;
        shape(
          ctx,
          [
            [x + 0.6, y - 5.2],
            [x + blockWidth, y - 4.8],
            [x + blockWidth - 0.5, y - 0.4],
            [x + 0.2, y - 0.7],
          ],
          row % 2 ? '#f4e8cc22' : '#53614c16',
        );
        line(
          ctx,
          [
            [x + 1, y - 4.8],
            [x + blockWidth - 1, y - 4.7],
          ],
          '#fff1d645',
          0.6,
        );
        line(
          ctx,
          [
            [x, y - 5],
            [x + 0.4, y + 0.1],
          ],
          '#4b594e66',
          0.65,
        );
      }
    }
  } else if (type === 'rock') {
    shape(
      ctx,
      [
        [left, bottom],
        [left + (right - left) * 0.25, top],
        [right * 0.55, top + 5],
        [right * 0.1, bottom],
      ],
      '#f3e6c82d',
    );
    line(
      ctx,
      [
        [left + 5, top + 8],
        [left + 9, top + 20],
        [left + 6, top + 27],
      ],
      '#3b574b75',
      0.75,
    );
    line(
      ctx,
      [
        [right - 7, top + 19],
        [right - 9, top + 30],
        [right - 6, bottom - 2],
      ],
      '#e0d3ad5e',
      0.7,
    );
  } else if (type === 'wood') {
    for (let x = left; x <= right; x += 5) {
      line(
        ctx,
        [
          [x, top],
          [x + 0.8, bottom],
        ],
        '#443c2d77',
        0.9,
      );
      line(
        ctx,
        [
          [x + 1.4, top + 1],
          [x + 2, bottom - 1],
        ],
        '#f0d4a27a',
        0.6,
      );
    }
  } else if (type === 'hide') {
    line(
      ctx,
      [
        [-2, top - 3],
        [0, bottom + 4],
      ],
      '#5f4d3766',
      0.7,
    );
    for (let y = top; y < bottom; y += 4)
      line(
        ctx,
        [
          [-1.5, y],
          [1.8, y - 0.3],
        ],
        '#e3c99b99',
        0.5,
      );
  }
  for (let i = 0; i < (type === 'thatch' ? 74 : 24); i++) {
    const x = left + rng() * (right - left),
      y = top + rng() * (bottom - top);
    const color = i % 3 ? '#fff0be50' : '#3d463b3a';
    if (type === 'thatch')
      line(
        ctx,
        [
          [x, y],
          [x + 2 + rng() * 2, y + 4 + rng() * 6],
        ],
        color,
        0.65 + rng() * 0.5,
      );
    else oval(ctx, x, y, 0.3 + rng() * 1.6, 0.25 + rng() * 0.7, color);
  }
  ctx.restore();
}
function shadow(ctx: CanvasRenderingContext2D, width = 32) {
  // A broad, irregular footprint ties the architecture to worn earth. The
  // contact shadow remains strongest below the walls, with light from upper left.
  shape(
    ctx,
    [
      [-width - 3, 1],
      [-width + 6, -9],
      [-width * 0.2, -12],
      [width * 0.7, -7],
      [width + 5, 2],
      [width - 1, 10],
      [width * 0.15, 13],
      [-width * 0.8, 9],
    ],
    '#b39b6b32',
  );
  wash(ctx, 8, 5, width + 6, '#293c2e45');
  oval(ctx, 2, 3.5, width, width * 0.23, '#2c3d2d37');
  line(
    ctx,
    [
      [-width + 6, 8],
      [-width * 0.1, 10],
      [width * 0.6, 6],
    ],
    '#e9cf9b2c',
    1.3,
  );
}
function timber(
  ctx: CanvasRenderingContext2D,
  x: number,
  bottom: number,
  height: number,
  width = 3,
) {
  shape(
    ctx,
    [
      [x - width / 2, bottom],
      [x - width / 2 - 0.5, bottom - height],
      [x + width / 2, bottom - height - 1],
      [x + width / 2, bottom],
    ],
    gradient(ctx, ['#cfaa75', '#926c44', '#4c4634'], x, bottom - height, width, height),
  );
  line(
    ctx,
    [
      [x - width / 3, bottom - height + 2],
      [x - width / 4, bottom - 1],
    ],
    '#d8bd875e',
    0.6,
  );
  for (let y = bottom - height + 6; y < bottom - 4; y += 14)
    oval(ctx, x + 0.15, y, width * 0.24, 1.1, '#4f432d55');
}
function doorway(ctx: CanvasRenderingContext2D, x: number, y: number, width = 10, height = 18) {
  ctx.fillStyle = gradient(ctx, ['#243b32', '#384b38', '#746546'], x, y - height, width, height);
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x - width / 2, y - height + 4);
  ctx.quadraticCurveTo(x, y - height - 3, x + width / 2, y - height + 4);
  ctx.lineTo(x + width / 2, y);
  ctx.closePath();
  ctx.fill();
  line(
    ctx,
    [
      [x - width / 2 - 1, y],
      [x - width / 2 - 1, y - height + 4],
      [x - 1, y - height],
    ],
    '#d3c3a088',
    1,
  );
  oval(ctx, x + 1, y + 0.6, width * 0.6, 1.3, '#53604350');
}
function roof(ctx: CanvasRenderingContext2D, width = 31, ridge = -55, eave = -22, stone = false) {
  material(
    ctx,
    [
      [-width, eave],
      [-5, ridge],
      [width + 1, eave - 4],
      [7, eave + 13],
    ],
    stone ? ['#d0b487', '#a48056', '#735e42'] : ['#e5ca8c', '#bd965e', '#806441'],
    'thatch',
  );
  material(
    ctx,
    [
      [-5, ridge],
      [width + 1, eave - 4],
      [7, eave + 13],
    ],
    stone ? ['#b89468', '#8b6648', '#594e3a'] : ['#c8a36a', '#9c764d', '#60533b'],
    'thatch',
    71,
  );
  line(
    ctx,
    [
      [-width, eave],
      [7, eave + 13],
      [width + 1, eave - 4],
    ],
    '#3e473a91',
    1.8,
  );
  line(
    ctx,
    [
      [-width + 2, eave - 0.7],
      [-5, ridge],
      [width - 1, eave - 4.5],
    ],
    '#f1dba4cf',
    1.4,
  );
  // Long, bundled courses carry the roof at play distance. Fine straw alone
  // disappears on mobile, so the main folds follow the actual roof planes.
  for (let course = 0; course < 4; course++) {
    const t = (course + 1) / 5;
    const start: Point = [-5 + (-width + 5) * t, ridge + (eave - ridge) * t];
    const end: Point = [-5 + 12 * t, ridge + (eave + 13 - ridge) * t];
    line(ctx, [start, end], '#594e3b55', 1.5);
    line(
      ctx,
      [
        [start[0], start[1] - 0.7],
        [end[0], end[1] - 0.7],
      ],
      '#f3dba078',
      0.8,
    );
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    line(
      ctx,
      [
        [-width + (width + 7) * t, eave + 13 * t],
        [-width + (width + 7) * t + 0.7, eave + 13 * t + 2],
      ],
      '#baa372',
      0.8,
    );
  }
}
function smallRock(ctx: CanvasRenderingContext2D, x: number, y: number, size = 4) {
  shape(
    ctx,
    [
      [x - size, y + size * 0.3],
      [x - size * 0.75, y - size * 0.55],
      [x, y - size],
      [x + size * 0.8, y - size * 0.5],
      [x + size, y + size * 0.25],
      [x, y + size * 0.6],
    ],
    gradient(ctx, ['#cfc7aa', '#929f86', '#4d6757'], x - size, y - size, size * 2, size * 2),
  );
  line(
    ctx,
    [
      [x - size * 0.65, y - size * 0.45],
      [x, y - size * 0.8],
      [x + size * 0.5, y - size * 0.45],
    ],
    '#e1d9b580',
    0.65,
  );
}
function vessel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color = '#ab875d',
) {
  ctx.fillStyle = gradient(
    ctx,
    ['#d2b58a', color, '#735d43'],
    x - size,
    y - size * 2,
    size * 2,
    size * 2,
  );
  ctx.beginPath();
  ctx.moveTo(x - size * 0.5, y - size * 1.5);
  ctx.bezierCurveTo(x - size * 1.25, y - size, x - size, y, x, y);
  ctx.bezierCurveTo(x + size, y, x + size * 1.25, y - size, x + size * 0.5, y - size * 1.5);
  ctx.closePath();
  ctx.fill();
  oval(ctx, x, y - size * 1.5, size * 0.5, size * 0.18, '#5b5940');
  line(
    ctx,
    [
      [x - size * 0.58, y - size * 0.7],
      [x + size * 0.65, y - size * 0.7],
    ],
    '#e7c89a65',
    0.55,
  );
}
function cabin(ctx: CanvasRenderingContext2D, stone: boolean) {
  if (!stone) {
    hideShelter(ctx);
    return;
  }
  shadow(ctx, 29);
  material(
    ctx,
    [
      [-23, -1],
      [-23, -29],
      [15, -24],
      [15, 8],
    ],
    ['#e4d7b7', '#c7bc99', '#969a7b'],
    'stone',
  );
  material(
    ctx,
    [
      [15, 8],
      [28, 0],
      [27, -30],
      [15, -24],
    ],
    ['#a5ad91', '#738672', '#435c4d'],
    'stone',
    64,
  );
  roof(ctx, 31, -57, -26, true);
  doorway(ctx, -5, 4, 10, 18);
  for (let i = 0; i < 5; i++) smallRock(ctx, -22 + i * 9, 2 + i * 0.7, 3.6);
  shape(
    ctx,
    [
      [18, -10],
      [18, -19],
      [24, -22],
      [24, -13],
    ],
    '#2d4b3d',
  );
  line(
    ctx,
    [
      [21, -20],
      [21, -11],
    ],
    '#d1c59f',
    0.8,
  );
  vessel(ctx, 20, 5, 3.3);
}

/** The first shelter reads as stretched skins and saplings, not a tiny stone house. */
function hideShelter(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 31);
  oval(ctx, 0, 2, 27, 8, '#34473358');
  ctx.beginPath();
  ctx.moveTo(-31, 2);
  ctx.bezierCurveTo(-29, -23, -17, -47, -4, -52);
  ctx.bezierCurveTo(10, -45, 24, -22, 30, 2);
  ctx.quadraticCurveTo(8, 13, -31, 2);
  ctx.closePath();
  ctx.fillStyle = gradient(ctx, ['#e4c38d', '#bd9360', '#7a6546'], -26, -44, 54, 46);
  ctx.fill();
  ctx.save();
  ctx.clip();
  shape(
    ctx,
    [
      [-4, -53],
      [11, -38],
      [31, 3],
      [8, 10],
      [3, -22],
    ],
    '#655b3b40',
  );
  shape(
    ctx,
    [
      [-28, -2],
      [-19, -27],
      [-5, -45],
      [-11, -8],
    ],
    '#f1d7a12e',
  );
  for (let i = 0; i < 6; i++) {
    const x = -25 + i * 9;
    ctx.beginPath();
    ctx.moveTo(-4, -50);
    ctx.quadraticCurveTo(x * 0.85, -22, x, 6);
    ctx.strokeStyle = i % 2 ? '#73553885' : '#f0d5a16b';
    ctx.lineWidth = i % 2 ? 1.8 : 1.2;
    ctx.stroke();
  }
  line(
    ctx,
    [
      [-25, -10],
      [-10, -12],
      [5, -10],
      [23, -8],
    ],
    '#73543766',
    1.1,
  );
  for (let i = 0; i < 8; i++) {
    const x = -23 + i * 6;
    line(
      ctx,
      [
        [x, -12],
        [x + 0.8, -8],
      ],
      '#f3d7a2b0',
      0.8,
    );
  }
  ctx.restore();
  doorway(ctx, -6, 5, 13, 26);
  shape(
    ctx,
    [
      [-1, -21],
      [2, -16],
      [3, 2],
      [0, 5],
      [-2, -7],
    ],
    '#d9b785',
    '#745c3d88',
  );
  line(
    ctx,
    [
      [-15, 5],
      [-15, -6],
      [-8, -26],
      [-4, -52],
    ],
    '#e4c18bd9',
    1.5,
  );
  for (const x of [-26, 22]) {
    line(
      ctx,
      [
        [x * 0.7, -11],
        [x, 7],
      ],
      '#725a3f',
      0.9,
    );
    smallRock(ctx, x, 6, 2.5);
  }
  line(
    ctx,
    [
      [-5, -49],
      [-7, -60],
    ],
    '#705137',
    1.8,
  );
  line(
    ctx,
    [
      [-6, -54],
      [0, -57],
    ],
    '#c6a16b',
    1.3,
  );
  oval(ctx, 0, -52, 3, 1.8, '#4e4b38');
  // A folded hide at the threshold adds texture without implying a stored resource.
  oval(ctx, 22, 5, 4.6, 2.4, '#9c784e');
  line(
    ctx,
    [
      [19, 4],
      [23, 3],
      [25, 5],
    ],
    '#d8ba80',
    0.8,
  );
}
function monument(ctx: CanvasRenderingContext2D, kind: BuildingKind) {
  shadow(ctx, 23);
  if (kind === 'grave') {
    oval(ctx, 0, 1, 26, 11, gradient(ctx, ['#b9ad80', '#8c916b'], -20, -10, 40, 20));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      smallRock(ctx, Math.cos(a) * 23, Math.sin(a) * 8, 2.6);
    }
    material(
      ctx,
      [
        [-9, -4],
        [-10, -22],
        [-3, -34],
        [7, -31],
        [13, -5],
      ],
      ['#d4cfb1', '#9dab8e', '#536e5c'],
      'rock',
    );
    line(
      ctx,
      [
        [-5, -17],
        [5, -15],
      ],
      '#c4bc92',
      1.1,
    );
    return;
  }
  const stele = kind === 'stele';
  material(
    ctx,
    [
      [-14, 2],
      [-13, -35],
      [-5, -50],
      [8, -47],
      [15, -31],
      [13, 3],
    ],
    ['#ded6b6', '#b5bea0', '#6f8b74'],
    'rock',
  );
  material(
    ctx,
    [
      [8, -47],
      [15, -31],
      [13, 3],
      [5, 0],
      [4, -42],
    ],
    ['#97a68d', '#71826e', '#5b715e'],
    'rock',
  );
  line(
    ctx,
    [
      [-13, -34],
      [-5, -48],
      [4, -46],
    ],
    '#e4ddbf99',
    1.2,
  );
  if (stele) {
    for (let i = 0; i < 5; i++) {
      const y = -34 + i * 6;
      line(
        ctx,
        [
          [-8, y],
          [-4, y + 0.5],
          [-2, y - 1],
          [2, y],
        ],
        '#526c5a',
        0.85,
      );
      line(
        ctx,
        [
          [-6, y - 1.6],
          [-6, y + 1.4],
        ],
        '#68795e',
        0.6,
      );
    }
  } else {
    line(
      ctx,
      [
        [-6, -30],
        [-1, -37],
        [4, -30],
        [-2, -23],
        [3, -17],
        [-4, -11],
      ],
      '#d8cf9a',
      1.6,
    );
    line(
      ctx,
      [
        [-6.5, -30],
        [-1.5, -37],
      ],
      '#6d7b5b',
      0.5,
    );
  }
  smallRock(ctx, -13, 4, 3.5);
  smallRock(ctx, 13, 5, 2.7);
}
function store(ctx: CanvasRenderingContext2D, kind: 'storage' | 'depot') {
  shadow(ctx, 29);
  if (kind === 'storage') {
    oval(ctx, 0, 0, 24, 11, gradient(ctx, ['#c2b48a', '#8c8d6b'], -20, -12, 40, 20));
    oval(ctx, 0, -1, 19, 8, '#555a43');
    material(
      ctx,
      [
        [-25, -5],
        [-8, -20],
        [25, -7],
        [6, 5],
      ],
      ['#e7c98e', '#be995d', '#806943'],
      'thatch',
      43,
    );
    line(
      ctx,
      [
        [-23, -5],
        [6, 5],
        [23, -7],
      ],
      '#e2c68a',
      1.1,
    );
    line(
      ctx,
      [
        [-8, -19],
        [6, 3],
      ],
      '#6c6948',
      1.2,
    );
    for (const x of [-21, 20]) timber(ctx, x, 0, 12, 2.7);
    vessel(ctx, 24, 4, 4.3);
  } else {
    for (const x of [-26, 21]) timber(ctx, x, 3, 33, 3);
    material(
      ctx,
      [
        [-22, 2],
        [-22, -21],
        [19, -21],
        [19, 5],
      ],
      ['#caa570', '#805e3e'],
      'wood',
    );
    for (let row = 0; row < 3; row++) {
      line(
        ctx,
        [
          [-20, -2 - row * 6],
          [10, -4 - row * 6],
        ],
        '#654d36',
        4.6,
      );
      line(
        ctx,
        [
          [-20, -3 - row * 6],
          [10, -5 - row * 6],
        ],
        '#b29562',
        1.3,
      );
      oval(ctx, 10, -4 - row * 6, 2.7, 2.5, '#cfb17b');
      oval(ctx, 10, -4 - row * 6, 1.1, 1.1, '#88714b');
    }
    roof(ctx, 32, -47, -24);
    smallRock(ctx, 25, 5, 6);
    smallRock(ctx, 31, 3, 4);
  }
}
/** Institutional identity is carried by the whole silhouette, not a roof icon. */
function masonryBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  depth = 8,
  warm = false,
) {
  material(
    ctx,
    [
      [x, y],
      [x, y - height],
      [x + width, y - height],
      [x + width, y],
    ],
    warm ? ['#d9c297', '#baaa83', '#89987b'] : ['#e5dbc0', '#c5c4a8', '#899c83'],
    'stone',
    71 + width,
  );
  material(
    ctx,
    [
      [x + width, y],
      [x + width + depth, y - depth * 0.55],
      [x + width + depth, y - height - depth * 0.55],
      [x + width, y - height],
    ],
    ['#9eaa90', '#617c66', '#4b6757'],
    'stone',
    31 + height,
  );
  shape(
    ctx,
    [
      [x, y - height],
      [x + depth, y - height - depth * 0.55],
      [x + width + depth, y - height - depth * 0.55],
      [x + width, y - height],
    ],
    gradient(ctx, ['#eee1bd', '#bfbc97']),
  );
  line(
    ctx,
    [
      [x + 1, y - height + 1],
      [x + width, y - height + 1],
    ],
    '#f5e9c9aa',
    1.2,
  );
}

function lowBench(ctx: CanvasRenderingContext2D, x: number, y: number, width = 16) {
  timber(ctx, x + 2, y + 2, 5, 1.3);
  timber(ctx, x + width - 2, y + 1, 5, 1.3);
  shape(
    ctx,
    [
      [x - 1, y - 3],
      [x + 3, y - 6],
      [x + width + 3, y - 6],
      [x + width, y - 2],
    ],
    '#b29361',
    '#6c6348',
  );
  line(
    ctx,
    [
      [x + 1, y - 3.6],
      [x + width, y - 3.6],
    ],
    '#ddc491',
    0.8,
  );
}

function tablets(ctx: CanvasRenderingContext2D, x: number, y: number, columns = 3) {
  for (let column = 0; column < columns; column++) {
    const px = x + column * 5.4;
    shape(
      ctx,
      [
        [px, y],
        [px + 0.4, y - 6],
        [px + 4.1, y - 6.5],
        [px + 4.3, y],
      ],
      column % 2 ? '#bca078' : '#d2ba8c',
      '#766f51',
    );
    line(
      ctx,
      [
        [px + 1.2, y - 4],
        [px + 3.3, y - 4.2],
      ],
      '#81734f',
      0.5,
    );
    line(
      ctx,
      [
        [px + 1.3, y - 2.2],
        [px + 3, y - 2.5],
      ],
      '#8b7b54',
      0.45,
    );
  }
}

function templeHall(ctx: CanvasRenderingContext2D) {
  // A raised sanctuary with a broad stair and four deep openings.
  masonryBlock(ctx, -36, 7, 66, 5, 7);
  masonryBlock(ctx, -32, 1, 58, 6, 7);
  masonryBlock(ctx, -28, -5, 50, 6, 7);
  shape(
    ctx,
    [
      [-24, -11],
      [-24, -38],
      [23, -38],
      [23, -11],
    ],
    '#344e42',
  );
  for (const x of [-25, -10, 5, 20]) {
    material(
      ctx,
      [
        [x - 2, -11],
        [x - 2, -39],
        [x + 3.8, -39],
        [x + 3.8, -11],
      ],
      ['#f2e7c8', '#c7c5a2', '#80957b'],
      'stone',
      x + 80,
    );
    line(
      ctx,
      [
        [x - 3, -39],
        [x + 5, -39],
      ],
      '#ead9ad',
      2.5,
    );
  }
  masonryBlock(ctx, -30, -38, 57, 6, 6, true);
  material(
    ctx,
    [
      [-35, -44],
      [-6, -68],
      [35, -47],
      [5, -37],
    ],
    ['#d7c7a2', '#b49f78', '#788c72'],
    'stone',
    92,
  );
  shape(
    ctx,
    [
      [-26, -45],
      [-6, -61],
      [23, -46],
    ],
    '#677e67',
  );
  line(
    ctx,
    [
      [-34, -44],
      [-6, -68],
      [34, -47],
    ],
    '#f2e3bc',
    1.4,
  );
  // A plain sacred stone avoids attributing a particular dogma to every temple.
  shape(
    ctx,
    [
      [-7, -14],
      [-8, -24],
      [-4, -30],
      [1, -28],
      [3, -15],
    ],
    '#bec6ab',
    '#526e5b',
  );
  line(
    ctx,
    [
      [-6, -23],
      [-3, -27],
      [-1, -20],
    ],
    '#e9e2be',
    0.8,
  );
  for (const x of [-31, 29]) vessel(ctx, x, -5, 3.8);
}

function archiveHall(ctx: CanvasRenderingContext2D) {
  // An enclosed storehouse, a raised ventilated roof and shelves of clay tablets.
  masonryBlock(ctx, -34, 3, 58, 34, 11);
  masonryBlock(ctx, -29, -31, 49, 7, 11, true);
  material(
    ctx,
    [
      [-36, -38],
      [-25, -49],
      [30, -49],
      [36, -39],
      [24, -32],
    ],
    ['#b59367', '#8e7654', '#66765e'],
    'wood',
    141,
  );
  masonryBlock(ctx, -16, -46, 29, 15, 8);
  shape(
    ctx,
    [
      [-20, -61],
      [-10, -69],
      [24, -69],
      [23, -60],
      [11, -56],
    ],
    '#a4865e',
  );
  line(
    ctx,
    [
      [-20, -61],
      [-10, -69],
      [23, -69],
    ],
    '#dcc49a',
    1.3,
  );
  for (const x of [-11, -3, 5]) {
    shape(
      ctx,
      [
        [x, -51],
        [x, -57],
        [x + 4, -57],
        [x + 4, -51],
      ],
      '#4b6655',
    );
  }
  doorway(ctx, -20, 4, 12, 26);
  for (const y of [-20, -8]) {
    shape(
      ctx,
      [
        [0, y + 5],
        [0, y - 5],
        [22, y - 5],
        [22, y + 5],
      ],
      '#4e6250',
    );
    tablets(ctx, 2, y + 4, 4);
    line(
      ctx,
      [
        [-1, y + 5],
        [23, y + 5],
      ],
      '#8e7b54',
      1.5,
    );
  }
  tablets(ctx, -33, 5, 2);
  vessel(ctx, 31, 2, 4);
}

function schoolHall(ctx: CanvasRenderingContext2D) {
  // A light teaching canopy opens onto a lower courtyard of benches.
  masonryBlock(ctx, -33, -3, 27, 27, 8, true);
  shape(
    ctx,
    [
      [-38, -31],
      [-20, -50],
      [16, -43],
      [27, -26],
      [-9, -20],
    ],
    gradient(ctx, ['#dfc78f', '#bb9e64', '#7d805a']),
    '#776b48',
  );
  material(
    ctx,
    [
      [-38, -31],
      [-20, -50],
      [16, -43],
      [-9, -20],
    ],
    ['#e9d29a', '#bca36e', '#8e8d63'],
    'thatch',
    181,
  );
  for (const x of [-31, -6, 21]) {
    timber(ctx, x, -2, x === -31 ? 29 : 25, 2.5);
    line(
      ctx,
      [
        [x - 1, -1],
        [x + 2, -25],
      ],
      '#e9d7ac',
      0.7,
    );
  }
  // The board and benches are fixtures, not invented pupils or workers.
  shape(
    ctx,
    [
      [-29, -8],
      [-29, -23],
      [-13, -23],
      [-13, -8],
    ],
    '#6f795d',
    '#4b634f',
  );
  tablets(ctx, -27, -10, 2);
  line(
    ctx,
    [
      [-8, 5],
      [30, 5],
      [37, -2],
    ],
    '#aab28f',
    1.7,
  );
  lowBench(ctx, 3, -1, 18);
  lowBench(ctx, -14, 8, 18);
  lowBench(ctx, 14, 8, 14);
  vessel(ctx, 30, -9, 3.5);
}

function justiceCourt(ctx: CanvasRenderingContext2D) {
  // A U-shaped public court has no monumental temple roof.
  masonryBlock(ctx, -33, -4, 56, 24, 9);
  masonryBlock(ctx, -35, 5, 15, 25, 7, true);
  masonryBlock(ctx, 21, 5, 12, 25, 7, true);
  material(
    ctx,
    [
      [-36, -20],
      [-27, -36],
      [-14, -32],
      [-18, -16],
    ],
    ['#cab584', '#aa9366', '#778668'],
    'thatch',
    193,
  );
  material(
    ctx,
    [
      [20, -20],
      [27, -36],
      [40, -32],
      [36, -16],
    ],
    ['#cbb686', '#a28f63', '#6a7f64'],
    'thatch',
    194,
  );
  shape(
    ctx,
    [
      [-20, -28],
      [-12, -44],
      [20, -44],
      [31, -28],
    ],
    '#af9b72',
    '#738267',
  );
  line(
    ctx,
    [
      [-12, -44],
      [20, -44],
    ],
    '#e0cca4',
    1.3,
  );
  doorway(ctx, -4, -4, 11, 22);
  masonryBlock(ctx, -12, -1, 25, 6, 4);
  // An empty judgement seat and two listening benches establish its use.
  material(
    ctx,
    [
      [-5, -8],
      [-5, -20],
      [4, -20],
      [4, -8],
    ],
    ['#bfad7e', '#8a926c', '#5c755e'],
    'wood',
    211,
  );
  shape(
    ctx,
    [
      [-7, -8],
      [4, -8],
      [8, -5],
      [-5, -4],
    ],
    '#c5b98f',
  );
  lowBench(ctx, -17, 8, 13);
  lowBench(ctx, 4, 8, 13);
}

function royalPalace(ctx: CanvasRenderingContext2D) {
  // Two uneven wings and an elevated gate tower create a recognisable skyline.
  masonryBlock(ctx, -34, 5, 18, 38, 8, true);
  masonryBlock(ctx, 16, 5, 17, 32, 7, true);
  masonryBlock(ctx, -17, 3, 33, 32, 8);
  material(
    ctx,
    [
      [-38, -33],
      [-25, -51],
      [-10, -40],
      [-15, -29],
    ],
    ['#c9a577', '#a4885d', '#6f8063'],
    'thatch',
    221,
  );
  material(
    ctx,
    [
      [13, -27],
      [25, -44],
      [42, -33],
      [31, -23],
    ],
    ['#bd9c70', '#8d7957', '#657a60'],
    'thatch',
    222,
  );
  masonryBlock(ctx, -9, -28, 24, 33, 9, true);
  material(
    ctx,
    [
      [-13, -61],
      [2, -76],
      [29, -65],
      [14, -54],
    ],
    ['#c0a16d', '#937e55', '#687c61'],
    'thatch',
    223,
  );
  line(
    ctx,
    [
      [-12, -61],
      [2, -76],
      [28, -65],
    ],
    '#ead5a8',
    1.2,
  );
  for (const x of [-3, 7]) doorway(ctx, x, -35, 5, 15);
  doorway(ctx, -1, 4, 15, 29);
  shape(
    ctx,
    [
      [-7, 4],
      [-7, -20],
      [5, -20],
      [5, 4],
    ],
    '#405a47',
  );
  line(
    ctx,
    [
      [-9, -22],
      [7, -22],
    ],
    '#d4b476',
    2.3,
  );
  masonryBlock(ctx, -19, 8, 39, 4, 7);
  timber(ctx, 13, -62, 24, 1.3);
  shape(
    ctx,
    [
      [14, -85],
      [28, -81],
      [26, -74],
      [14, -76],
    ],
    gradient(ctx, ['#b48647', '#865c37']),
  );
  line(
    ctx,
    [
      [15, -84],
      [25, -81],
    ],
    '#edce91',
    0.7,
  );
}

function hall(ctx: CanvasRenderingContext2D, kind: BuildingKind) {
  shadow(ctx, 38);
  if (kind === 'temple') templeHall(ctx);
  else if (kind === 'archive') archiveHall(ctx);
  else if (kind === 'school') schoolHall(ctx);
  else if (kind === 'court') justiceCourt(ctx);
  else royalPalace(ctx);
}
function market(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 34);
  material(
    ctx,
    [
      [-25, 0],
      [-25, -13],
      [23, -13],
      [23, 1],
    ],
    ['#bca578', '#917b50'],
    'wood',
  );
  for (const x of [-27, 26]) timber(ctx, x, 2, 40, 2.3);
  for (let i = 0; i < 6; i++) {
    const x = -33 + i * 11;
    shape(
      ctx,
      [
        [x, -36],
        [x + 11, -37],
        [x + 17, -17],
        [x + 6, -17],
      ],
      gradient(ctx, i % 2 ? ['#cdbb90', '#a58f64'] : ['#a38d68', '#816e51']),
    );
    line(
      ctx,
      [
        [x + 1, -35],
        [x + 7, -19],
      ],
      '#e8d5ab66',
      0.6,
    );
    ctx.beginPath();
    ctx.moveTo(x + 6, -17);
    ctx.quadraticCurveTo(x + 11, -10, x + 17, -17);
    ctx.fillStyle = i % 2 ? '#bca77c' : '#927b58';
    ctx.fill();
  }
  for (const [x, color] of [
    [-17, '#9a9662'],
    [-5, '#b69262'],
    [7, '#978b61'],
  ] as const)
    vessel(ctx, x, -9, 4, color);
  line(
    ctx,
    [
      [-27, -12],
      [27, -12],
    ],
    '#d4ba81',
    1.4,
  );
  vessel(ctx, 29, 7, 5);
}
function foundry(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 30);
  material(
    ctx,
    [
      [-24, 2],
      [-25, -24],
      [-18, -39],
      [-8, -46],
      [13, -43],
      [24, -28],
      [24, 1],
    ],
    ['#cfb991', '#9b9877', '#4d6b57'],
    'stone',
  );
  material(
    ctx,
    [
      [5, -37],
      [5, -65],
      [17, -68],
      [21, -62],
      [21, -35],
    ],
    ['#b8b595', '#89997e', '#5d7462'],
    'stone',
    82,
  );
  oval(ctx, 12, -66, 8, 2.4, '#4b5d4c');
  doorway(ctx, -3, 3, 24, 25);
  for (let i = 0; i < 6; i++)
    smallRock(ctx, -17 + i * 5, -13 - Math.sin((i * Math.PI) / 5) * 11, 3);
  smallRock(ctx, 28, 5, 5.2);
  timber(ctx, -28, 3, 13, 2.3);
  line(
    ctx,
    [
      [-31, -10],
      [-25, -11],
    ],
    '#534c3b',
    2.5,
  );
}
function workshop(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 36);
  material(
    ctx,
    [
      [-26, 2],
      [-26, -29],
      [14, -28],
      [14, 3],
    ],
    ['#c1a679', '#7e8663'],
    'wood',
  );
  doorway(ctx, -8, 2, 19, 23);
  roof(ctx, 30, -49, -25, true);
  for (const x of [-28, 17]) timber(ctx, x, 5, 30, 2.7);
  line(
    ctx,
    [
      [-17, 0],
      [9, 0],
    ],
    '#bc9c63',
    3,
  );
  timber(ctx, -14, 8, 8, 1.7);
  timber(ctx, 6, 8, 8, 1.7);
  line(
    ctx,
    [
      [-9, -1],
      [-9, -9],
    ],
    '#655642',
    1.5,
  );
  line(
    ctx,
    [
      [-12, -9],
      [-5, -10],
    ],
    '#8f9275',
    3,
  );
  vessel(ctx, -29, 7, 4.5);
}
function fencePost(ctx: CanvasRenderingContext2D, x: number, y: number, height = 24) {
  material(
    ctx,
    [
      [x - 2.7, y],
      [x - 2.7, y - height],
      [x - 0.3, y - height - 6],
      [x + 3.5, y - height + 0.5],
      [x + 3.2, y],
    ],
    ['#c0aa7d', '#98815a', '#6d6248'],
    'wood',
  );
  line(
    ctx,
    [
      [x - 1.6, y - height + 1],
      [x - 1.5, y - 2],
    ],
    '#ddc89b80',
    0.5,
  );
}
function palisade(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 36);
  for (let i = 0; i < 10; i++) fencePost(ctx, -32 + i * 7, Math.sin(i * 0.4) * 4, 23 + (i % 3));
  for (const y of [-8, -18]) {
    line(
      ctx,
      [
        [-35, y],
        [33, y + 2],
      ],
      '#6d5e43',
      2.7,
    );
    line(
      ctx,
      [
        [-35, y - 0.7],
        [33, y + 1.3],
      ],
      '#baa274',
      0.75,
    );
    for (let x = -30; x < 32; x += 14)
      line(
        ctx,
        [
          [x - 1.5, y - 2],
          [x + 1, y + 2],
        ],
        '#d0bb8c',
        0.8,
      );
  }
}
function walls(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 39);
  material(
    ctx,
    [
      [-35, 5],
      [-35, -22],
      [35, -19],
      [35, 8],
      [0, 15],
    ],
    ['#d5cfac', '#afba9a', '#66816b'],
    'stone',
  );
  for (let i = 0; i < 10; i++) {
    const x = -34 + i * 7.5;
    shape(
      ctx,
      [
        [x, -21],
        [x, -27],
        [x + 4.5, -27],
        [x + 4.5, -20],
      ],
      '#b3bea0',
      '#8f9f83',
    );
    line(
      ctx,
      [
        [x, -27],
        [x + 4.4, -27],
      ],
      '#dedac0',
      0.8,
    );
  }
  for (const x of [-33, 30]) {
    material(
      ctx,
      [
        [x - 7, 5],
        [x - 7, -36],
        [x + 7, -37],
        [x + 8, 4],
      ],
      ['#dfd9b7', '#b6b89a', '#6d8a70'],
      'stone',
    );
    for (let i = 0; i < 3; i++)
      shape(
        ctx,
        [
          [x - 7 + i * 5.5, -35],
          [x - 7 + i * 5.5, -42],
          [x - 3 + i * 5.5, -42],
          [x - 3 + i * 5.5, -35],
        ],
        '#bdc5a7',
      );
    shape(
      ctx,
      [
        [x - 1, -19],
        [x - 1, -29],
        [x + 1.5, -29],
        [x + 1.5, -19],
      ],
      '#526b58',
    );
  }
  doorway(ctx, 0, 12, 13, 27);
  for (let i = 0; i < 4; i++)
    line(
      ctx,
      [
        [-4.5 + i * 3, 10],
        [-4.5 + i * 3, -8],
      ],
      '#b5a77b',
      0.6,
    );
}
function staticStructure(ctx: CanvasRenderingContext2D, kind: BuildingKind) {
  switch (kind) {
    case 'hut':
    case 'house':
      cabin(ctx, kind === 'house');
      break;
    case 'menhir':
    case 'stele':
    case 'grave':
      monument(ctx, kind);
      break;
    case 'storage':
    case 'depot':
      store(ctx, kind);
      break;
    case 'temple':
    case 'palace':
    case 'court':
    case 'archive':
    case 'school':
      hall(ctx, kind);
      break;
    case 'market':
      market(ctx);
      break;
    case 'foundry':
      foundry(ctx);
      break;
    case 'workshop':
      workshop(ctx);
      break;
    case 'walls':
      walls(ctx);
      break;
    case 'palisade':
      palisade(ctx);
      break;
  }
}
function fire(ctx: CanvasRenderingContext2D, time: number, active: boolean, small = false) {
  const width = small ? 9 : 20;
  if (!small) {
    shadow(ctx, 25);
    oval(ctx, 0, 1, 22, 9, '#8e785259');
    oval(ctx, -1, 0, 17, 6.8, '#303b31d9');
    oval(ctx, -2, -1, 13, 4.8, '#514d3da8');
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.39996;
      const radius = 2 + (i % 5) * 2.8;
      oval(
        ctx,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.36,
        0.6 + (i % 3) * 0.3,
        0.3,
        active && i % 3 === 0 ? '#dd8640b0' : '#c3bc9770',
      );
    }
    for (let i = 0; i < 11; i++) {
      const angle = (i * Math.PI * 2) / 11;
      smallRock(ctx, Math.cos(angle) * 19, Math.sin(angle) * 8, 3.9 + Math.sin(i) * 0.5);
    }
    line(
      ctx,
      [
        [-10, 1],
        [10, -3],
      ],
      '#3f3428',
      5.6,
    );
    line(
      ctx,
      [
        [-9, -2],
        [9, 3],
      ],
      '#715338',
      5.1,
    );
    line(
      ctx,
      [
        [-9, -3],
        [8, 2],
      ],
      '#cf9f65',
      1.4,
    );
    oval(ctx, 9, 3, 2.2, 1.9, '#a68454');
    oval(ctx, 9, 3, 0.9, 1.1, '#4b3d2c');
    line(
      ctx,
      [
        [-10, 0],
        [-7, 0.5],
      ],
      active ? '#d98a4b' : '#a09d7e',
      1.2,
    );
  }
  if (!active) {
    oval(ctx, 0, 0, width * 0.6, width * 0.25, '#abb1a05c');
    for (let i = 0; i < 7; i++)
      oval(ctx, Math.sin(i * 2.1) * 9, Math.cos(i * 1.7) * 3, 1.1, 0.5, '#c1bda080');
    return;
  }
  const glow = ctx.createRadialGradient(0, -7, 1, 0, -7, small ? 17 : 42);
  glow.addColorStop(0, '#ffd78788');
  glow.addColorStop(0.45, '#e8a2493c');
  glow.addColorStop(1, '#da953d00');
  oval(ctx, 0, -3, small ? 17 : 42, small ? 13 : 30, glow);
  for (let i = 0; i < (small ? 3 : 5); i++) {
    const x = (i - (small ? 1 : 2)) * (small ? 3 : 3.3);
    const height =
      (small ? 10 : 25) + Math.sin(time * 7 + i * 1.9) * 4 + Math.cos(time * 11 + i) * 2;
    const drift = Math.sin(time * 4 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 4, 1);
    ctx.bezierCurveTo(x - 9, -height * 0.25, x + drift - 4, -height * 0.6, x + drift, -height);
    ctx.bezierCurveTo(x + drift + 2, -height * 0.6, x + 7, -height * 0.25, x + 4, 1);
    ctx.closePath();
    ctx.fillStyle = gradient(ctx, ['#e6a850', '#f5bf65', '#c36532'], x, -height, 1, height);
    ctx.fill();
    if (i % 2) {
      ctx.beginPath();
      ctx.moveTo(x - 2, 1);
      ctx.quadraticCurveTo(x - 3, -height * 0.3, x + 1, -height * 0.65);
      ctx.quadraticCurveTo(x + 5, -height * 0.2, x + 2, 1);
      ctx.fillStyle = '#fff2bd';
      ctx.fill();
    }
  }
  for (let i = 0; i < (small ? 3 : 7); i++) {
    const phase = (time * 0.24 + i / 7) % 1;
    const x = Math.sin(time * 1.3 + i * 2.2) * (2 + phase * 10);
    oval(
      ctx,
      x,
      -12 - phase * 48,
      0.35 + phase * 0.5,
      0.7,
      `rgba(240, 174, 80, ${(1 - phase) * 0.7})`,
    );
  }
  // Smoke is drawn once by the fog-clipped, bounded atmosphere layer.
}
function farmland(ctx: CanvasRenderingContext2D, time: number, season: number) {
  shadow(ctx, 37);
  const winter = season === 3,
    ripe = season === 1 || season === 2;
  material(
    ctx,
    [
      [-37, -10],
      [6, -30],
      [40, 2],
      [-7, 23],
    ],
    winter ? ['#c5bea0', '#a7aa91', '#76866f'] : ['#bd9b69', '#97754d', '#5b6546'],
    'hide',
    12,
  );
  for (let row = 0; row < 7; row++) {
    const x = -31 + row * 6,
      y = -7 - row * 2.7;
    line(
      ctx,
      [
        [x, y + 1],
        [x + 27, y + 25],
      ],
      '#40543c88',
      2.5,
    );
    line(
      ctx,
      [
        [x + 1, y - 1],
        [x + 28, y + 23],
      ],
      '#e2bd8688',
      1.2,
    );
    for (let plant = 0; plant < 5; plant++) {
      const px = x + plant * 5 + 2,
        py = y + plant * 4.7;
      const lean = Math.sin(time * 1.3 + plant * 1.7 + row) * 0.6;
      line(
        ctx,
        [
          [px, py],
          [px - 0.5 + lean, py - (winter ? 2.5 : 6)],
        ],
        winter ? '#e0d7bb' : ripe ? '#ad8b44' : '#5a7b40',
        1.05,
      );
      if (!winter) {
        line(
          ctx,
          [
            [px + lean, py - 3],
            [px - 2 + lean, py - 5],
          ],
          ripe ? '#ecd391' : '#9ab463',
          1.1,
        );
        line(
          ctx,
          [
            [px + lean, py - 2],
            [px + 2.5 + lean, py - 4],
          ],
          ripe ? '#d5b469' : '#bacb83',
          0.95,
        );
        if (ripe) {
          oval(ctx, px - 0.5 + lean, py - 6, 1.1, 2.2, '#dbbf79');
          line(
            ctx,
            [
              [px - 0.5 + lean, py - 7.7],
              [px - 0.5 + lean, py - 3.9],
            ],
            '#f6dfa168',
            0.5,
          );
        }
      }
    }
  }
}
function pen(ctx: CanvasRenderingContext2D, building: Building, time: number) {
  shadow(ctx, 35);
  oval(ctx, 0, 1, 33, 15, '#aa9e6836');
  const railing = (front: boolean) => {
    for (let i = 0; i < 13; i++) {
      const a = (i * Math.PI * 2) / 13;
      if (Math.sin(a) > 0 !== front) continue;
      const x = Math.cos(a) * 33,
        y = Math.sin(a) * 15;
      timber(ctx, x, y, 16, 2);
      line(
        ctx,
        [
          [x - 1, y - 13],
          [Math.cos(a + (Math.PI * 2) / 13) * 33, Math.sin(a + (Math.PI * 2) / 13) * 15 - 13],
        ],
        '#a38a5a',
        1.3,
      );
    }
  };
  railing(false);
  for (let i = 0; i < Math.min(3, Math.max(0, Math.floor(building.livestock ?? 0))); i++) {
    const x = -12 + i * 12,
      y = (i % 2) * 7 - 1;
    const bob = building.active ? Math.sin(time * 1.5 + i) * 0.25 : 0;
    oval(ctx, x, y - 5 + bob, 7.5, 4.2, gradient(ctx, ['#c9ba94', '#a99d7e', '#7f8266']));
    oval(ctx, x + 7, y - 7 + bob, 3, 3.1, '#8c8d6f');
    for (const dx of [-4, 3])
      line(
        ctx,
        [
          [x + dx, y - 4],
          [x + dx - 0.3, y + 2],
        ],
        '#656c50',
        1.1,
      );
    line(
      ctx,
      [
        [x + 6, y - 9],
        [x + 6, y - 12],
      ],
      '#d5c8a5',
      0.8,
    );
  }
  railing(true);
}
function wheel(ctx: CanvasRenderingContext2D, time: number, active: boolean) {
  ctx.save();
  ctx.translate(28, -5);
  ctx.rotate(active ? time * 0.17 : 0);
  ctx.strokeStyle = '#645d40';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#b09a67';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-0.5, -0.5, 14.5, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(
      ctx,
      [
        [0, 0],
        [Math.cos(a) * 14, Math.sin(a) * 14],
      ],
      '#ad9561',
      1.6,
    );
  }
  oval(ctx, 0, 0, 3.5, 3.5, '#5f6749');
  oval(ctx, -0.6, -0.8, 1.6, 1.6, '#c7ac77');
  ctx.restore();
}
function scaffold(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 31);
  for (const x of [-25, 0, 24]) timber(ctx, x, 3 + x * 0.05, 35 + (x === 0 ? 14 : 0), 2.4);
  line(
    ctx,
    [
      [-25, -29],
      [0, -46],
      [24, -29],
    ],
    '#ab8d5b',
    2.5,
  );
  line(
    ctx,
    [
      [-24, -29],
      [24, -29],
    ],
    '#806b48',
    2,
  );
  for (let i = 0; i < 4; i++)
    line(
      ctx,
      [
        [-18, 2 + i * 2],
        [13, i * 2],
      ],
      '#ae9467',
      2.8,
    );
}

/** Local-foot building artwork. The caller owns world projection and game-state visibility. */
export function drawPainterlyBuilding(
  ctx: CanvasRenderingContext2D,
  building: Building,
  time: number,
  options: { producing?: boolean; season?: number } = {},
): boolean {
  if (!supported.has(building.kind)) return false;
  ctx.save();
  if (building.completed === false) {
    scaffold(ctx);
  } else if (building.kind === 'campfire') {
    fire(ctx, time, building.active);
  } else if (building.kind === 'farm') {
    farmland(ctx, time, options.season ?? 0);
  } else if (building.kind === 'pen') {
    pen(ctx, building, time);
  } else {
    let art = textures.get(building.kind);
    if (!art) {
      art = document.createElement('canvas');
      art.width = 384;
      art.height = 432;
      const brush = art.getContext('2d')!;
      brush.scale(3, 3);
      brush.translate(64, 110);
      staticStructure(brush, building.kind);
      textures.set(building.kind, art);
    }
    ctx.drawImage(art, -64, -110, 128, 144);
    if (building.kind === 'foundry' && building.active && options.producing !== false) {
      ctx.save();
      ctx.translate(-3, 0);
      fire(ctx, time, true, true);
      ctx.restore();
    }
    if (building.kind === 'workshop') wheel(ctx, time, building.active);
  }
  const damage = 1 - building.hp / BUILDING_SPECS[building.kind].maxHp;
  if (
    damage > 0.25 &&
    building.kind !== 'farm' &&
    building.kind !== 'pen' &&
    building.kind !== 'campfire'
  ) {
    line(
      ctx,
      [
        [-16, -22],
        [-12, -18],
        [-15, -13],
        [-10, -8],
      ],
      '#4e594654',
      0.8,
    );
    if (damage > 0.6)
      line(
        ctx,
        [
          [10, -25],
          [7, -19],
          [12, -16],
          [9, -11],
        ],
        '#4b574963',
        0.9,
      );
  }
  if (!building.active && building.kind !== 'campfire') {
    oval(ctx, 24, -31, 4.8, 4.8, '#ae805b');
    ctx.fillStyle = '#f1e6c8';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 24, -28.5);
  }
  ctx.restore();
  return true;
}
