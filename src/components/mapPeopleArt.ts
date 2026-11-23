import { getLifeStage, type LifeStage } from '../game/demography';
import type { Unit } from '../game/types';
import type { VisibleUnitEquipment } from '../game/unitEquipment';
import { getUnitAnimation, type UnitAnimationPose } from './unitAnimation';

export { isWalkingPose } from './unitAnimation';

type Point = readonly [number, number];
type Palette = readonly [light: string, midtone: string, shadow: string];
type Paint = string | CanvasGradient;

const leather: Palette = ['#c99b71', '#684737', '#312821'];
const iron: Palette = ['#d3dfd3', '#7c9191', '#35494c'];
const fleece: Palette = ['#f2d7a1', '#b08c60', '#685240'];
const flax: Palette = ['#e5cda2', '#b5956b', '#68523e'];
const hides: readonly Palette[] = [
  ['#daa56b', '#a26a3f', '#583a2b'],
  ['#d68c6f', '#934c3e', '#572e2e'],
  ['#aebc86', '#6a784f', '#354537'],
  ['#e2cc95', '#a69267', '#584f3e'],
  ['#b99980', '#776049', '#42332c'],
  ['#adc2ba', '#668681', '#394f51'],
];
const skins: readonly Palette[] = [
  ['#e3b58d', '#b77c59', '#724c3d'],
  ['#cba07a', '#9a684a', '#5d4036'],
  ['#eac19e', '#c48c6b', '#865846'],
  ['#b78a65', '#8e5e45', '#50372e'],
];
const hairColors: readonly Palette[] = [
  ['#85705c', '#41362e', '#241e20'],
  ['#a47b56', '#664734', '#342825'],
  ['#74665b', '#443a33', '#282224'],
];
const greyHair: Palette = ['#ebe0cc', '#a59b86', '#5b5149'];
const cuts = ['wrap', 'mantle', 'tunic'] as const;

// Keep the cut, pigments and silhouette attached to a person across tasks and regions.
function appearanceSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function personPigments(seed: number, stage: LifeStage) {
  return {
    skin: skins[seed % skins.length],
    fabric: hides[(seed >>> 3) % hides.length],
    hair: stage === 'elder' ? greyHair : hairColors[(seed >>> 9) % hairColors.length],
    hairCut: (seed >>> 24) % 4,
  };
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  paint: Paint,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = paint;
  ctx.fill();
}

function plane(ctx: CanvasRenderingContext2D, points: readonly Point[], paint: Paint) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
  ctx.fillStyle = paint;
  ctx.fill();
}

function stroke(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  color: string,
  width: number,
) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function shade(
  ctx: CanvasRenderingContext2D,
  colors: Palette,
  from: Point,
  to: Point,
  far = false,
) {
  const gradient = ctx.createLinearGradient(...from, ...to);
  gradient.addColorStop(0, colors[far ? 1 : 0]);
  gradient.addColorStop(0.52, colors[1]);
  gradient.addColorStop(1, colors[2]);
  return gradient;
}

function offset(from: Point, to: Point, distance: number): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  return [(dy / length) * distance, (-dx / length) * distance];
}

function add(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]];
}

// The highlight follows the bone, while the narrowed edge describes wrist, knee and ankle.
function limb(
  ctx: CanvasRenderingContext2D,
  start: Point,
  joint: Point,
  end: Point,
  widths: readonly [number, number, number],
  skin: Palette,
  far = false,
) {
  const nearStart = add(start, offset(start, joint, -widths[0]));
  const nearJoint = add(joint, offset(start, end, -widths[1]));
  const nearEnd = add(end, offset(joint, end, -widths[2]));
  const farStart = add(start, offset(start, joint, widths[0]));
  const farJoint = add(joint, offset(start, end, widths[1]));
  const farEnd = add(end, offset(joint, end, widths[2]));
  ctx.beginPath();
  ctx.moveTo(...nearStart);
  ctx.quadraticCurveTo(...add(nearStart, [0.2, 1.1]), ...nearJoint);
  ctx.quadraticCurveTo(...add(nearJoint, [-0.15, 0.8]), ...nearEnd);
  ctx.lineTo(...farEnd);
  ctx.quadraticCurveTo(...add(farJoint, [0, 1.1]), ...farJoint);
  ctx.quadraticCurveTo(...add(farStart, [-0.3, 1]), ...farStart);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, skin, nearStart, add(farStart, [0, 4]), far);
  ctx.fill();
  if (!far) stroke(ctx, [nearJoint, add(nearEnd, [0.28, -0.4])], `${skin[0]}79`, 0.42);
}

