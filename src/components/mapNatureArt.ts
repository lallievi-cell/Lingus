import type { MapEntity } from '../game/types';
import { observeAnimalAnimation, type AnimalAnimationContext } from './animalAnimation';
import { drawNaturalAtlas } from './mapNaturalAtlas';

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
  const dark = mammoth ? '#493a2b' : wolf ? '#35403b' : '#624534';
  const coat = mammoth ? '#8e6945' : wolf ? '#6e7769' : '#a8784d';
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
    ellipse(ctx, -5, -4, 13, 4, mammoth ? '#b49464' : wolf ? '#abb2a0' : '#cba267', -0.1);
    ellipse(ctx, 10, 0.8, 7, 3, '#493e315c', 0.1);
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
    gradient.addColorStop(0, '#d0a365');
    gradient.addColorStop(0.3, '#aa7e4c');
    gradient.addColorStop(0.68, '#79573c');
    gradient.addColorStop(1, '#483b2e');
    ctx.beginPath();
    ctx.moveTo(-33, -14);
    ctx.bezierCurveTo(-40, -44, -20, -57, -7, -48);
    ctx.bezierCurveTo(8, -56, 23, -45, 25, -32);
    ctx.bezierCurveTo(40, -29, 33, -11, 22, -10);
    ctx.bezierCurveTo(3, -2, -24, 0, -33, -14);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#473c2c';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Broad shoulder planes survive the normal play scale; fine hairs sit on top.
    ellipse(ctx, -17, -36, 13, 14, '#d0a66b5c', -0.55);
    ellipse(ctx, 10, -32, 11, 15, '#c7985e42', -0.25);
    polygon(
      ctx,
      [
        [-34, -22],
        [-23, -16],
        [-6, -14],
        [6, -20],
        [15, -11],
        [2, -7],
        [-20, -5],
      ],
      '#4f3c2f65',
    );
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
        i % 3 ? '#4d392c70' : '#e1bd7c90',
        i % 3 ? 0.7 : 1,
      );
    }
    return;
  }
  if (wolf) wolfBody(ctx, winter);
  else deerBody(ctx, winter);
}

function deerBody(ctx: CanvasRenderingContext2D, winter: boolean) {
  const coat = ctx.createLinearGradient(-13, -27, 8, -8);
  coat.addColorStop(0, winter ? '#bcaa8b' : '#d9aa71');
  coat.addColorStop(0.47, winter ? '#967d65' : '#a8784d');
  coat.addColorStop(1, '#624534');
  ctx.beginPath();
  ctx.moveTo(-21.8, -16.4);
  ctx.bezierCurveTo(-21.7, -24.5, -16.3, -26.5, -10.9, -25.1);
  ctx.bezierCurveTo(-5, -23.1, -0.7, -22.5, 4.7, -24.5);
  ctx.quadraticCurveTo(13.2, -27.3, 15.9, -19.6);
  ctx.quadraticCurveTo(19.7, -12.3, 12, -8.4);
  ctx.bezierCurveTo(5.5, -7.8, 2.9, -12.5, -8.7, -12.1);
  ctx.quadraticCurveTo(-16, -7.7, -21.8, -16.4);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  ctx.save();
  ctx.clip();
  polygon(
    ctx,
    [
      [-21.4, -18.5],
      [-18.7, -22.3],
      [-13.2, -22.5],
      [-9.8, -20.6],
      [-11.6, -16.3],
      [-15.1, -12],
      [-19.4, -12.7],
    ],
    '#d7be947d',
  );
  polygon(
    ctx,
    [
      [-18.3, -13.4],
      [-13.1, -15.7],
      [-2.7, -14.8],
      [4.2, -12.2],
      [10.5, -14],
      [10.5, -8],
      [-11.4, -9.6],
    ],
    '#dcc39d90',
  );
  polygon(
    ctx,
    [
      [0.7, -19.1],
      [8.4, -24.5],
      [15.8, -21],
      [16.6, -16],
      [14.3, -11.2],
      [9.8, -9],
      [7.6, -15.1],
    ],
    '#69453168',
  );
  stroke(
    ctx,
    [
      [-18.8, -24.4],
      [-11.6, -24.5],
      [-4.6, -23],
      [1.9, -23.4],
    ],
    '#f4cc8d8c',
    1.07,
  );
  stroke(
    ctx,
    [
      [-3.7, -16.3],
      [0.2, -15.8],
      [2.7, -14.9],
    ],
    '#6d493c92',
    0.77,
  );
  stroke(
    ctx,
    [
      [11.2, -20.4],
      [9.28, -16.7],
      [10.42, -13.8],
    ],
    '#d9b18491',
    1.2,
  );
  ctx.restore();
}

