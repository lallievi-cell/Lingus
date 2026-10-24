import type { MapEntity } from '../game/types';

/** Illustrated natural objects. Coordinates are local to the real ground anchor. */
type Point = [number, number];
type Random = () => number;
type Bounds = [number, number, number, number];
type Sprite = { canvas: HTMLCanvasElement; bounds: Bounds };
const sprites = new Map<string, Sprite>();
// A revealed world can show all eight variants of both live/exhausted resources
// and living/dead animals at once. Keep that working set resident, while older
// seasonal artwork is still evicted instead of accumulating across games.
const MAX_SPRITES = 128;
const PIXELS = 3;

function seedOf(value: string) {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) seed = Math.imul(seed ^ value.charCodeAt(i), 16777619);
  return seed >>> 0;
}
function randomFrom(seed: number): Random {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasGradient) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
  angle = 0,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function stroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function shade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  opacity = 0.2,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const paint = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  paint.addColorStop(0, `rgba(34, 43, 28, ${opacity})`);
  paint.addColorStop(0.55, `rgba(39, 48, 31, ${opacity * 0.55})`);
  paint.addColorStop(1, 'rgba(39, 48, 31, 0)');
  ellipse(ctx, 0, 0, 1, 1, paint);
  ctx.restore();
}
function cache(key: string, bounds: Bounds, paint: (ctx: CanvasRenderingContext2D) => void) {
  let sprite = sprites.get(key);
  if (!sprite) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(bounds[2] * PIXELS);
    canvas.height = Math.ceil(bounds[3] * PIXELS);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(PIXELS, PIXELS);
    ctx.translate(-bounds[0], -bounds[1]);
    paint(ctx);
    sprite = { canvas, bounds };
    if (sprites.size >= MAX_SPRITES) sprites.delete(sprites.keys().next().value!);
  } else sprites.delete(key);
  sprites.set(key, sprite);
  return sprite;
}
function show(ctx: CanvasRenderingContext2D, sprite: Sprite) {
  ctx.drawImage(sprite.canvas, ...sprite.bounds);
}

/** A scalloped brush silhouette, rather than a stack of regular circles. */
function foliage(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  random: Random,
  colors: string[],
) {
  const points: Point[] = [];
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    const radius = 0.83 + random() * 0.27;
    points.push([x + Math.cos(angle) * rx * radius, y + Math.sin(angle) * ry * radius]);
  }
  const gradient = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
  gradient.addColorStop(0, colors[2]);
  gradient.addColorStop(0.48, colors[1]);
  gradient.addColorStop(1, colors[0]);
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const point = points[i],
      next = points[(i + 1) % points.length];
    if (!i) ctx.moveTo((point[0] + points.at(-1)![0]) / 2, (point[1] + points.at(-1)![1]) / 2);
    ctx.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2);
  }
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2,
      radius = Math.sqrt(random()) * 0.82;
    const px = x + Math.cos(angle) * radius * rx,
      py = y + Math.sin(angle) * radius * ry;
    ellipse(
      ctx,
      px,
      py,
      0.7 + random() * 1.3,
      0.35 + random() * 0.6,
      colors[1 + (i % 2)],
      random() * 1.4 - 0.7,
    );
  }
}

