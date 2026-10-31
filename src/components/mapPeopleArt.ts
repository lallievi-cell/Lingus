import { getLifeStage, resolveUnitSex } from '../game/demography';
import type { Unit } from '../game/types';
import type { VisibleUnitEquipment } from '../game/unitEquipment';
import { getUnitAnimation, type UnitAnimationPose } from './unitAnimation';
export { isWalkingPose } from './unitAnimation';

type ColorSet = { base: string; light: string; shade: string };
const hides: ColorSet[] = [
  { base: '#a78055', light: '#d8ba88', shade: '#756352' },
  { base: '#a96d58', light: '#d7ab89', shade: '#7a6057' },
  { base: '#627967', light: '#acb798', shade: '#465b50' },
  { base: '#ad915b', light: '#dfcd9b', shade: '#84734f' },
  { base: '#94715b', light: '#cfaf8e', shade: '#725d54' },
  { base: '#7c8c7e', light: '#bcc6ad', shade: '#586d63' },
];
const skins: ColorSet[] = [
  { base: '#bd9774', light: '#e7cba5', shade: '#8c7261' },
  { base: '#aa805e', light: '#d8b795', shade: '#795f50' },
  { base: '#c5a281', light: '#ebd1b0', shade: '#967760' },
  { base: '#987456', light: '#c6a685', shade: '#6b5548' },
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
  paint.addColorStop(0.16, color.light);
  paint.addColorStop(0.57, color.base);
  paint.addColorStop(1, color.shade);
  return paint;
}
function limb(ctx: CanvasRenderingContext2D, points: number[][], color: ColorSet, width: number) {
  // Paint a rounded volume directly. A complete dark perimeter becomes an ink
  // outline at mobile size; the shaded right edge supplies separation instead.
  stroke(ctx, points, color.base, width);
  stroke(
    ctx,
    points.map(([x, y]) => [x + width * 0.23, y + 0.12]),
    `${color.shade}b0`,
    width * 0.34,
  );
  stroke(
    ctx,
    points.map(([x, y]) => [x - 0.45, y - 0.25]),
    `${color.light}75`,
    width * 0.3,
  );
}