function wolfBody(ctx: CanvasRenderingContext2D, winter: boolean) {
  const coat = ctx.createLinearGradient(-11, -27, 7, -9);
  coat.addColorStop(0, winter ? '#a8ac9d' : '#939d91');
  coat.addColorStop(0.59, winter ? '#737a71' : '#5f6b61');
  coat.addColorStop(1, '#35403b');
  ctx.beginPath();
  ctx.moveTo(-21.2, -14.6);
  ctx.bezierCurveTo(-22, -23.5, -14.4, -25.7, -8.1, -24.1);
  ctx.quadraticCurveTo(0.3, -22.5, 5.5, -25.4);
  ctx.lineTo(8.6, -27.4);
  ctx.lineTo(9.2, -25.8);
  ctx.quadraticCurveTo(17.8, -28.2, 17.3, -16.6);
  ctx.lineTo(15.7, -12.1);
  ctx.lineTo(13.7, -12.4);
  ctx.quadraticCurveTo(11.4, -7.7, 6, -8.35);
  ctx.quadraticCurveTo(2.4, -10.5, -7.9, -13.1);
  ctx.quadraticCurveTo(-17.9, -7.6, -21.2, -14.6);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  ctx.save();
  ctx.clip();
  polygon(
    ctx,
    [
      [-20.7, -20.7],
      [-15.2, -25],
      [-7.25, -23.9],
      [-0.7, -22.6],
      [7.9, -27],
      [13.9, -24.3],
      [9.89, -20.8],
      [1.2, -18.3],
      [-5.6, -20.5],
      [-12.7, -19.1],
    ],
    '#303c37bf',
  );
  polygon(
    ctx,
    [
      [-22.6, -15.2],
      [-16.7, -20.2],
      [-12.7, -18.9],
      [-11.5, -15.2],
      [-14.2, -10.8],
      [-18.8, -10.33],
    ],
    '#b0afa08d',
  );
  polygon(
    ctx,
    [
      [5.5, -21.6],
      [10.8, -24.15],
      [16.1, -21],
      [16.35, -15.3],
      [12.1, -13.1],
      [10.4, -8.91],
      [7.5, -11.07],
      [6.5, -15.7],
      [3.3, -15.9],
    ],
    winter ? '#d4d4c2a6' : '#acae9c93',
  );
  polygon(
    ctx,
    [
      [-13.5, -16],
      [-2.3, -16.9],
      [5.4, -14.7],
      [7.64, -11.52],
      [-7.95, -12.7],
    ],
    '#d4c6a17e',
  );
  stroke(
    ctx,
    [
      [-18.3, -22.6],
      [-13.34, -23.46],
      [-7.78, -22.4],
    ],
    '#c8c6a3a1',
    0.85,
  );
  stroke(
    ctx,
    [
      [4.84, -22.5],
      [3.5, -19.36],
      [7.38, -17.17],
    ],
    '#d7cdb1a4',
    0.79,
  );
  stroke(
    ctx,
    [
      [9.36, -21.71],
      [8.75, -18.3],
      [11.13, -16.5],
    ],
    '#e4dbc5a6',
    0.66,
  );
  ctx.restore();
}