function paintTree(
  ctx: CanvasRenderingContext2D,
  variant: number,
  season: number,
  unknown: boolean,
  exhausted: boolean,
) {
  const random = randomFrom(variant * 281 + 1827);
  const winter = season === 3,
    autumn = season === 2;
  const bark = unknown ? '#7c8077' : variant % 3 === 1 ? '#b8b59a' : '#766348';
  shade(ctx, 7, 3, 31, 10, 0.17);
  if (exhausted) {
    polygon(
      ctx,
      [
        [-8, 0],
        [-7, -11],
        [5, -13],
        [9, -2],
        [6, 2],
      ],
      bark,
    );
    ellipse(ctx, 0, -11.5, 7, 2.8, unknown ? '#bec0b2' : '#c8ad76', -0.07);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-0.7, -11.5, 2 + i * 1.6, 0.7 + i * 0.45, -0.07, 0, Math.PI * 2);
      ctx.strokeStyle = unknown ? '#8d9487' : '#9f875e';
      ctx.lineWidth = 0.35;
      ctx.stroke();
    }
    stroke(
      ctx,
      [
        [-5, -8],
        [-5.5, -1],
      ],
      '#514d3c88',
      0.7,
    );
    stroke(
      ctx,
      [
        [3, -9],
        [5, -1],
      ],
      '#514d3c88',
      0.6,
    );
    for (let i = 0; i < 8; i++) {
      const angle = random() * Math.PI * 2;
      polygon(
        ctx,
        [
          [Math.cos(angle) * 10, Math.sin(angle) * 3],
          [Math.cos(angle) * 16 + 2, Math.sin(angle) * 5],
          [Math.cos(angle) * 13 - 2, Math.sin(angle) * 5 + 1],
        ],
        unknown ? '#acafa0' : '#b89d6b',
      );
    }
    return;
  }
  polygon(
    ctx,
    [
      [-7, 1],
      [-3, -9],
      [-2, -32],
      [1, -42],
      [4, -27],
      [3, -8],
      [9, 2],
      [3, 0],
      [0, -6],
      [-2, 1],
    ],
    bark,
  );
  stroke(
    ctx,
    [
      [-2, -3],
      [-0.5, -25],
      [1, -39],
    ],
    unknown ? '#b5b7a9' : '#c1b18a',
    1.2,
  );
  stroke(
    ctx,
    [
      [1, -19],
      [-9, -28],
      [-15, -32],
    ],
    unknown ? '#6b7169' : '#655d43',
    1.8,
  );
  stroke(
    ctx,
    [
      [2, -25],
      [12, -33],
      [17, -40],
    ],
    unknown ? '#6b7169' : '#655d43',
    1.5,
  );
  for (let i = 0; i < 9; i++) {
    const y = -3 - random() * 31;
    stroke(
      ctx,
      [
        [-1.5, y],
        [2.2, y - 0.9],
      ],
      unknown ? '#5d645e88' : '#544b3c88',
      0.6,
    );
  }
  const colors = unknown
    ? ['#606d67', '#8c9990', '#bac2b1']
    : winter
      ? ['#506b5b', '#778d76', '#bac5a6']
      : autumn
        ? ['#6b663b', '#a18d42', '#c5b472']
        : ['#35583e', '#5d7c46', '#9bb16e'];
  if (variant % 4 === 0) {
    // Individual boughs break up the conifer's outline and expose its trunk.
    for (let tier = 0; tier < 7; tier++) {
      const y = -62 + tier * 6.6,
        width = 4 + tier * 3;
      const points: Point[] = [[0, y - 8]];
      for (let side = -1; side <= 1; side += 2) {
        for (let index = 0; index < 6; index++) {
          const fraction = index / 5;
          points.push([side * width * fraction, y + fraction * 6 + random() * 2]);
        }
        points.push([side * width * 0.5, y + 5], [side * width * 0.2, y + 2]);
      }
      polygon(ctx, points, colors[tier % 2]);
      stroke(
        ctx,
        [
          [-width * 0.7, y + 4],
          [-2, y - 1],
          [width * 0.55, y + 3],
        ],
        colors[2] + 'b0',
        0.8,
      );
      for (let i = 0; i < 11; i++) {
        const px = (random() - 0.5) * width * 1.6;
        stroke(
          ctx,
          [
            [px, y + 1 + Math.abs(px) * 0.2],
            [px + (random() - 0.5) * 3, y + 3.8 + Math.abs(px) * 0.2],
          ],
          colors[i % 3],
          0.6,
        );
      }
    }
  } else {
    const crowns = [
      [-12, -36, 14, 13],
      [13, -39, 15, 14],
      [-17, -47, 13, 12],
      [5, -54, 17, 13],
      [-8, -59, 14, 12],
      [18, -52, 12, 12],
    ];
    for (const [x, y, rx, ry] of crowns) foliage(ctx, x + random() * 3, y, rx, ry, random, colors);
    stroke(
      ctx,
      [
        [-6, -33],
        [-11, -42],
      ],
      colors[0] + '99',
      0.8,
    );
    stroke(
      ctx,
      [
        [9, -37],
        [14, -44],
      ],
      colors[0] + '99',
      0.7,
    );
  }
  if (winter) {
    for (let i = 0; i < 14; i++)
      ellipse(
        ctx,
        (random() - 0.5) * 38,
        -33 - random() * 29,
        1.8 + random() * 3.2,
        0.6 + random(),
        '#e2e5ccac',
        -0.15,
      );
  }
  for (let i = 0; i < 7; i++) {
    const x = (random() - 0.5) * 17;
    stroke(
      ctx,
      [
        [x, 2],
        [x + random() * 2 - 1, -2 - random() * 3],
      ],
      unknown ? '#909b7b99' : '#71825099',
      0.6,
    );
  }
}