function paintLeg(
  ctx: CanvasRenderingContext2D,
  hip: Point,
  knee: Point,
  foot: Point,
  skin: Palette,
  binding: Palette,
  far: boolean,
) {
  limb(ctx, hip, knee, foot, [1.8, 1.32, 0.84], skin, far);
  const [x, y] = foot;
  ctx.beginPath();
  ctx.moveTo(x - 1.12, y - 1.3);
  ctx.quadraticCurveTo(x - 0.1, y - 1.8, x + 0.54, y - 0.9);
  ctx.quadraticCurveTo(x + 1.7, y - 0.4, x + 2.57, y - 0.45);
  ctx.quadraticCurveTo(x + 3, y + 0.2, x + 2.24, y + 0.5);
  ctx.quadraticCurveTo(x - 0.4, y + 1.18, x - 1.25, y + 0.42);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, leather, [x - 1, y - 1], [x + 1.2, y + 0.6], far);
  ctx.fill();
  stroke(
    ctx,
    [
      [x - 1.12, y - 1.3],
      [x + 0.63, y - 0.72],
    ],
    binding[far ? 1 : 0],
    0.68,
  );
  if (!far)
    stroke(
      ctx,
      [
        [x - 0.72, y - 2.67],
        [x + 0.62, y - 1.84],
      ],
      `${binding[1]}cc`,
      0.73,
    );
}

function paintArm(
  ctx: CanvasRenderingContext2D,
  shoulder: Point,
  arm: UnitAnimationPose['rightArm'],
  skin: Palette,
  far = false,
) {
  const { elbow, hand } = arm;
  limb(ctx, shoulder, [elbow.x, elbow.y], [hand.x, hand.y], [1.64, 1.2, 0.72], skin, far);
  ellipse(ctx, hand.x + 0.12, hand.y + 0.26, 1.08, 1.25, skin[far ? 2 : 1]);
  if (!far) ellipse(ctx, hand.x - 0.35, hand.y + 0.18, 0.46, 0.78, skin[0]);
}