function deerHead(ctx: CanvasRenderingContext2D, variant: number, angle: number, alert: boolean) {
  ctx.save();
  ctx.translate(9, -17);
  ctx.rotate(angle);
  const coat = ctx.createLinearGradient(6, -15, 12, 5);
  coat.addColorStop(0, '#d9b182');
  coat.addColorStop(0.45, '#a77551');
  coat.addColorStop(1, '#644638');
  ctx.beginPath();
  ctx.moveTo(-4.85, 7);
  ctx.bezierCurveTo(1.5, 1.7, 1.69, -10.8, 7.4, -14.39);
  ctx.quadraticCurveTo(11.5, -17.3, 16.97, -12.43);
  ctx.lineTo(22.83, -9.38);
  ctx.quadraticCurveTo(24.32, -7.31, 21.26, -6.47);
  ctx.lineTo(15.55, -6.2);
  ctx.lineTo(11.7, -8);
  ctx.bezierCurveTo(9.4, -4.83, 8.73, 4.89, 5.62, 7.61);
  ctx.quadraticCurveTo(0.15, 10.27, -4.85, 7);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  polygon(
    ctx,
    [
      [17.69, -10.9],
      [22.1, -9.39],
      [22.54, -7.18],
      [16.52, -6.58],
      [12.6, -8.74],
    ],
    '#d5bb947b',
  );
  polygon(
    ctx,
    [
      [12.58, -9.96],
      [11.51, -4.84],
      [8.7, 1.5],
      [5.56, 6.83],
      [0.72, 7.82],
      [4.8, 3.1],
      [6.2, -3.93],
      [8.21, -8.63],
    ],
    '#e6cca88f',
  );
  stroke(
    ctx,
    [
      [4.23, -8.2],
      [5.7, -11.3],
      [9.19, -13.28],
    ],
    '#f1cc978a',
    1.07,
  );

  const earTip = alert ? -23.75 : -21.16;
  polygon(
    ctx,
    [
      [9.72, -12.06],
      [4.13, -15.28],
      [0.65, earTip],
      [5.23, earTip + 1.1],
      [10.39, -16.65],
    ],
    '#a87e58',
  );
  polygon(
    ctx,
    [
      [8.67, -14.11],
      [4.34, -16.07],
      [2.43, earTip + 1.69],
      [7.04, earTip + 3.36],
    ],
    '#674a3c',
  );
  polygon(
    ctx,
    [
      [12.58, -13.12],
      [15.11, earTip + 2],
      [19.83, earTip + 0.99],
      [18.16, -15.38],
      [15.65, -12.39],
    ],
    '#b9956d',
  );
  stroke(
    ctx,
    [
      [14.52, -15.8],
      [17.13, earTip + 2.6],
    ],
    '#785a48',
    0.95,
  );
  ellipse(ctx, 22.42, -8.41, 1.37, 1.05, '#41332b', 0.22);
  stroke(
    ctx,
    [
      [14.78, -11.7],
      [16.17, -11.25],
    ],
    '#423328',
    1.32,
  );
  ellipse(ctx, 15.27, -11.68, 0.31, 0.29, '#f0d298');
  if (variant % 3 !== 1) {
    stroke(
      ctx,
      [
        [10.67, -14.72],
        [8.15, -19.87],
        [7.65, -25.6],
        [4.91, -30.34],
      ],
      '#625747',
      1.51,
    );
    stroke(
      ctx,
      [
        [8.14, -21.36],
        [4.16, -23.43],
        [1.65, -28.76],
      ],
      '#756449',
      1.13,
    );
    stroke(
      ctx,
      [
        [7.76, -24.59],
        [11.31, -28.89],
      ],
      '#8c7b5f',
      0.87,
    );
    stroke(
      ctx,
      [
        [13.33, -15.9],
        [15.81, -22.94],
        [20.23, -28.32],
      ],
      '#94826a',
      1.11,
    );
    stroke(
      ctx,
      [
        [15.81, -22.94],
        [14.81, -26.86],
      ],
      '#94826a',
      0.81,
    );
  }
  ctx.restore();
}