function paintBerries(
  ctx: CanvasRenderingContext2D,
  variant: number,
  season: number,
  exhausted: boolean,
) {
  const random = randomFrom(5783 + variant * 375);
  const colors =
    season === 3
      ? ['#60705d', '#82917a', '#a8b099']
      : season === 2
        ? ['#4d633b', '#77834a', '#a0aa67']
        : ['#36593b', '#5a7943', '#8fa35f'];
  shade(ctx, 5, 3, 29, 9, 0.2);
  for (let i = 0; i < 7; i++) {
    const x = (random() - 0.5) * 32;
    stroke(
      ctx,
      [
        [0, 0],
        [x * 0.4, -11],
        [x, -21 - random() * 6],
      ],
      '#6a6342',
      0.8 + random() * 0.4,
    );
  }
  for (const [x, y, rx, ry] of [
    [-13, -11, 12, 10],
    [12, -14, 12, 11],
    [0, -22, 13, 12],
    [-3, -6, 15, 8],
  ])
    foliage(ctx, x, y, rx, ry, random, colors);
  if (!exhausted && season !== 3) {
    for (let i = 0; i < 17; i++) {
      const x = (random() - 0.5) * 35,
        y = -7 - random() * 23;
      ellipse(ctx, x + 0.4, y + 0.7, 1.6, 1.55, '#482d25cc');
      ellipse(ctx, x, y, 1.35, 1.5, i % 3 ? '#9d493a' : '#be6550', -0.16);
      ellipse(ctx, x - 0.35, y - 0.55, 0.37, 0.4, '#e7aa76b0');
      stroke(
        ctx,
        [
          [x - 0.7, y - 1.2],
          [x + 0.6, y - 1.5],
        ],
        '#4c6837',
        0.5,
      );
    }
  }
  if (season === 3)
    for (let i = 0; i < 9; i++)
      ellipse(ctx, (random() - 0.5) * 33, -12 - random() * 18, 2.4, 0.8, '#dfe3cd99', -0.1);
}