function paintPlane(ctx: CanvasRenderingContext2D, points: number[][], color: string) {
  ctx.beginPath();
  // Slightly softened brush corners keep the broad planes from looking cut out.
  const last = points.at(-1)!;
  ctx.moveTo((last[0] + points[0][0]) / 2, (last[1] + points[0][1]) / 2);
  points.forEach(([x, y], index) => {
    const next = points[(index + 1) % points.length];
    ctx.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
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
  const hair = elder ? '#d9d9ca' : ['#332f29', '#544234', '#42372d'][id % 3];
  const hairLight = elder ? '#fff5dc' : '#95704d';
  const sleeping = pose.kind === 'sleep';
  const step = pose.step;

  if (newborn) {
    const wrap = shade(ctx, { base: '#d4bd8d', light: '#f4e3b8', shade: '#9d825d' }, -4, -14, 5, 0);
    ctx.beginPath();
    ctx.moveTo(-3.8, -13);
    ctx.bezierCurveTo(-7.3, -9, -6.4, -1.5, -1.2, 0);
    ctx.bezierCurveTo(5.1, 1.2, 6.8, -5.7, 4.2, -12.1);
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
      '#fcf0ce',
      1.15,
    );
    stroke(
      ctx,
      [
        [-3.8, -10.7],
        [3.2, -7],
        [2, -3.2],
      ],
      '#9b7d55',
      0.65,
    );
    ellipse(ctx, 0.4, -12.8, 3.35, 3.55, skin.shade);
    ellipse(ctx, -0.1, -13.25, 2.9, 3.1, skin.light);
    ellipse(ctx, 1.65, -11.65, 0.8, 0.55, '#c99571');
    ctx.beginPath();
    ctx.moveTo(-2.6, -13.4);
    ctx.bezierCurveTo(-3.1, -18.3, 4.4, -17.9, 3.7, -12.9);
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
      0.55,
    );
    return;
  }
  if (sleeping) {
    ctx.scale(1, 1 + Math.sin(time * 1.6 + id) * 0.012);
    const blanket = shade(ctx, hide, -8, -7, 8, 3);
    ctx.beginPath();
    ctx.moveTo(-9, -0.8);
    ctx.bezierCurveTo(-8, -7, 2.4, -7.8, 6.8, -3.1);
    ctx.bezierCurveTo(11, -1, 4.2, 4, -4.2, 3);
    ctx.quadraticCurveTo(-10, 3.2, -9, -0.8);
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
      1.1,
    );
    stroke(
      ctx,
      [
        [-4.7, 1],
        [-1.9, -1.7],
        [1.5, -2.7],
      ],
      hide.shade,
      0.8,
    );
    ellipse(ctx, 6.7, -2.9, 3.8, 3.1, skin.shade);
    ellipse(ctx, 6.1, -3.6, 2.8, 2.35, skin.light);
    ellipse(ctx, 8.4, -3.8, 2.35, 3, hair);
    stroke(
      ctx,
      [
        [7.7, -5.5],
        [9.1, -4.8],
      ],
      hairLight,
      0.85,
    );
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
    2.6,
  );
  ellipse(ctx, -2 + stride * 0.65, 0.1 - liftLeft, 2.45, 1.05, '#493b2e');
  stroke(
    ctx,
    [
      [-3 + stride * 0.65, -0.1 - liftLeft],
      [-1 + stride * 0.65, 0.1 - liftLeft],
    ],
    '#b19a73',
    0.7,
  );
  limb(
    ctx,
    [
      [2, -9.4 + crouch],
      [2.3 + stride * 0.35 + crouch * 0.4, -4.7 + crouch * 0.2],
      [2.5 - stride * 0.65, 0.7 - liftRight],
    ],
    skin,
    2.8,
  );
  ellipse(ctx, 3.1 - stride * 0.65, 0.8 - liftRight, 2.55, 1.15, '#6a4b33');
  stroke(
    ctx,
    [
      [1.9 - stride * 0.65, 0.35 - liftRight],
      [3.9 - stride * 0.65, 0.55 - liftRight],
    ],
    '#c1a47b',
    0.75,
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
      [-4.7 + lean, shoulderY + 1.5],
      [left.elbow.x, left.elbow.y],
      [left.hand.x, left.hand.y],
    ],
    skin,
    2.65,
  );
  ellipse(ctx, left.hand.x, left.hand.y + 0.3, 1.5, 1.8, skin.base);
  ellipse(ctx, left.hand.x - 0.45, left.hand.y - 0.15, 0.8, 1.2, skin.light);

  const width = female ? 5.05 : 5.75,
    hem = female ? 6.55 : 5.7;
  ctx.beginPath();
  ctx.moveTo(-width + lean, shoulderY + 0.7);
  ctx.bezierCurveTo(
    -3.8 + lean,
    shoulderY - 1.5,
    2.8 + lean,
    shoulderY - 1.45,
    width + lean,
    shoulderY + 0.4,
  );
  ctx.bezierCurveTo(5.2 + lean, -16, 4.2 + lean, -13.4, hem + 0.25, -8.9);
  ctx.lineTo(4.1, -8.5);
  ctx.lineTo(2.4, -7.6);
  ctx.lineTo(0.7, -8.1);
  ctx.lineTo(-0.7, -7.4);
  ctx.lineTo(-2.5, -8.2);
  ctx.lineTo(-5.2, -7.9);
  ctx.bezierCurveTo(-hem - 0.6, -8.4, -5.1 + lean, -13, -width + lean, shoulderY + 0.7);
  ctx.closePath();
  ctx.fillStyle = shade(ctx, hide, -6, -21, 7, -7);
  ctx.fill();
  ctx.strokeStyle = `${hide.shade}65`;
  ctx.lineWidth = 0.35;
  ctx.stroke();
  // Large broken colour planes give the hide a painted, folded surface. The
  // silhouette and joints, rather than tiny seam marks, carry the mobile view.
  ctx.save();
  ctx.clip();
  paintPlane(
    ctx,
    [
      [-5.8 + lean, shoulderY + 0.2],
      [-1.5 + lean, shoulderY - 0.8],
      [-1.8, -13.4],
      [-4.7, -8],
      [-6.8, -9.1],
    ],
    `${hide.light}8c`,
  );
  paintPlane(
    ctx,
    [
      [1.8 + lean, shoulderY + 0.2],
      [6.5 + lean, shoulderY + 1],
      [6.6, -8],
      [3.5, -8.4],
      [2.2, -14.6],
    ],
    `${hide.shade}68`,
  );
  paintPlane(
    ctx,
    [
      [-5.8, -9.9],
      [-1.2, -10.1],
      [0.1, -9.2],
      [5.9, -10.2],
      [7.2, -6.5],
      [-7.2, -6.7],
    ],
    `${hide.shade}46`,
  );
  for (let i = 0; i < 3; i++) {
    const x = -3.8 + ((id + i * 7) % 11) * 0.7;
    const y = shoulderY + 2.8 + i * 3.1;
    paintPlane(
      ctx,
      [
        [x, y],
        [x + 1.8, y - 0.3],
        [x + 2.6, y + 0.25],
        [x + 0.8, y + 0.75],
      ],
      `${hide.light}35`,
    );
  }
  ctx.restore();
  // Light stitched shoulder, worn diagonal fold and irregular hide hem.
  stroke(
    ctx,
    [
      [-3.5 + lean, shoulderY + 1],
      [-2.9 + lean, -15.3],
      [-4, -9.1],
    ],
    `${hide.light}c0`,
    0.9,
  );
  stroke(
    ctx,
    [
      [1.8 + lean, shoulderY + 2],
      [0.6 + lean, -15],
      [1.7, -9],
    ],
    `${hide.shade}b0`,
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
    0.8,
  );
  for (let i = 0; i < 4; i++) {
    const y = shoulderY + 2.2 + i * 2.1;
    stroke(
      ctx,
      [
        [-3.4 + lean, y],
        [-2.6 + lean, y + 0.35],
      ],
      '#dbc8a0',
      0.55,
    );
  }
  for (let i = 0; i < 5; i++) {
    const xx = -3.8 + i * 1.8;
    stroke(
      ctx,
      [
        [xx, -9 + (i % 3) * 0.25],
        [xx + 0.3, -8.3 + (i % 2) * 0.35],
      ],
      hide.light,
      0.5,
    );
  }
  // Leather thong, with a tied knot, rather than a ruler-straight belt.
  stroke(
    ctx,
    [
      [-5, -13.3],
      [-0.9, -12.8],
      [5, -13.5],
    ],
    '#776751c9',
    0.75,
  );
  stroke(
    ctx,
    [
      [1.3, -13.1],
      [1.8, -11.2],
      [2.3, -13],
    ],
    '#d2b489',
    0.8,
  );

  if (!child && !equipment.armor) {
    // A broad shoulder fold makes the chest read as dressed volume at a glance.
    paintPlane(
      ctx,
      [
        [-width + lean, shoulderY + 0.6],
        [-1.1 + lean, shoulderY + 1.3],
        [2.4 + lean, shoulderY + 3.5],
        [0.1 + lean, shoulderY + 5.1],
        [-3.5 + lean, shoulderY + 3.6],
      ],
      `${hide.shade}5b`,
    );
    stroke(
      ctx,
      [
        [-width + lean, shoulderY + 0.5],
        [-1.2 + lean, shoulderY + 1.2],
        [2.3 + lean, shoulderY + 3.5],
      ],
      hide.light,
      0.9,
    );
    ellipse(ctx, 1.5 + lean, shoulderY + 3.3, 0.85, 0.65, '#f0d7a3');
  }

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
    ctx.moveTo(-6.1 + lean, shoulderY + 0.3);
    ctx.quadraticCurveTo(0, shoulderY - 1.5, 6.2 + lean, shoulderY + 0.5);
    ctx.lineTo(5.5, -14.3);
    ctx.lineTo(3, -15.1);
    ctx.lineTo(1.4, -14.1);
    ctx.lineTo(-1, -15.3);
    ctx.lineTo(-3.2, -14.6);
    ctx.lineTo(-5.8, -15.5);
    ctx.closePath();
    ctx.fillStyle = shade(
      ctx,
      { light: '#f0d8a8', base: '#b89a70', shade: '#705644' },
      -4,
      -22,
      5,
      -13,
    );
    ctx.fill();
    for (let i = 0; i < 10; i++) {
      const xx = -4.8 + (i % 5) * 2.1,
        yy = shoulderY + 1.3 + Math.floor(i / 5) * 2.1;
      stroke(
        ctx,
        [
          [xx, yy],
          [xx - 0.3, yy + 1.4],
        ],
        i % 2 ? '#d8c09a' : '#92775d',
        0.65,
      );
    }
  }

  limb(
    ctx,
    [
      [4.7 + lean, shoulderY + 1.4],
      [right.elbow.x, right.elbow.y],
      [right.hand.x, right.hand.y],
    ],
    skin,
    2.8,
  );
  ellipse(ctx, right.hand.x, right.hand.y + 0.4, 1.55, 1.85, skin.base);
  stroke(
    ctx,
    [
      [right.hand.x - 0.6, right.hand.y],
      [right.hand.x - 0.4, right.hand.y + 1],
    ],
    skin.light,
    0.8,
  );

  const hx = elder ? 2 : lean * 0.65,
    hy = elder ? -24.2 : -26.6;
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
      0.8,
    );
  }
  limb(
    ctx,
    [
      [hx - 0.4, hy + 2.3],
      [hx - 0.1, shoulderY + 0.1],
    ],
    skin,
    3.15,
  );
  // A three-quarter face: cheek, small nose and jaw in a single painted contour.
  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(look * 1.13, 1.08);
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
  paintPlane(
    ctx,
    [
      [-0.3, -2.8],
      [1.9, -2.3],
      [2.6, -0.4],
      [1.5, 0.5],
      [-0.7, -0.2],
    ],
    `${skin.light}d0`,
  );
  paintPlane(
    ctx,
    [
      [0.5, 2.3],
      [2.6, 1.4],
      [2.2, 2.5],
      [0.4, 3.5],
      [-0.5, 2.9],
    ],
    `${skin.shade}85`,
  );
  ellipse(ctx, 1.6, 1.15, 0.9, 0.5, '#bc805e55');
  ellipse(ctx, -1.5, -0.4, 0.75, 1.15, skin.base);
  stroke(
    ctx,
    [
      [-1.8, -0.8],
      [-1.7, 0.2],
    ],
    skin.light,
    0.65,
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
  // Chunky brush-lit locks, with the same upper-left light as the environment.
  paintPlane(
    ctx,
    [
      [-3.7, -2.6],
      [-2.8, -4],
      [-0.9, -4.7],
      [0.2, -4.1],
      [-1.7, -3.6],
      [-2.8, -2.3],
    ],
    `${hairLight}ad`,
  );
  stroke(
    ctx,
    [
      [-3.3, -1.6],
      [-2.8, -3.3],
      [-1.1, -4.1],
      [0.8, -3.8],
    ],
    hairLight,
    0.7,
  );
  stroke(
    ctx,
    [
      [-3.1, 0],
      [-2.8, -1.8],
    ],
    hairLight,
    0.65,
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
      0.8,
    );
    if (!elder)
      stroke(
        ctx,
        [
          [-4.7, -1.6],
          [-2.9, -1.4],
        ],
        '#bd9d6c',
        0.75,
      );
  }
  stroke(
    ctx,
    [
      [0.5, -1.25],
      [1.8, -1.1],
    ],
    '#5c4534',
    0.6,
  );
  ellipse(ctx, 1.45, -0.55, 0.39, 0.43, '#302f26');
  stroke(
    ctx,
    [
      [2.3, 0],
      [2.6, 0.8],
      [1.8, 1],
    ],
    skin.shade,
    0.5,
  );
  stroke(
    ctx,
    [
      [1.1, 2.15],
      [2, 2.05],
    ],
    '#855841',
    0.55,
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
      0.65,
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
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    stroke(
      ctx,
      [
        [9.9, -8],
        [10.4, 0.5],
      ],
      '#b1976b',
      0.8,
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