function wolfHead(ctx: CanvasRenderingContext2D, winter: boolean, angle: number, bite: number) {
  ctx.save();
  ctx.translate(10.5, -17.85);
  ctx.rotate(angle);
  const coat = ctx.createLinearGradient(-1, -10.85, 14, 6.34);
  coat.addColorStop(0, winter ? '#bfc0af' : '#a8aa99');
  coat.addColorStop(0.49, '#737e73');
  coat.addColorStop(1, '#3d4944');
  ctx.beginPath();
  ctx.moveTo(-8.05, -5.28);
  ctx.bezierCurveTo(-4.89, -9.24, 2.95, -11.3, 6.3, -6.41);
  ctx.lineTo(10.23, -2.6);
  ctx.lineTo(20.29, 0.36);
  ctx.lineTo(21.19, 2.69);
  ctx.lineTo(15.22, 4.23);
  ctx.lineTo(9.54, 4.11);
  ctx.lineTo(7.53, 6.9);
  ctx.lineTo(4.45, 5.97);
  ctx.lineTo(2.97, 8.19);
  ctx.quadraticCurveTo(-3.63, 7.88, -8.05, -5.28);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.fill();
  polygon(
    ctx,
    [
      [-6.33, -5.25],
      [-3.76, -8.06],
      [1.45, -9.15],
      [5.78, -7.82],
      [8.67, -4.38],
      [5.15, -3.23],
      [2.1, -5.22],
      [-3.63, -2.27],
    ],
    '#3f483fba',
  );
  polygon(
    ctx,
    [
      [1.11, -3.44],
      [5.71, -2.68],
      [10.5, -0.45],
      [15.41, 1.02],
      [19.65, 0.88],
      [18.63, 2.5],
      [10.37, 3.45],
      [6.52, 6.1],
      [3.31, 4.9],
      [2.55, 6.36],
      [-0.04, 2.97],
    ],
    '#d0c7abad',
  );
  polygon(
    ctx,
    [
      [0.62, -7.94],
      [-0.93, -14.34],
      [1.33, -15],
      [4.93, -9.43],
      [7.3, -12.66],
      [9.35, -11.16],
      [8.63, -5.9],
    ],
    '#454c42',
  );
  polygon(
    ctx,
    [
      [1.36, -8.86],
      [0.54, -13.6],
      [3.35, -10.36],
    ],
    '#a3957b',
  );
  if (bite > 0.1) {
    polygon(
      ctx,
      [
        [7.93, 3.63],
        [19.38, 2.5],
        [16.8, 4 + bite * 4.7],
        [10.22, 5 + bite * 3.1],
      ],
      '#463834',
    );
    polygon(
      ctx,
      [
        [14.69, 3.42],
        [17.12, 3.14],
        [15.41, 5.7],
      ],
      '#e0d4af',
    );
    stroke(
      ctx,
      [
        [9.36, 5.1 + bite * 2.78],
        [16.8, 4 + bite * 4.7],
      ],
      '#b0ab95',
      1.05,
    );
  } else {
    stroke(
      ctx,
      [
        [9.61, 3.61],
        [18.73, 2.8],
      ],
      '#50584c',
      0.91,
    );
  }
  ellipse(ctx, 20.28, 1.08, 1.54, 1.5, '#27322b', -0.32);
  stroke(
    ctx,
    [
      [7.24, -3.18],
      [9.34, -2.31],
    ],
    '#28322a',
    1.23,
  );
  ellipse(ctx, 8.48, -2.72, 0.46, 0.39, '#d2ad68');
  ctx.restore();
}

function mammothDetails(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: number,
  moving: boolean,
  attack: number,
) {
  const sway = Math.sin(time * 1.8 + phase) * (moving ? 2.3 : 1.2) - attack * 6;
  ctx.beginPath();
  ctx.moveTo(27, -32);
  ctx.bezierCurveTo(40, -23, 27 + sway, -2 - attack * 9, 37 + sway, -attack * 10);
  ctx.bezierCurveTo(
    43 + sway,
    1 - attack * 10,
    44 + sway,
    -7 - attack * 8,
    41 + sway,
    -11 - attack * 8,
  );
  ctx.strokeStyle = '#6c513c';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(27, -31);
  ctx.bezierCurveTo(35, -20, 30 + sway, -1 - attack * 9, 38 + sway, -1 - attack * 10);
  ctx.strokeStyle = '#a3865a';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const ear = Math.sin(time * 1.3 + phase) * 0.08;
  ellipse(ctx, 16, -33, 8 + ear * 9, 12, '#65503b', -0.18 + ear);
  ellipse(ctx, 14, -35, 5.2 + ear * 6, 8, '#947450', -0.18 + ear);
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
}