function paintRock(
  ctx: CanvasRenderingContext2D,
  variant: number,
  unknown: boolean,
  ore: boolean,
  exhausted: boolean,
) {
  const random = randomFrom(8933 + variant * 119);
  shade(ctx, 5, 4, 38, 10, 0.22);
  const colors = unknown
    ? ['#697571', '#8a9690', '#b2bbb0', '#d4d7c4']
    : ['#64766d', '#89968a', '#b4ba9e', '#d5d4b7'];
  if (exhausted) {
    for (let i = 0; i < 6; i++) {
      const x = (random() - 0.5) * 38,
        y = random() * 7 - 4;
      polygon(
        ctx,
        [
          [x - 5, y],
          [x - 2, y - 5],
          [x + 4, y - 3],
          [x + 6, y + 2],
          [x, y + 3],
        ],
        colors[i % 3],
      );
      stroke(
        ctx,
        [
          [x - 3, y - 1],
          [x - 1, y - 3],
          [x + 3, y - 2],
        ],
        colors[3],
        0.6,
      );
    }
    return;
  }
  const peak = -28 - (variant % 3) * 3;
  const body = ctx.createLinearGradient(-22, -31, 19, 8);
  body.addColorStop(0, colors[2]);
  body.addColorStop(0.4, colors[1]);
  body.addColorStop(1, colors[0]);
  polygon(
    ctx,
    [
      [-31, 1],
      [-28, -9],
      [-20, -14],
      [-14, peak + 7],
      [-4, peak + 5],
      [4, peak],
      [15, peak + 7],
      [24, -11],
      [28, -8],
      [31, 4],
      [21, 9],
      [-11, 8],
    ],
    body,
  );
  polygon(
    ctx,
    [
      [-27, -9],
      [-14, peak + 7],
      [-4, peak + 5],
      [4, peak],
      [15, peak + 7],
      [8, -13],
      [-7, -9],
    ],
    colors[2],
  );
  polygon(
    ctx,
    [
      [8, -13],
      [15, peak + 7],
      [24, -11],
      [28, -8],
      [31, 4],
      [16, 5],
    ],
    colors[0],
  );
  polygon(
    ctx,
    [
      [-30, 1],
      [-20, -3],
      [-10, 3],
      [-11, 8],
      [-28, 5],
    ],
    colors[0] + '99',
  );
  stroke(
    ctx,
    [
      [-25, -9],
      [-14, peak + 8],
      [-4, peak + 6],
      [4, peak + 1],
      [14, peak + 8],
    ],
    colors[3],
    0.8,
  );
  stroke(
    ctx,
    [
      [7, -13],
      [3, -4],
      [7, 5],
    ],
    '#45574f99',
    0.9,
  );
  stroke(
    ctx,
    [
      [-11, -11],
      [-14, -4],
      [-10, 4],
    ],
    '#52615899',
    0.7,
  );
  stroke(
    ctx,
    [
      [16, -16],
      [23, -10],
      [25, -2],
    ],
    '#bac0a590',
    0.7,
  );
  for (let i = 0; i < 35; i++) {
    const x = (random() - 0.5) * 43,
      y = -2 - random() * 16;
    ellipse(
      ctx,
      x,
      y,
      0.25 + random() * 0.5,
      0.2 + random() * 0.4,
      i % 2 ? '#dae0c355' : '#42594d44',
    );
  }
  for (let i = 0; i < 6; i++) {
    const x = (random() - 0.5) * 33;
    stroke(
      ctx,
      [
        [x, -6],
        [x + 4, -8],
      ],
      '#c6cbae77',
      0.45,
    );
  }
  if (ore) {
    stroke(
      ctx,
      [
        [-20, -6],
        [-11, -12],
        [-5, -8],
        [6, -17],
        [13, -12],
      ],
      '#395f52',
      2.5,
    );
    stroke(
      ctx,
      [
        [-20, -6],
        [-11, -12],
        [-5, -8],
        [6, -17],
        [13, -12],
      ],
      '#7ba18a',
      1.15,
    );
    stroke(
      ctx,
      [
        [2, -8],
        [8, 0],
        [17, 3],
      ],
      '#b3ab6e',
      1.3,
    );
    for (let i = 0; i < 8; i++)
      ellipse(ctx, random() * 24 - 10, -4 - random() * 11, 0.6, 0.4, '#d6c58fa0', -0.5);
  } else {
    ellipse(ctx, -17, -5, 4, 1.7, '#7d8d5666', -0.1);
    ellipse(ctx, 12, 4, 3, 1.2, '#7d8d5644');
  }
}

