import { getLifeStage, resolveUnitSex } from '../game/demography';
import type { Unit } from '../game/types';
import type { VisibleUnitEquipment } from '../game/unitEquipment';
import { getUnitAnimation, type UnitAnimationPose } from './unitAnimation';
export { isWalkingPose } from './unitAnimation';

type ColorSet = { base: string; light: string; shade: string };
const hides: ColorSet[] = [
  { base: '#8e6545', light: '#c6a371', shade: '#594333' },
  { base: '#a36950', light: '#d1a17b', shade: '#634439' },
  { base: '#747456', light: '#b1ad80', shade: '#4b5140' },
  { base: '#94784f', light: '#cbb083', shade: '#5e4c36' },
  { base: '#9d7861', light: '#d3b28f', shade: '#604a3f' },
  { base: '#6f7e6a', light: '#afbd97', shade: '#465a4c' },
];
const skins: ColorSet[] = [
  { base: '#b58d66', light: '#e3bd91', shade: '#7e5c43' },
  { base: '#aa805c', light: '#d6b18a', shade: '#74513b' },
  { base: '#bd9976', light: '#e7c9a2', shade: '#88644c' },
  { base: '#9a7355', light: '#c9a67d', shade: '#674d3a' },
];

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
function stroke(ctx: CanvasRenderingContext2D, points: number[][], color: string, width: number) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
function shade(
  ctx: CanvasRenderingContext2D,
  color: ColorSet,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const paint = ctx.createLinearGradient(x1, y1, x2, y2);
  paint.addColorStop(0, color.light);
  paint.addColorStop(0.38, color.base);
  paint.addColorStop(1, color.shade);
  return paint;
}
function limb(ctx: CanvasRenderingContext2D, points: number[][], color: ColorSet, width: number) {
  stroke(ctx, points, color.shade, width + 0.55);
  stroke(
    ctx,
    points.map(([x, y]) => [x - 0.3, y - 0.22]),
    color.base,
    width,
  );
  stroke(
    ctx,
    points.map(([x, y]) => [x - 0.75, y - 0.35]),
    color.light,
    width * 0.25,
  );
}

/** Local artwork: feet stay at the actual unit position, with no effect on its FSM. */
export function drawPainterlyBody(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  time: number,
  equipment: VisibleUnitEquipment,
  pose = getUnitAnimation(unit, time, { equipment }),
  foreign?: 'visitor' | 'hostile',
) {
  ctx.save();
  ctx.scale(pose.facing, 1);
  paintBody(ctx, unit, time, equipment, pose);
  if (foreign) {
    // Sewn shoulder insignia stays inside the person's existing clickable silhouette.
    const sleeping = pose.kind === 'sleep';
    ctx.save();
    ctx.translate(sleeping ? -2 : -3, sleeping ? -4 : -21 + pose.bodyDrop);
    ctx.fillStyle = foreign === 'hostile' ? '#9e4f3e' : '#557e85';
    ctx.strokeStyle = '#f0dfb8';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(-2.2, -1.5);
    ctx.lineTo(2.2, -1.5);
    ctx.lineTo(2.2, 3.2);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-2.2, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    stroke(
      ctx,
      [
        [-1, -0.4],
        [1, 1.5],
      ],
      '#f0dfb8',
      0.7,
    );
    if (foreign === 'hostile')
      stroke(
        ctx,
        [
          [1, -0.4],
          [-1, 1.5],
        ],
        '#f0dfb8',
        0.7,
      );
    ctx.restore();
  }
  ctx.restore();
}