function paintClothes(
  ctx: CanvasRenderingContext2D,
  shoulderY: number,
  build: number,
  cut: (typeof cuts)[number],
  color: Palette,
) {
  ctx.save();
  ctx.translate(0, shoulderY + 22);
  ctx.scale(build, 1);
  // The left shoulder faces away from the reader. The garment folds around the
  // near hip, leaving the far thigh visible through the off-center hem.
  ctx.beginPath();
  ctx.moveTo(-4.15, -21.4);
  ctx.quadraticCurveTo(-2.1, -23.35, 1.6, -23.35);
  ctx.quadraticCurveTo(4.8, -23.53, 5.8, -21.2);
  ctx.bezierCurveTo(5.8, -18.3, 3.8, -15.55, 5.1, -13);
  ctx.lineTo(6.65, cut === 'mantle' ? -9.5 : -8.5);
  ctx.lineTo(3.2, -8.1);
  ctx.lineTo(1.5, -8.85);
  ctx.lineTo(-0.55, -8.7);
  ctx.lineTo(-2.13, -10.22);
  ctx.lineTo(-4.29, -10.42);
  ctx.quadraticCurveTo(-3.55, -16, -4.15, -21.4);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, color, [-2.8, -23], [5.1, -13]);
  ctx.fill();
  ctx.clip();

  const [light, middle, dark] = color;
  plane(
    ctx,
    [
      [-4.4, -19],
      [-1.05, -21.4],
      [0, -17.8],
      [-1.35, -14.15],
    ],
    `${dark}9c`,
  );
  plane(
    ctx,
    [
      [1.9, -22.7],
      [5.39, -21.7],
      [4.3, -18.7],
      [1.25, -17.4],
    ],
    `${light}7d`,
  );
  plane(
    ctx,
    [
      [2.65, -15.6],
      [5.8, -13.3],
      [7.72, -7.9],
      [3.3, -8.3],
    ],
    `${dark}aa`,
  );
  plane(
    ctx,
    [
      [0.3, -14.8],
      [2.9, -13.65],
      [2.42, -9.23],
      [-0.6, -9.3],
    ],
    `${light}8e`,
  );
  plane(
    ctx,
    [
      [-2.9, -14.8],
      [-1.4, -14.8],
      [-1.9, -10],
      [-5, -9.9],
    ],
    `${dark}8d`,
  );
  stroke(
    ctx,
    [
      [-3.8, -11.5],
      [-1.6, -11.1],
      [-0.15, -9.7],
      [3.1, -9.3],
      [6.65, -9.6],
    ],
    `${light}aa`,
    0.59,
  );

  if (cut === 'mantle') {
    const mantle = shade(ctx, fleece, [-3.3, -23.1], [4.9, -16.2]);
    plane(
      ctx,
      [
        [-4.8, -22.8],
        [-1.2, -24],
        [1.7, -23.65],
        [5.9, -22.2],
        [2.62, -17.75],
        [1.28, -18.2],
        [0.7, -16.4],
        [-0.35, -17.3],
        [-2.45, -17.3],
        [-4.6, -18.55],
      ],
      mantle,
    );
    stroke(
      ctx,
      [
        [-4, -20.9],
        [-2.6, -19.9],
        [-1.75, -19.8],
      ],
      '#efe0b4a8',
      0.6,
    );
    stroke(
      ctx,
      [
        [-1.8, -22.1],
        [-0.8, -20.7],
        [-0.55, -19.7],
      ],
      '#73593ea3',
      0.46,
    );
    stroke(
      ctx,
      [
        [2.7, -22.1],
        [1.86, -20.73],
        [1.54, -19.5],
      ],
      '#f2d6a59e',
      0.53,
    );
    ellipse(ctx, 1.3, -18.1, 0.83, 0.78, '#cfa163');
  } else if (cut === 'wrap') {
    plane(
      ctx,
      [
        [-3.66, -22.7],
        [-1, -22.5],
        [5.76, -16.35],
        [5.56, -14.46],
        [1.2, -16.39],
        [-4.2, -20.7],
      ],
      `${dark}cc`,
    );
    stroke(
      ctx,
      [
        [-3.42, -22.1],
        [-0.36, -20.5],
        [3.6, -16.81],
        [5.2, -16.2],
      ],
      `${light}eb`,
      0.9,
    );
    stroke(
      ctx,
      [
        [-2.95, -21.28],
        [0.66, -18.66],
        [3.25, -16.98],
      ],
      middle,
      0.59,
    );
  } else {
    stroke(
      ctx,
      [
        [-2.64, -21.91],
        [-0.68, -20.95],
        [2.57, -21.82],
      ],
      `${light}d2`,
      0.69,
    );
    stroke(
      ctx,
      [
        [1.5, -20.83],
        [0.13, -17.6],
        [0.22, -15.1],
      ],
      `${dark}db`,
      0.65,
    );
    for (let i = 0; i < 3; i++) {
      const x = 1.05 - i * 0.3;
      const y = -20.4 + i * 1.28;
      stroke(
        ctx,
        [
          [x - 0.4, y],
          [x + 0.4, y + 0.14],
        ],
        `${light}c1`,
        0.42,
      );
    }
  }

  stroke(
    ctx,
    [
      [-3.96, -15.35],
      [0.1, -14.56],
      [4.96, -15.32],
    ],
    '#372b25d9',
    1.23,
  );
  stroke(
    ctx,
    [
      [-3.75, -15.68],
      [0.1, -14.96],
      [4.63, -15.54],
    ],
    '#b08659db',
    0.58,
  );
  plane(
    ctx,
    [
      [-0.25, -14.59],
      [1.1, -14.4],
      [2.16, -10.51],
      [1.24, -10.35],
    ],
    leather[1],
  );
  ellipse(ctx, 1.26, -14.97, 0.71, 0.52, '#d8aa68');
  ctx.restore();
}