function animalBody(
  ctx: CanvasRenderingContext2D,
  kind: string,
  variant: number,
  dead: boolean,
  winter: boolean,
) {
  const random = randomFrom(variant * 381 + 4829);
  const mammoth = kind === 'mammoth',
    wolf = kind === 'wolf' || kind === 'alpha';
  const dark = mammoth ? '#4f4032' : wolf ? '#4b5751' : '#6c4d32';
  const coat = mammoth ? '#826648' : wolf ? '#8b9688' : '#b28b58';
  if (dead) {
    shade(ctx, 3, 2, mammoth ? 43 : 28, 9, 0.23);
    const size = mammoth ? 1.5 : kind === 'alpha' ? 1.2 : 1;
    ctx.scale(size, size);
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.bezierCurveTo(-19, -16, 6, -15, 14, -7);
    ctx.bezierCurveTo(21, -8, 27, -2, 22, 2);
    ctx.bezierCurveTo(12, 8, -12, 8, -20, -2);
    ctx.closePath();
    ctx.fillStyle = coat;
    ctx.fill();
    stroke(
      ctx,
      [
        [-11, 2],
        [-16, 9],
        [-23, 9],
      ],
      dark,
      2,
    );
    stroke(
      ctx,
      [
        [7, 3],
        [12, 10],
        [19, 9],
      ],
      dark,
      2,
    );
    stroke(
      ctx,
      [
        [19, -2],
        [22, -1],
      ],
      '#382f28',
      1,
    );
    stroke(
      ctx,
      [
        [-4, -9],
        [-5, 2],
      ],
      '#d8c8a4',
      1,
    );
    stroke(
      ctx,
      [
        [1, -9],
        [0, 2],
      ],
      '#d8c8a4',
      1,
    );
    stroke(
      ctx,
      [
        [6, -8],
        [5, 2],
      ],
      '#d8c8a4',
      1,
    );
    return;
  }
  if (mammoth) {
    const gradient = ctx.createLinearGradient(-30, -53, 30, -4);
    gradient.addColorStop(0, '#aa8b5c');
    gradient.addColorStop(0.5, '#806247');
    gradient.addColorStop(1, '#564432');
    ctx.beginPath();
    ctx.moveTo(-33, -14);
    ctx.bezierCurveTo(-40, -44, -20, -57, -7, -48);
    ctx.bezierCurveTo(8, -56, 23, -45, 25, -32);
    ctx.bezierCurveTo(40, -29, 33, -11, 22, -10);
    ctx.bezierCurveTo(3, -2, -24, 0, -33, -14);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(27, -32);
    ctx.bezierCurveTo(40, -23, 27, -2, 37, 0);
    ctx.bezierCurveTo(43, 1, 44, -7, 41, -11);
    ctx.strokeStyle = '#6c513c';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(25, -21);
    ctx.bezierCurveTo(35, -9, 43, -8, 44, -20);
    ctx.strokeStyle = '#d9cdaa';
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(23, -20);
    ctx.bezierCurveTo(31, -8, 37, -6, 40, -14);
    ctx.strokeStyle = '#f0e5c6';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ellipse(ctx, 16, -33, 8, 12, '#65503b', -0.18);
    ellipse(ctx, 14, -35, 5.2, 8, '#947450', -0.18);
    ellipse(ctx, 27, -34, 1.2, 1.1, '#292c23');
    for (let i = 0; i < 48; i++) {
      const x = -29 + random() * 47,
        y = -16 - random() * 26;
      stroke(
        ctx,
        [
          [x, y],
          [x - 0.3 + random(), y + 2 + random() * 5],
        ],
        i % 3 ? '#4c3e3050' : '#c1a16c77',
        0.65,
      );
    }
    stroke(
      ctx,
      [
        [-34, -22],
        [-42, -13],
        [-43, -5],
      ],
      dark,
      1.5,
    );
    return;
  }
  const gradient = ctx.createLinearGradient(-16, -29, 15, -7);
  gradient.addColorStop(0, winter && wolf ? '#a4afa1' : wolf ? '#b1b49d' : '#d1ad77');
  gradient.addColorStop(0.45, coat);
  gradient.addColorStop(1, dark);
  if (wolf) {
    ctx.beginPath();
    ctx.moveTo(-21, -15);
    ctx.bezierCurveTo(-22, -26, -8, -26, 1, -22);
    ctx.bezierCurveTo(10, -27, 16, -24, 17, -20);
    ctx.lineTo(30, -16);
    ctx.lineTo(32, -13);
    ctx.lineTo(20, -12);
    ctx.bezierCurveTo(13, -7, 10, -5, 5, -8);
    ctx.bezierCurveTo(-5, -4, -18, -7, -21, -15);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    polygon(
      ctx,
      [
        [11, -21],
        [10, -32],
        [17, -25],
        [20, -29],
        [22, -20],
      ],
      '#667263',
    );
    polygon(
      ctx,
      [
        [12, -24],
        [12, -29],
        [15.4, -25],
      ],
      '#c0b69a',
    );
    stroke(
      ctx,
      [
        [-20, -15],
        [-28, -12],
        [-32, -6],
      ],
      '#687565',
      4.6,
    );
    stroke(
      ctx,
      [
        [-28, -12],
        [-32, -6],
      ],
      '#a3a891',
      1.6,
    );
    stroke(
      ctx,
      [
        [18, -12],
        [26, -12],
      ],
      '#b9b69b',
      1.3,
    );
    ellipse(ctx, 31, -15, 1.6, 1.2, '#30392f');
    ellipse(ctx, 20.5, -20, 0.9, 0.7, '#302f25');
  } else {
    ctx.beginPath();
    ctx.moveTo(-21, -16);
    ctx.bezierCurveTo(-19, -25, -4, -25, 6, -20);
    ctx.bezierCurveTo(12, -20, 12, -30, 17, -32);
    ctx.bezierCurveTo(21, -35, 28, -30, 30, -27);
    ctx.lineTo(32, -25);
    ctx.lineTo(27, -23);
    ctx.lineTo(20, -24);
    ctx.bezierCurveTo(19, -16, 16, -8, 7, -8);
    ctx.bezierCurveTo(-5, -5, -20, -9, -21, -16);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.bezierCurveTo(5, -8, 12, -14, 16, -23);
    ctx.strokeStyle = '#dbc39a';
    ctx.lineWidth = 2;
    ctx.stroke();
    polygon(
      ctx,
      [
        [18, -29],
        [11, -34],
        [10, -38],
        [18, -35],
        [20, -31],
      ],
      '#a28b60',
    );
    polygon(
      ctx,
      [
        [23, -30],
        [25, -37],
        [29, -37],
        [26, -31],
      ],
      '#b69b6f',
    );
    stroke(
      ctx,
      [
        [-21, -17],
        [-25, -20],
        [-24, -15],
      ],
      '#e0d2ad',
      2.7,
    );
    ellipse(ctx, 26, -28.4, 0.85, 0.8, '#322d23');
    ellipse(ctx, 31, -25.5, 1, 0.7, '#4a3c2d');
    if (variant % 3 !== 1) {
      stroke(
        ctx,
        [
          [19, -32],
          [16, -38],
          [16, -43],
          [14, -46],
        ],
        '#6b6246',
        0.9,
      );
      stroke(
        ctx,
        [
          [16, -39],
          [11, -42],
          [10, -45],
        ],
        '#6b6246',
        0.75,
      );
      stroke(
        ctx,
        [
          [16, -41],
          [20, -44],
        ],
        '#6b6246',
        0.7,
      );
      stroke(
        ctx,
        [
          [23, -32],
          [25, -40],
          [29, -44],
        ],
        '#827452',
        0.8,
      );
      stroke(
        ctx,
        [
          [25, -39],
          [23, -43],
        ],
        '#827452',
        0.7,
      );
    }
  }
  for (let i = 0; i < 25; i++) {
    const x = -17 + random() * 28,
      y = -12 - random() * 8;
    stroke(
      ctx,
      [
        [x, y],
        [x + 1 + random(), y + 1.4],
      ],
      i % 3 ? '#4c4e3525' : wolf ? '#d4d5b977' : '#ead1a077',
      0.6,
    );
  }
}