function paintBody(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  time: number,
  equipment: VisibleUnitEquipment,
  pose: UnitAnimationPose,
) {
  const id = Array.from(unit.id).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const stage = getLifeStage(unit),
    female = resolveUnitSex(unit) === 'F';
  const elder = stage === 'elder',
    child = stage === 'child',
    newborn = stage === 'newborn';
  const skin = skins[id % skins.length];
  const hide = hides[(id + (female ? 1 : 0) + (child ? 3 : 0)) % hides.length];
  const hair = elder ? '#c5c6b5' : ['#3e3a2e', '#514437', '#423d30'][id % 3];
  const hairLight = elder ? '#edead8' : '#78654d';
  const sleeping = pose.kind === 'sleep';
  const step = pose.step;

  if (newborn) {
    const wrap = shade(ctx, hide, -4, -14, 5, 0);
    ctx.beginPath();
    ctx.moveTo(-3.2, -13);
    ctx.bezierCurveTo(-6.6, -9, -5.7, -1.5, -1.2, 0);
    ctx.bezierCurveTo(4.6, 1.2, 6, -5.7, 3.8, -12.1);
    ctx.closePath();
    ctx.fillStyle = wrap;
    ctx.fill();
    stroke(
      ctx,
      [
        [-3.8, -9.9],
        [2.7, -6],
        [-2.8, -2.2],
      ],
      '#d9c9a6',
      0.85,
    );
    stroke(
      ctx,
      [
        [-3.8, -10.7],
        [3.2, -7],
        [2, -3.2],
      ],
      hide.shade,
      0.5,
    );
    ellipse(ctx, 0.4, -12.8, 3, 3.25, skin.base);
    ellipse(ctx, -0.35, -13.4, 1.95, 2.5, skin.light);
    ctx.beginPath();
    ctx.moveTo(-2.6, -13.4);
    ctx.bezierCurveTo(-2.8, -17.8, 4, -17.5, 3.3, -12.9);
    ctx.quadraticCurveTo(1, -15.1, -2.6, -13.4);
    ctx.fillStyle = hair;
    ctx.fill();
    stroke(
      ctx,
      [
        [-0.5, -12.3],
        [0.4, -12.2],
      ],
      skin.shade,
      0.35,
    );
    return;
  }
  if (sleeping) {
    ctx.scale(1, 1 + Math.sin(time * 1.6 + id) * 0.012);
    const blanket = shade(ctx, hide, -7, -7, 7, 3);
    ctx.beginPath();
    ctx.moveTo(-8, -0.8);
    ctx.bezierCurveTo(-7, -6.2, 2, -7.2, 6, -3.1);
    ctx.bezierCurveTo(10, -1, 4.2, 3.6, -3.8, 2.8);
    ctx.quadraticCurveTo(-9, 3.2, -8, -0.8);
    ctx.fillStyle = blanket;
    ctx.fill();
    stroke(
      ctx,
      [
        [-5.8, -2.8],
        [-0.2, -1.4],
        [3.1, 1.3],
      ],
      hide.light,
      0.65,
    );
    stroke(
      ctx,
      [
        [-4.7, 1],
        [-1.9, -1.7],
        [1.5, -2.7],
      ],
      hide.shade,
      0.6,
    );
    ellipse(ctx, 6.7, -2.9, 3.2, 2.7, skin.base);
    ellipse(ctx, 6.1, -3.7, 2.1, 1.8, skin.light);
    ellipse(ctx, 8.3, -3.7, 2, 2.6, hair);
    stroke(
      ctx,
      [
        [4.7, -2.2],
        [5.6, -2.3],
      ],
      skin.shade,
      0.35,
    );
    ctx.font = 'italic 7px Georgia';
    ctx.fillStyle = '#5c6958';
    ctx.fillText('z', 8.5, -10);
    return;
  }

  // Jointed legs and small hide-wrapped feet anchor the figure to the soil.
  const stride = step * (pose.kind === 'run' ? 3.7 : 2.5);
  const crouch = pose.bodyDrop * 0.35;
  const liftLeft = Math.max(0, step) * 1.2,
    liftRight = Math.max(0, -step) * 1.2;
  limb(
    ctx,
    [
      [-2, -10 + crouch],
      [-2.6 - stride * 0.45 - crouch * 0.4, -5 + crouch * 0.2],
      [-2.2 + stride * 0.65, -0.1 - liftLeft],
    ],
    skin,
    2.1,
  );
  ellipse(ctx, -2 + stride * 0.65, 0.1 - liftLeft, 2.1, 0.85, '#534738');
  stroke(
    ctx,
    [
      [-3 + stride * 0.65, -0.1 - liftLeft],
      [-1 + stride * 0.65, 0.1 - liftLeft],
    ],
    '#b19a73',
    0.55,
  );
  limb(
    ctx,
    [
      [2, -9.4 + crouch],
      [2.3 + stride * 0.35 + crouch * 0.4, -4.7 + crouch * 0.2],
      [2.5 - stride * 0.65, 0.7 - liftRight],
    ],
    skin,
    2.3,
  );
  ellipse(ctx, 3.1 - stride * 0.65, 0.8 - liftRight, 2.2, 0.95, '#65513c');
  stroke(
    ctx,
    [
      [1.9 - stride * 0.65, 0.35 - liftRight],
      [3.9 - stride * 0.65, 0.55 - liftRight],
    ],
    '#c1a47b',
    0.6,
  );

  ctx.save();
  ctx.translate(0, -9);
  ctx.rotate(pose.torsoAngle);
  ctx.translate(pose.bodyLean, 9 + pose.bodyDrop);
  const shoulderY = elder ? -18.3 : -20.5;
  const lean = elder ? 1.25 : 0;
  const left = pose.leftArm,
    right = pose.rightArm;
  // Arms and equipment use the same joints, including reaching and two-handed blows.
  limb(
    ctx,
    [
      [-4.1 + lean, shoulderY + 1.5],
      [left.elbow.x, left.elbow.y],
      [left.hand.x, left.hand.y],
    ],
    skin,
    2.15,
  );
  ellipse(ctx, left.hand.x, left.hand.y + 0.3, 1.15, 1.6, skin.base);

  const width = female ? 4.35 : 4.75,
    hem = female ? 5.7 : 4.9;
  ctx.beginPath();
  ctx.moveTo(-width + lean, shoulderY + 0.7);
  ctx.bezierCurveTo(
    -3.4 + lean,
    shoulderY - 1.2,
    2.1 + lean,
    shoulderY - 1.3,
    width + lean,
    shoulderY + 0.4,
  );
  ctx.bezierCurveTo(4.3 + lean, -16, 3.5 + lean, -13.4, hem + 0.25, -8.9);
  ctx.lineTo(3.5, -8.5);
  ctx.lineTo(2.4, -7.6);
  ctx.lineTo(0.7, -8.1);
  ctx.lineTo(-0.7, -7.4);
  ctx.lineTo(-2.5, -8.2);
  ctx.lineTo(-4.6, -7.9);
  ctx.bezierCurveTo(-hem - 0.6, -8.4, -4.5 + lean, -13, -width + lean, shoulderY + 0.7);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, hide, -5, -21, 6, -7);
  ctx.fill();
  ctx.strokeStyle = hide.shade;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  // Light stitched shoulder, worn diagonal fold and irregular hide hem.
  stroke(
    ctx,
    [
      [-3.5 + lean, shoulderY + 1],
      [-2.9 + lean, -15.3],
      [-4, -9.1],
    ],
    hide.light,
    0.75,
  );
  stroke(
    ctx,
    [
      [1.8 + lean, shoulderY + 2],
      [0.6 + lean, -15],
      [1.7, -9],
    ],
    hide.shade,
    0.75,
  );
  stroke(
    ctx,
    [
      [-2.3, -11.6],
      [-0.4, -10.1],
      [2.8, -10.5],
    ],
    hide.light,
    0.6,
  );
  for (let i = 0; i < 5; i++) {
    const y = shoulderY + 2 + i * 1.7;
    stroke(
      ctx,
      [
        [-3.4 + lean, y],
        [-2.6 + lean, y + 0.35],
      ],
      '#dbc8a0',
      0.32,
    );
  }
  for (let i = 0; i < 7; i++) {
    const xx = -3.5 + i * 1.05;
    stroke(
      ctx,
      [
        [xx, -9 + (i % 3) * 0.25],
        [xx + 0.3, -8.3 + (i % 2) * 0.35],
      ],
      hide.light,
      0.3,
    );
  }
  // Leather thong, with a tied knot, rather than a ruler-straight belt.
  stroke(
    ctx,
    [
      [-4.2, -13.3],
      [-0.9, -12.8],
      [4.2, -13.5],
    ],
    '#5e4c37',
    0.7,
  );
  stroke(
    ctx,
    [
      [1.3, -13.1],
      [1.8, -11.2],
      [2.3, -13],
    ],
    '#d2b489',
    0.55,
  );

  if (equipment.armor === 'metal') {
    ctx.beginPath();
    ctx.moveTo(-3.9 + lean, shoulderY + 2);
    ctx.quadraticCurveTo(0, shoulderY + 3, 3.9 + lean, shoulderY + 1.7);
    ctx.lineTo(3.1, -12);
    ctx.quadraticCurveTo(0, -11.1, -3.5, -12);
    ctx.closePath();
    const metal = ctx.createLinearGradient(-4, -20, 4, -11);
    metal.addColorStop(0, '#dde1c9');
    metal.addColorStop(0.4, '#a5b2a0');
    metal.addColorStop(1, '#647a72');
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = '#596e63';
    ctx.lineWidth = 0.55;
    ctx.stroke();
    stroke(
      ctx,
      [
        [-1.9, shoulderY + 3.3],
        [-1.4, -13.1],
        [1.9, -13.3],
      ],
      '#d9debd',
      0.6,
    );
    for (let i = 0; i < 3; i++) ellipse(ctx, 2.8, -14 - i * 2, 0.35, 0.35, '#e1d1a3');
  } else if (equipment.armor === 'pelt') {
    ctx.beginPath();
    ctx.moveTo(-5 + lean, shoulderY + 0.3);
    ctx.quadraticCurveTo(0, shoulderY - 1.1, 5.2 + lean, shoulderY + 0.5);
    ctx.lineTo(4.8, -14.3);
    ctx.lineTo(3, -15.1);
    ctx.lineTo(1.4, -14.1);
    ctx.lineTo(-1, -15.3);
    ctx.lineTo(-3.2, -14.6);
    ctx.lineTo(-5.1, -15.5);
    ctx.closePath();
    ctx.fillStyle = shade(
      ctx,
      { light: '#e2cda5', base: '#ad9170', shade: '#76614d' },
      -4,
      -22,
      5,
      -13,
    );
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      const xx = -4.4 + (i % 6) * 1.65,
        yy = shoulderY + 1.3 + Math.floor(i / 6) * 2;
      stroke(
        ctx,
        [
          [xx, yy],
          [xx - 0.3, yy + 1.4],
        ],
        i % 2 ? '#d8c09a' : '#92775d',
        0.4,
      );
    }
  }

  limb(
    ctx,
    [
      [4.1 + lean, shoulderY + 1.4],
      [right.elbow.x, right.elbow.y],
      [right.hand.x, right.hand.y],
    ],
    skin,
    2.3,
  );
  ellipse(ctx, right.hand.x, right.hand.y + 0.4, 1.25, 1.65, skin.base);
  stroke(
    ctx,
    [
      [right.hand.x - 0.6, right.hand.y],
      [right.hand.x - 0.4, right.hand.y + 1],
    ],
    skin.light,
    0.5,
  );

  const hx = elder ? 1.8 : lean * 0.65,
    hy = elder ? -24 : -26.6;
  const headWidth = child ? 3.5 : 3.1;
  const look = 1;
  // Wavy lengths behind the neck distinguish tied and loose hair without a symbol.
  if (female && !child) {
    ctx.beginPath();
    ctx.moveTo(hx - 3.1, hy - 1);
    ctx.bezierCurveTo(hx - 5.5, hy + 3, hx - 3.5, hy + 6.9, hx - 0.8, hy + 7.2);
    ctx.bezierCurveTo(hx + 1.2, hy + 6.6, hx + 5.8, hy + 6.7, hx + 4, hy + 0.1);
    ctx.closePath();
    ctx.fillStyle = hair;
    ctx.fill();
    stroke(
      ctx,
      [
        [hx + 3.3, hy + 1.6],
        [hx + 3.9, hy + 4.9],
        [hx + 2.4, hy + 6],
      ],
      hairLight,
      0.45,
    );
  }
  limb(
    ctx,
    [
      [hx - 0.4, hy + 2.3],
      [hx - 0.1, shoulderY + 0.1],
    ],
    skin,
    2.8,
  );
  // A three-quarter face: cheek, small nose and jaw in a single painted contour.
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(look, 1);
  ellipse(ctx, -headWidth + 0.1, 0.6, 0.8, 1.25, skin.shade);
  ctx.beginPath();
  ctx.moveTo(-headWidth, -0.7);
  ctx.bezierCurveTo(-headWidth - 0.5, -3.7, -1.7, -4.5, 0.6, -4.1);
  ctx.bezierCurveTo(2.6, -3.8, 3.2, -2.1, 2.8, -0.8);
  ctx.lineTo(3.55, 0.4);
  ctx.lineTo(2.9, 0.9);
  ctx.bezierCurveTo(3, 2.3, 1.9, 3.3, 0.4, 3.65);
  ctx.bezierCurveTo(-1.6, 3.9, -2.7, 1.9, -headWidth, -0.7);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, skin, -3, -3, 3.5, 3);
  ctx.fill();
  ellipse(ctx, -1.5, -0.4, 0.75, 1.15, skin.base);
  stroke(
    ctx,
    [
      [-1.8, -0.8],
      [-1.7, 0.2],
    ],
    skin.light,
    0.45,
  );
  // Hair has an uneven hairline and fine strands, not a flat disc.
  ctx.beginPath();
  ctx.moveTo(-3.1, 1.5);
  ctx.bezierCurveTo(-4.7, -0.7, -4.6, -3.9, -1.8, -4.8);
  ctx.bezierCurveTo(-0.5, -5.5, 1.9, -4.7, 3, -3.2);
  ctx.lineTo(2, -2.2);
  ctx.lineTo(0.9, -2.8);
  ctx.lineTo(-0.6, -2.1);
  ctx.lineTo(-1.8, -2.3);
  ctx.lineTo(-2.7, 1.7);
  ctx.closePath();
  ctx.fillStyle = hair;
  ctx.fill();
  stroke(
    ctx,
    [
      [-3.3, -1.6],
      [-2.8, -3.3],
      [-1.1, -4.1],
      [0.8, -3.8],
    ],
    hairLight,
    0.45,
  );
  stroke(
    ctx,
    [
      [-3.1, 0],
      [-2.8, -1.8],
    ],
    hairLight,
    0.35,
  );
  if ((female && id % 2) || elder) {
    ellipse(ctx, -3.5, -1.4, elder ? 1.4 : 1.7, elder ? 1.8 : 2.1, hair);
    stroke(
      ctx,
      [
        [-4.1, -2.2],
        [-3.5, -0.3],
      ],
      hairLight,
      0.45,
    );
    if (!elder)
      stroke(
        ctx,
        [
          [-4.7, -1.6],
          [-2.9, -1.4],
        ],
        '#bd9d6c',
        0.55,
      );
  }
  stroke(
    ctx,
    [
      [0.5, -1.25],
      [1.8, -1.1],
    ],
    '#5c4534',
    0.45,
  );
  ellipse(ctx, 1.45, -0.55, 0.26, 0.33, '#302f26');
  stroke(
    ctx,
    [
      [2.3, 0],
      [2.6, 0.8],
      [1.8, 1],
    ],
    skin.shade,
    0.32,
  );
  stroke(
    ctx,
    [
      [1.1, 2.15],
      [2, 2.05],
    ],
    '#855841',
    0.4,
  );
  if (!female && !child && (elder || id % 3 === 0)) {
    ctx.beginPath();
    ctx.moveTo(-1.1, 1.1);
    ctx.quadraticCurveTo(0.9, 2.7, 2.7, 1.5);
    ctx.quadraticCurveTo(2.1, 4.3, 0.1, 4.3);
    ctx.lineTo(-1.5, 2.4);
    ctx.closePath();
    ctx.fillStyle = hair;
    ctx.fill();
    stroke(
      ctx,
      [
        [-0.5, 2.3],
        [0.5, 3.4],
        [1.4, 2.6],
      ],
      hairLight,
      0.4,
    );
  }
  if (elder) {
    stroke(
      ctx,
      [
        [0.1, 0.5],
        [0.8, 0.8],
      ],
      '#8f755a',
      0.28,
    );
    stroke(
      ctx,
      [
        [0.1, -1.7],
        [0.9, -1.95],
      ],
      '#8f755a',
      0.28,
    );
    stroke(
      ctx,
      [
        [-1.3, -4],
        [-0.7, -2.9],
      ],
      '#efeada',
      0.6,
    );
  }
  ctx.restore();

  if (elder && !equipment.held && ['idle', 'walk', 'guard'].includes(pose.kind)) {
    ctx.beginPath();
    ctx.moveTo(7, -10);
    ctx.quadraticCurveTo(9, -12, 10.1, -9.8);
    ctx.lineTo(10.8, 1.1);
    ctx.strokeStyle = '#5e4a35';
    ctx.lineWidth = 1.65;
    ctx.lineCap = 'round';
    ctx.stroke();
    stroke(
      ctx,
      [
        [9.9, -8],
        [10.4, 0.5],
      ],
      '#b1976b',
      0.45,
    );
    stroke(
      ctx,
      [
        [10, -4],
        [10.7, -4.4],
      ],
      '#3f3b2d',
      0.45,
    );
  }
  if (child) {
    stroke(
      ctx,
      [
        [-1, -18.5],
        [-1, -15],
      ],
      '#ded3b2',
      0.65,
    );
    ellipse(ctx, 0, -17.5, 1.15, 0.6, '#cad0a5');
  }
  ctx.restore();
}