function paintArmor(
  ctx: CanvasRenderingContext2D,
  armor: VisibleUnitEquipment['armor'],
  shoulderY: number,
  build: number,
) {
  if (!armor) return;
  ctx.save();
  ctx.translate(0, shoulderY + 22);
  ctx.scale(build, 1);
  if (armor === 'metal') {
    const hammered = shade(ctx, iron, [-3.1, -21.4], [5.2, -15.1]);
    plane(
      ctx,
      [
        [-3.65, -21.85],
        [-1.75, -21.2],
        [1.45, -21.22],
        [5.06, -22.02],
        [4.43, -18.23],
        [3.43, -14.9],
        [-1.46, -14.6],
        [-3.28, -15.38],
      ],
      hammered,
    );
    plane(
      ctx,
      [
        [-2.93, -20.26],
        [0.2, -21.06],
        [2.2, -19.3],
        [-0.13, -17.97],
      ],
      '#c3d3ccbd',
    );
    plane(
      ctx,
      [
        [4.79, -20.41],
        [4.14, -17.71],
        [3.49, -15.43],
        [0.55, -15.14],
        [1.69, -17.75],
      ],
      '#3d5056b8',
    );
    stroke(
      ctx,
      [
        [-2.96, -20.56],
        [-2.51, -16.1],
        [-1.54, -15.25],
        [3.18, -15.55],
      ],
      '#bccbc6',
      0.51,
    );
    for (let i = 0; i < 3; i++)
      ellipse(ctx, 3.79 + i * 0.24, -16.31 - i * 1.69, 0.32, 0.38, '#e3ce99');
  } else {
    const thickHide = shade(ctx, fleece, [-3.95, -22.2], [4.68, -16.3]);
    plane(
      ctx,
      [
        [-4.75, -21.85],
        [-2.18, -23.4],
        [1.24, -23.1],
        [5.69, -22.03],
        [5.33, -16.15],
        [3.95, -16.56],
        [2.77, -15.68],
        [1.25, -16.1],
        [-0.45, -15.45],
        [-1.46, -16.3],
        [-3.5, -15.87],
      ],
      thickHide,
    );
    for (let i = 0; i < 8; i++) {
      const x = -3.35 + (i % 4) * 2.22;
      const y = -21.15 + Math.floor(i / 4) * 2.37;
      stroke(
        ctx,
        [
          [x, y],
          [x + 0.35, y + 0.35],
          [x + 0.64, y + 1.32],
        ],
        i % 2 === 0 ? '#ebd3a8a3' : '#70544188',
        0.59,
      );
    }
  }
  ctx.restore();
}