type Motion = {
  x: number;
  y: number;
  originX?: number;
  originY?: number;
  time: number;
  movingUntil: number;
  facing: number;
};
const motion = new Map<string, Motion>();
function animalMotion(entity: MapEntity, time: number) {
  let value = motion.get(entity.id);
  if (
    !value ||
    time < value.time ||
    value.originX !== entity.originX ||
    value.originY !== entity.originY
  ) {
    value = {
      x: entity.x,
      y: entity.y,
      originX: entity.originX,
      originY: entity.originY,
      time,
      movingUntil: -Infinity,
      facing: seedOf(entity.id) % 2 ? -1 : 1,
    };
    if (motion.size > 1024) motion.delete(motion.keys().next().value!);
  }
  const dx = entity.x - value.x,
    dy = entity.y - value.y;
  if (Math.hypot(dx, dy) > 0.0001) {
    if (Math.abs(dx) > 0.0001) value.facing = dx < 0 ? -1 : 1;
    value.movingUntil = time + 0.45;
  }
  value.x = entity.x;
  value.y = entity.y;
  value.time = time;
  motion.set(entity.id, value);
  return { moving: time < value.movingUntil, facing: value.facing };
}

function drawAnimal(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  time: number,
  season: number,
  variant: number,
) {
  const dead = entity.hp <= 0;
  const mammoth = entity.kind === 'mammoth',
    alpha = entity.kind === 'alpha';
  const bounds: Bounds = mammoth ? [-52, -64, 104, 82] : [-42, -50, 84, 66];
  const body = cache(
    `animal:${entity.kind}:${variant}:${season === 3}:${dead}`,
    bounds,
    (context) => animalBody(context, entity.kind, variant, dead, season === 3),
  );
  const pose = animalMotion(entity, time);
  ctx.save();
  ctx.scale(alpha ? 1.25 : 1, alpha ? 1.25 : 1);
  if (dead) {
    show(ctx, body);
    ctx.restore();
    return;
  }
  shade(ctx, 4, 3, mammoth ? 44 : 30, mammoth ? 10 : 7, 0.19);
  ctx.scale(pose.facing, 1);
  const gait = pose.moving ? Math.sin(time * (mammoth ? 5 : 8) + variant) : 0;
  const isDeer = entity.kind === 'deer';
  const legColor = mammoth ? '#5d4936' : isDeer ? '#765333' : '#596454';
  const legs = mammoth ? [-25, -15, 12, 21] : [-15, -9, 8, 13];
  for (const [index, x] of legs.entries()) {
    const offset = gait * (index % 2 ? 3 : -3);
    const hip = mammoth ? -17 : -12,
      knee = mammoth ? -7 : -5;
    const color = index % 2 ? legColor : mammoth ? '#85694a' : isDeer ? '#b48e5b' : '#899680';
    stroke(
      ctx,
      [
        [x, hip],
        [x + offset * 0.35 + (x < 0 ? -1 : 1), knee],
        [x + offset, 1],
        [x + offset + 2, 1],
      ],
      color,
      mammoth ? 6 : isDeer ? 1.7 : 2.1,
    );
    if (isDeer)
      stroke(
        ctx,
        [
          [x + offset - 0.5, 0],
          [x + offset + 2, 0.5],
        ],
        '#4b4230',
        1.4,
      );
  }
  ctx.translate(
    0,
    Math.sin(time * 1.7 + variant) * 0.17 + (pose.moving ? Math.abs(gait) * 0.5 : 0),
  );
  show(ctx, body);
  ctx.restore();
}