function drawAnimal(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  time: number,
  season: number,
  variant: number,
  context?: AnimalAnimationContext,
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
  const pose = observeAnimalAnimation(entity, time, context);
  ctx.save();
  ctx.scale(alpha ? 1.25 : 1, alpha ? 1.25 : 1);
  if (dead) {
    show(ctx, body);
    ctx.restore();
    return;
  }
  shade(ctx, 4, 3, mammoth ? 44 : 30, mammoth ? 10 : 7, 0.19);
  ctx.scale(pose.facing, 1);
  const gait = pose.gait;
  const isDeer = entity.kind === 'deer';
  const legColor = mammoth ? '#5d4936' : isDeer ? '#765333' : '#596454';
  const legs = mammoth ? [-25, -15, 12, 21] : [-15, -9, 8, 13];
  for (const [index, x] of legs.entries()) {
    const offset =
      gait * (index % 2 ? 1 : -1) * (pose.fleeing ? 5.2 : mammoth ? 2.7 : pose.running ? 4.3 : 3.1);
    const lift = pose.moving
      ? Math.max(0, index % 2 ? gait : -gait) *
        (pose.fleeing ? 2.8 : pose.running && !mammoth ? 2 : 1.2)
      : 0;
    const hip = mammoth ? -17 : -12,
      knee = mammoth ? -7 : -5;
    const color = index % 2 ? legColor : mammoth ? '#85694a' : isDeer ? '#b48e5b' : '#899680';
    stroke(
      ctx,
      [
        [x, hip],
        [x + offset * 0.35 + (x < 0 ? -1 : 1), knee],
        [x + offset, 1 - lift],
        [x + offset + 2, 1 - lift],
      ],
      color,
      mammoth ? 6 : isDeer ? 1.7 : 2.1,
    );
    if (isDeer)
      stroke(
        ctx,
        [
          [x + offset - 0.5, -lift],
          [x + offset + 2, 0.5 - lift],
        ],
        '#4b4230',
        1.4,
      );
  }
  const bodyLift = pose.moving
    ? Math.abs(gait) * (pose.fleeing ? 1.7 : mammoth ? 0.35 : pose.running ? 1.1 : 0.55)
    : 0;
  ctx.translate(
    pose.attack * (mammoth ? 1 : 2) - pose.hurt * 1.5,
    Math.sin(time * 1.7 + pose.phase) * 0.17 - bodyLift + pose.hurt * 0.55,
  );
  // Tails trail the actual gait; the raised white deer tail makes flight legible.
  if (mammoth) {
    stroke(
      ctx,
      [
        [-34, -22],
        [-41, -13],
        [-43 + Math.sin(time * 2 + pose.phase), -5],
      ],
      '#4f4032',
      1.5,
    );
  } else if (isDeer) {
    stroke(
      ctx,
      [
        [-21, -17],
        [-25, pose.fleeing ? -24 : -20],
        [-24, pose.fleeing ? -19 : -15],
      ],
      '#e0d2ad',
      2.7,
    );
  } else {
    const wag = Math.sin(time * (pose.attacking ? 5 : 2) + pose.phase) * 1.8;
    stroke(
      ctx,
      [
        [-20, -15],
        [-28, -12 + wag],
        [-32, -6 + wag],
      ],
      '#687565',
      4.6,
    );
    stroke(
      ctx,
      [
        [-28, -12 + wag],
        [-32, -6 + wag],
      ],
      '#a3a891',
      1.6,
    );
  }
  show(ctx, body);
  if (mammoth) mammothDetails(ctx, time, pose.phase, pose.moving, pose.attack);
  else if (isDeer) {
    const browse = Math.max(0, Math.sin(time * 0.65 + pose.phase) - 0.25) * 1.1;
    deerHead(
      ctx,
      variant,
      pose.alert ? (pose.fleeing ? 0.12 : -0.13) : pose.moving ? 0.1 : browse,
      pose.alert,
    );
  } else
    wolfHead(
      ctx,
      season === 3,
      pose.attacking
        ? -pose.attack * 0.16
        : pose.alert
          ? -0.08
          : 0.1 + Math.sin(time * 1.3 + pose.phase) * 0.06,
      pose.attack,
    );
  ctx.restore();
}

/** The caller already applies SPRITE_SCALE and translates to entity.x/y. */
export function drawPainterlyNature(
  ctx: CanvasRenderingContext2D,
  entity: MapEntity,
  time: number,
  seasonIndex: number,
  unknown: boolean,
  context?: AnimalAnimationContext,
): boolean {
  const variant = seedOf(entity.id) % 8,
    season = seasonIndex % 4;
  if (['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind)) {
    drawAnimal(ctx, entity, time, season, variant, context);
    return true;
  }
  if (drawNaturalAtlas(ctx, entity, variant, season, unknown, context?.reducedMotion ? 0 : time))
    return true;
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