function paintHead(
  ctx: CanvasRenderingContext2D,
  y: number,
  skin: Palette,
  hair: Palette,
  cut: number,
  child: boolean,
  bearded: boolean,
) {
  ctx.save();
  ctx.translate(1.2, y);
  const scale = child ? 1.07 : 1;
  ctx.scale(scale, scale);
  const crown = shade(ctx, hair, [-2.1, -3.35], [2.2, 1.65]);

  // Hair masses break the contour at the back, leaving the brow and nose in profile.
  if (cut === 2) {
    plane(
      ctx,
      [
        [-1.35, -2.2],
        [-4.5, -1.78],
        [-4.85, 0.18],
        [-3.51, 2.36],
        [-3.8, 4.39],
        [-2.35, 3.57],
        [-1.2, 0.78],
      ],
      crown,
    );
    stroke(
      ctx,
      [
        [-3.88, -1.3],
        [-3.65, 0.83],
        [-2.9, 1.55],
      ],
      hair[0],
      0.58,
    );
    stroke(
      ctx,
      [
        [-3.85, 1.1],
        [-3.02, 1.35],
      ],
      '#b38a57',
      0.59,
    );
  } else if (cut === 3) {
    plane(
      ctx,
      [
        [-1.4, -2.8],
        [-3.89, -1.65],
        [-4.25, 1.75],
        [-3.73, 3.71],
        [-3.98, 5.6],
        [-2.15, 5.14],
        [-1.11, 3.13],
        [-0.38, -0.34],
      ],
      crown,
    );
    stroke(
      ctx,
      [
        [-3.64, -0.87],
        [-3.2, 2.78],
        [-3.46, 4.34],
      ],
      `${hair[0]}ad`,
      0.55,
    );
  }
  plane(
    ctx,
    [
      [-1.86, 1.16],
      [1.81, 1.82],
      [1.75, 3.47],
      [2.46, 4.28],
      [-1.34, 4.77],
      [-2.05, 3.64],
    ],
    shade(ctx, skin, [-2, 2.2], [1.7, 4.8]),
  );
  ctx.beginPath();
  ctx.moveTo(-3.14, -1.65);
  ctx.bezierCurveTo(-3.04, -3.47, -0.73, -4.34, 1.55, -3.13);
  ctx.quadraticCurveTo(2.64, -2.51, 2.83, -1.2);
  ctx.lineTo(3.56, -0.15);
  ctx.lineTo(2.74, 0.24);
  ctx.lineTo(2.65, 1.49);
  ctx.quadraticCurveTo(2.51, 2.63, 0.87, 2.87);
  ctx.quadraticCurveTo(-2.84, 2.49, -3.14, -1.65);
  ctx.fillStyle = shade(ctx, skin, [1.72, -2.74], [-1.68, 2.54]);
  ctx.fill();
  plane(
    ctx,
    [
      [2.6, -0.79],
      [3.56, -0.15],
      [2.41, 0.51],
      [1.4, 0.46],
    ],
    `${skin[0]}b3`,
  );
  plane(
    ctx,
    [
      [0.24, 1.04],
      [2.61, 0.96],
      [2.48, 2.46],
      [0.86, 2.87],
    ],
    `${skin[2]}74`,
  );
  ellipse(ctx, -1.55, 0.13, 0.76, 1.11, skin[1]);
  stroke(
    ctx,
    [
      [-1.64, -0.57],
      [-1.85, 0.19],
    ],
    skin[0],
    0.49,
  );
  // At this scale one brush mark for the brow is enough.
  stroke(
    ctx,
    [
      [1.23, -1.23],
      [2.34, -1.14],
    ],
    '#443329b5',
    0.53,
  );
  if (bearded) {
    plane(
      ctx,
      [
        [-1.46, 1.36],
        [0.46, 1.99],
        [2.64, 0.77],
        [2.39, 2.82],
        [0.91, 3.59],
        [-1.64, 2.36],
      ],
      hair[1],
    );
    stroke(
      ctx,
      [
        [1.27, 2.09],
        [1.61, 2.81],
      ],
      `${hair[0]}b3`,
      0.54,
    );
  }

  ctx.beginPath();
  ctx.moveTo(-2.74, 0.78);
  ctx.bezierCurveTo(-4.8, -1.07, -4.1, -3.92, -2.69, -4.34);
  ctx.quadraticCurveTo(-0.26, -5.38 + (cut === 0 ? 0.8 : 0), 2.36, -3.63);
  ctx.lineTo(2.75, -2.45);
  ctx.lineTo(1.26, -2.89);
  ctx.lineTo(-0.15, -2.38);
  ctx.lineTo(-1.17, -2.46);
  ctx.lineTo(-2.26, -0.37);
  ctx.closePath();
  ctx.fillStyle = crown;
  ctx.fill();
  plane(
    ctx,
    [
      [-3.13, -2.05],
      [-2.61, -3.82],
      [-0.72, -4.36],
      [0.93, -3.96],
      [-1.71, -3.36],
    ],
    `${hair[0]}cb`,
  );
  stroke(
    ctx,
    [
      [-2.81, -2.07],
      [-1.78, -3.15],
      [-0.2, -3.52],
    ],
    `${hair[0]}90`,
    0.53,
  );
  ctx.restore();
}