/** The caller already applies SPRITE_SCALE and translates to entity.x/y. */
export function drawPainterlyNature(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  time: number,
  seasonIndex: number,
  unknown: boolean,
): boolean {
  const variant = seedOf(entity.id) % 8,
    season = seasonIndex % 4;
  if (['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind)) {
    drawAnimal(ctx, entity, time, season, variant);
    return true;
  }
  if (entity.kind === 'tree') {
    show(
      ctx,
      cache(
        `tree:${variant}:${season}:${unknown}:${entity.amount <= 0}`,
        [-39, -78, 80, 94],
        (context) => paintTree(context, variant, season, unknown, entity.amount <= 0),
      ),
    );
    return true;
  }
  if (entity.kind === 'berries') {
    show(
      ctx,
      cache(`berries:${variant}:${season}:${entity.amount <= 0}`, [-34, -42, 70, 57], (context) =>
        paintBerries(context, variant, season, entity.amount <= 0),
      ),
    );
    return true;
  }
  if (entity.kind === 'stone' || entity.kind === 'ore') {
    show(
      ctx,
      cache(
        `rock:${variant}:${unknown}:${entity.kind}:${entity.amount <= 0}`,
        [-43, -42, 88, 59],
        (context) =>
          paintRock(context, variant, unknown, entity.kind === 'ore', entity.amount <= 0),
      ),
    );
    return true;
  }
  if (entity.kind === 'seedling') {
    shade(ctx, 2, 2, 10, 4, 0.1);
    stroke(
      ctx,
      [
        [0, 1],
        [-1, -10],
        [2, -19],
      ],
      '#687546',
      1.2,
    );
    ellipse(ctx, -5, -12, 5.5, 2, '#839a58', 0.5);
    ellipse(ctx, 6, -17, 5, 2.1, '#9bae66', -0.5);
    stroke(
      ctx,
      [
        [-7, -13],
        [-2, -11],
      ],
      '#bcc38c',
      0.45,
    );
    return true;
  }
  if (entity.kind === 'corpse') {
    shade(ctx, 2, 2, 13, 4, 0.15);
    ctx.beginPath();
    ctx.moveTo(-9, 1);
    ctx.bezierCurveTo(-10, -6, 3, -8, 8, -4);
    ctx.lineTo(9, 2);
    ctx.closePath();
    ctx.fillStyle = '#82725b';
    ctx.fill();
    stroke(
      ctx,
      [
        [-7, -3],
        [6, 0],
      ],
      '#c5b99a',
      0.9,
    );
    ellipse(ctx, 10, -3, 3, 3.3, '#b5a086', -0.2);
    return true;
  }
  return false;
}