function paintResting(
  ctx: CanvasRenderingContext2D,
  fabric: Palette,
  skin: Palette,
  hair: Palette,
  newborn: boolean,
  breathing: number,
) {
  if (newborn) {
    ctx.translate(-0.9, 0.5);
    ctx.rotate(-0.14);
    ctx.beginPath();
    ctx.moveTo(-3.62, -10.55);
    ctx.bezierCurveTo(-7.2, -7.26, -6.48, -0.6, -2.2, 0.5);
    ctx.bezierCurveTo(2.11, 1.12, 5.41, -1.51, 5.14, -6.46);
    ctx.quadraticCurveTo(4.56, -10.64, 1.91, -11.43);
    ctx.closePath();
    ctx.fillStyle = shade(ctx, flax, [-4.31, -9.5], [3.52, -2.61]);
    ctx.fill();
    plane(
      ctx,
      [
        [-4.9, -8.07],
        [3.91, -6.46],
        [3.65, -4.65],
        [-5.25, -6.46],
      ],
      '#eee2c4bb',
    );
    plane(
      ctx,
      [
        [4.65, -5.22],
        [-4.13, -3.76],
        [-3.18, -2.69],
        [4.29, -3.53],
      ],
      '#775b418f',
    );
    ellipse(ctx, 0.38, -11.2, 2.92, 3.16, shade(ctx, skin, [-1.5, -13.02], [2.95, -10.07]));
    paintBabyHair(ctx, hair);
    return;
  }
  ctx.scale(1, breathing);
  ctx.beginPath();
  ctx.moveTo(-10.53, 0.4);
  ctx.quadraticCurveTo(-11.35, -3.2, -7.32, -4.6);
  ctx.quadraticCurveTo(-5.26, -8.93, 1.35, -7.48);
  ctx.quadraticCurveTo(8.24, -6.67, 8.93, -1.01);
  ctx.quadraticCurveTo(6.51, 3.49, -2.41, 3.31);
  ctx.quadraticCurveTo(-8.73, 3.89, -10.53, 0.4);
  ctx.fillStyle = shade(ctx, fabric, [-7.33, -6.47], [2.74, 2.69]);
  ctx.fill();
  plane(
    ctx,
    [
      [-7.75, -3.7],
      [-5.25, -6.45],
      [-1.82, -6.33],
      [2.22, -1.86],
      [-3.37, -3.2],
    ],
    `${fabric[0]}b7`,
  );
  plane(
    ctx,
    [
      [-8.6, -1.43],
      [-4.33, -2.92],
      [1.04, -0.52],
      [-2.2, 1.05],
      [-6.64, 0.83],
    ],
    `${fabric[2]}91`,
  );
  ellipse(ctx, 6.45, -2.37, 3.46, 2.91, shade(ctx, skin, [4.8, -3.74], [8.2, -1.28]));
  ellipse(ctx, 8.05, -3.08, 2.17, 2.4, shade(ctx, hair, [6.78, -4.57], [9.98, -2.63]));
  stroke(
    ctx,
    [
      [4.95, -2.31],
      [5.9, -2.11],
    ],
    skin[2],
    0.44,
  );
  ctx.font = 'italic 7px Georgia';
  ctx.fillStyle = '#475649';
  ctx.fillText('z', 8.5, -9.4);
}

function paintBabyHair(ctx: CanvasRenderingContext2D, hair: Palette) {
  ctx.beginPath();
  ctx.moveTo(-2.53, -11.24);
  ctx.bezierCurveTo(-3.6, -15.9, 3.4, -15.95, 3.19, -11.77);
  ctx.quadraticCurveTo(0.21, -13.63, -2.53, -11.24);
  ctx.fillStyle = shade(ctx, hair, [-1.65, -14.8], [2.93, -12.13]);
  ctx.fill();
  stroke(
    ctx,
    [
      [0.24, -10.93],
      [1.12, -11.04],
    ],
    '#543e31',
    0.43,
  );
}

function paintInsignia(ctx: CanvasRenderingContext2D, hostile: boolean, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  plane(
    ctx,
    [
      [-2.1, -1.6],
      [1.85, -1.3],
      [1.51, 3.32],
      [-0.06, 2.45],
      [-1.91, 2.93],
    ],
    hostile ? '#ad4e3e' : '#386c78',
  );
  stroke(
    ctx,
    [
      [-1.43, -1.19],
      [1.27, -1.04],
    ],
    '#efdaad',
    0.63,
  );
  stroke(
    ctx,
    [
      [-0.8, -0.25],
      [0.64, 1.59],
    ],
    '#efdaad',
    0.62,
  );
  if (hostile)
    stroke(
      ctx,
      [
        [0.7, -0.34],
        [-0.8, 1.47],
      ],
      '#efdaad',
      0.62,
    );
  ctx.restore();
}

function paintStaff(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.moveTo(x - 1.38, y - 0.51);
  ctx.quadraticCurveTo(x - 0.78, y - 2.56, x + 1.69, y - 0.86);
  ctx.lineTo(x + 3.15, 0.95);
  ctx.strokeStyle = leather[2];
  ctx.lineWidth = 1.66;
  ctx.lineCap = 'round';
  ctx.stroke();
  stroke(
    ctx,
    [
      [x + 1.55, y - 0.67],
      [x + 2.77, -0.17],
    ],
    '#b18c63',
    0.61,
  );
}

/** Local artwork. The base of the stance remains at the physical map position. */
export function drawPainterlyBody(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  time: number,
  equipment: VisibleUnitEquipment,
  pose = getUnitAnimation(unit, time, { equipment }),
  foreign?: 'visitor' | 'hostile',
) {
  const seed = appearanceSeed(unit.id);
  const stage = getLifeStage(unit);
  const elder = stage === 'elder';
  const child = stage === 'child';
  const newborn = stage === 'newborn';
  const sleeping = pose.kind === 'sleep';
  const { skin, fabric, hair, hairCut } = personPigments(seed, stage);

  ctx.save();
  ctx.scale(pose.facing, 1);
  if (sleeping || newborn) {
    paintResting(ctx, fabric, skin, hair, newborn, 1 + Math.sin(time * 1.6 + seed) * 0.012);
    if (foreign) paintInsignia(ctx, foreign === 'hostile', -2.64, -4.3);
    ctx.restore();
    return;
  }

  // A split stance projects the far foot upstage. Work shifts the knees, while
  // an actual walk lifts the advancing foot and leaves the other at ground level.
  const stance = (seed % 6) * 0.23 - 0.48;
  const stride = pose.kind === 'run' ? pose.step * 5.1 : pose.step * 3.85;
  const crouch = pose.bodyDrop * 0.4;
  const backX = -2.85 - stride * 0.58;
  const frontX = 2.3 + stance + stride * 0.91;
  const backY = -0.62 - Math.max(0, -pose.step) * 2.26;
  const frontY = 0.42 - Math.max(0, pose.step) * 2.58;
  paintLeg(
    ctx,
    [-1.76, -12 + crouch],
    [backX + 0.32 - crouch * 0.62, -6.24 + crouch * 0.33],
    [backX, backY],
    skin,
    fabric,
    true,
  );
  paintLeg(
    ctx,
    [2.28, -11.87 + crouch],
    [frontX + 0.55 + crouch * 0.77, -5.48 + crouch * 0.42],
    [frontX, frontY],
    skin,
    fabric,
    false,
  );

  // Match the pose's grip transform exactly so handheld equipment and cargo
  // stay in the painted hands even at the limits of a stroke.
  ctx.translate(0, -9);
  ctx.rotate(pose.torsoAngle);
  ctx.translate(pose.bodyLean, 9 + pose.bodyDrop);
  const shoulderY = elder ? -20.52 : -22;
  const build = 0.91 + ((seed >>> 12) % 7) * 0.031;
  const cut = child ? 'tunic' : cuts[(seed >>> 16) % cuts.length];
  paintArm(ctx, [-3.3 * build, shoulderY + 1.1], pose.leftArm, skin, true);
  paintClothes(ctx, shoulderY, build, cut, fabric);
  paintArmor(ctx, equipment.armor, shoulderY, build);
  if (elder && !equipment.held && !unit.carry && ['idle', 'walk', 'guard'].includes(pose.kind))
    paintStaff(ctx, pose.rightArm.hand.x, pose.rightArm.hand.y);
  paintArm(ctx, [4.61 * build, shoulderY + 0.95], pose.rightArm, skin);

  paintHead(
    ctx,
    shoulderY - 4.12,
    skin,
    hair,
    hairCut,
    child,
    !child && (seed >>> 8) % 5 === 0 && unit.sex === 'M',
  );
  if (foreign) paintInsignia(ctx, foreign === 'hostile', -1.9, shoulderY + 3.1);
  ctx.restore();
}

/** A seated portrait frame uses the same pigments and facial planes as the map. */
export function paintTribePortrait(
  ctx: CanvasRenderingContext2D,
  id: string,
  stage: LifeStage,
  sex: Unit['sex'],
) {
  const seed = appearanceSeed(id);
  const { skin, fabric, hair, hairCut } = personPigments(seed, stage);
  const newborn = stage === 'newborn';
  const child = stage === 'child';
  const block = ctx.canvas;
  ctx.clearRect(0, 0, block.width, block.height);
  ctx.save();
  ctx.translate(block.width * 0.48, block.height * (newborn ? 0.84 : 0.37));
  ctx.scale(block.width / 15, block.width / 15);
  if (newborn) {
    paintResting(ctx, fabric, skin, hair, true, 1);
  } else {
    const cut = child ? 'tunic' : cuts[(seed >>> 16) % cuts.length];
    const build = 0.91 + ((seed >>> 12) % 7) * 0.031;
    paintClothes(ctx, 4.12, build, cut, fabric);
    paintHead(ctx, 0, skin, hair, hairCut, child, !child && (seed >>> 8) % 5 === 0 && sex === 'M');
  }
  ctx.restore();
}
