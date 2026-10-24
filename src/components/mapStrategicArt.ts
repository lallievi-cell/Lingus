import type { Battalion, Caravan } from '../game/types';

type Point = [number, number];

function line(ctx: CanvasRenderingContext2D, points: Point[], color: string, width = 0.6) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function shape(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasGradient) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
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

function shadow(ctx: CanvasRenderingContext2D, width: number) {
  ctx.save();
  ctx.translate(1, 1);
  ctx.scale(width, 3);
  const paint = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  paint.addColorStop(0, '#3c493641');
  paint.addColorStop(1, '#3c493600');
  oval(ctx, 0, 0, 1, 1, paint);
  ctx.restore();
}

function cloth(ctx: CanvasRenderingContext2D, own: boolean) {
  const paint = ctx.createLinearGradient(-3, -12, 3, -4);
  paint.addColorStop(0, own ? '#b9bf8b' : '#c59d78');
  paint.addColorStop(0.5, own ? '#788460' : '#a57559');
  paint.addColorStop(1, own ? '#495e4b' : '#72523f');
  return paint;
}

/** Strategic figures represent a formation, rather than inventing individual units. */
function traveller(
  ctx: CanvasRenderingContext2D,
  own: boolean,
  step: number,
  elder = false,
  armed: 'wood' | 'metal' | null = null,
) {
  line(
    ctx,
    [
      [-1.1, -5.5],
      [-1.2 - step, -2.4],
      [-1.3 + step, 0],
    ],
    '#876e4e',
    1.1,
  );
  line(
    ctx,
    [
      [1.1, -5.4],
      [1.3 + step, -2.2],
      [1.6 - step, 0.1],
    ],
    '#9c805c',
    1.2,
  );
  line(
    ctx,
    [
      [-1.8 + step, 0],
      [-0.8 + step, 0],
    ],
    '#564e39',
    0.7,
  );
  line(
    ctx,
    [
      [1.1 - step, 0.1],
      [2.3 - step, 0.1],
    ],
    '#564e39',
    0.7,
  );
  line(
    ctx,
    [
      [-2, -10],
      [-3.2, -7],
      [-2.7 - step * 0.4, -5.6],
    ],
    '#a88763',
    1.1,
  );
  ctx.beginPath();
  ctx.moveTo(-1.9, -10.7);
  ctx.quadraticCurveTo(0, -12, 2, -10.5);
  ctx.lineTo(2.5, -4.8);
  ctx.quadraticCurveTo(0.5, -4.2, -2.5, -4.8);
  ctx.closePath();
  ctx.fillStyle = cloth(ctx, own);
  ctx.fill();
  line(
    ctx,
    [
      [-1.3, -10.4],
      [-1.6, -6],
    ],
    '#d0c59b',
    0.45,
  );
  line(
    ctx,
    [
      [0.9, -10],
      [0.4, -7],
      [1, -5.1],
    ],
    '#55604a',
    0.45,
  );
  line(
    ctx,
    [
      [-2.1, -7],
      [2.2, -7.2],
    ],
    '#6d573c',
    0.6,
  );
  line(
    ctx,
    [
      [1.9, -10],
      [3, -7.8],
      [3, -6.1],
    ],
    '#b08e65',
    1.1,
  );
  oval(ctx, 0.3, -12, 1.6, 2, '#bd9870');
  oval(ctx, -0.15, -12.5, 1.05, 1.45, '#d5b48a');
  ctx.beginPath();
  ctx.moveTo(-1.3, -12);
  ctx.bezierCurveTo(-2, -15.1, 2.8, -15.1, 1.9, -11.8);
  ctx.lineTo(1, -13.1);
  ctx.lineTo(-0.7, -12.7);
  ctx.closePath();
  ctx.fillStyle = elder ? '#dbd8c5' : '#4f4937';
  ctx.fill();
  oval(ctx, 1.5, -11.8, 0.25, 0.25, '#4d4635');
  if (armed === 'wood') {
    line(
      ctx,
      [
        [3.8, 0],
        [3.2, -15],
      ],
      '#7c6445',
      0.85,
    );
    line(
      ctx,
      [
        [3.4, -10],
        [3.2, -14.5],
      ],
      '#b9a27a',
      0.3,
    );
  } else if (armed === 'metal') {
    shape(
      ctx,
      [
        [3, -6.4],
        [2.7, -12],
        [3.5, -14.2],
        [4.1, -12],
        [3.9, -6.4],
      ],
      '#b9b9a1',
    );
    line(
      ctx,
      [
        [3.5, -12.7],
        [3.5, -7.3],
      ],
      '#ece7c7',
      0.35,
    );
    line(
      ctx,
      [
        [2.5, -6.3],
        [4.3, -6.3],
      ],
      '#b59765',
      0.6,
    );
    line(
      ctx,
      [
        [3.4, -6],
        [3.4, -4.6],
      ],
      '#735438',
      0.8,
    );
  } else if (elder) {
    line(
      ctx,
      [
        [3.2, -7],
        [4.4, -8],
        [4.8, 0.2],
      ],
      '#7b6546',
      0.7,
    );
  }
}

function pennant(ctx: CanvasRenderingContext2D, x: number, time: number, own: boolean) {
  line(
    ctx,
    [
      [x, 0],
      [x, -21],
    ],
    '#7a6748',
    0.7,
  );
  const drift = Math.sin(time * 2) * 0.6;
  ctx.beginPath();
  ctx.moveTo(x, -21);
  ctx.bezierCurveTo(x + 2, -22 + drift, x + 3, -19.5 + drift, x + 6, -20.1);
  ctx.lineTo(x + 4.7, -17.1);
  ctx.quadraticCurveTo(x + 2.5, -17.2 + drift, x, -18.2);
  ctx.closePath();
  ctx.fillStyle = own ? '#a4ac77' : '#b78b65';
  ctx.fill();
  line(
    ctx,
    [
      [x + 0.3, -20.3],
      [x + 3.2, -19.8 + drift],
    ],
    '#ded0a0',
    0.4,
  );
}

function siege(ctx: CanvasRenderingContext2D) {
  for (const x of [-4, 4]) {
    oval(ctx, x, 0, 1.6, 1.8, '#514c38');
    oval(ctx, x - 0.2, -0.1, 1.1, 1.3, '#9b8058');
    line(
      ctx,
      [
        [x, -1.2],
        [x, 1],
      ],
      '#d1b384',
      0.35,
    );
  }
  shape(
    ctx,
    [
      [-5, -2],
      [3, -3],
      [5, -1.4],
      [-3.7, -0.6],
    ],
    '#866b47',
  );
  line(
    ctx,
    [
      [-3, -2],
      [0, -8],
      [3, -2],
    ],
    '#a48a5d',
    1.1,
  );
  line(
    ctx,
    [
      [-1, -3],
      [3.8, -10.4],
    ],
    '#705b3e',
    1,
  );
  oval(ctx, 4, -10.5, 1.8, 0.7, '#665b41');
  line(
    ctx,
    [
      [-3, -2],
      [-2, -5],
      [0, -8],
    ],
    '#d0b481',
    0.35,
  );
  line(
    ctx,
    [
      [-3.5, -4],
      [3.5, -4.2],
    ],
    '#5e593d',
    0.65,
  );
}

function horse(ctx: CanvasRenderingContext2D, step: number) {
  line(
    ctx,
    [
      [-3, -6],
      [-3.4 - step, -2],
      [-4 + step, 0],
    ],
    '#7a6246',
    0.9,
  );
  line(
    ctx,
    [
      [3, -6],
      [3 + step, -2],
      [2.5 - step, 0],
    ],
    '#7a6246',
    0.9,
  );
  ctx.beginPath();
  ctx.moveTo(-5, -7);
  ctx.bezierCurveTo(-4, -10, 2, -10, 4, -8);
  ctx.lineTo(5, -12);
  ctx.lineTo(7, -11.7);
  ctx.lineTo(8.2, -9);
  ctx.lineTo(6.1, -8.5);
  ctx.lineTo(5.2, -5.4);
  ctx.quadraticCurveTo(0, -4, -5, -6);
  ctx.closePath();
  ctx.fillStyle = '#ab8a5e';
  ctx.fill();
  line(
    ctx,
    [
      [-4, -8.6],
      [0, -9],
      [3.5, -7.8],
    ],
    '#ccb184',
    0.5,
  );
  line(
    ctx,
    [
      [-4.5, -7],
      [-6.5, -5],
      [-6.6, -2],
    ],
    '#66583f',
    0.9,
  );
  line(
    ctx,
    [
      [4.5, -8],
      [5.6, -11.3],
    ],
    '#594e3a',
    0.8,
  );
  oval(ctx, 6.7, -10.5, 0.2, 0.2, '#393f30');
}

/** Local strategic artwork; the caller anchors it at the real battalion position. */
export function drawPainterlyBattalion(
  ctx: CanvasRenderingContext2D,
  battalion: Battalion,
  time: number,
) {
  ctx.save();
  shadow(ctx, battalion.catapult ? 16 : 12);
  const moving = /mov|march|return|retreat|patrol/i.test(battalion.action);
  const own = battalion.factionId === 'player';
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate((i - 1) * 6, i === 1 ? 0.5 : -1.2);
    const step = moving ? Math.sin(time * 7 + i * 2) * 0.65 : 0;
    if (battalion.cavalry && i === 1) {
      horse(ctx, step);
      ctx.translate(-0.5, -5.3);
      ctx.scale(0.74, 0.74);
    }
    traveller(ctx, own, step, false, i < (battalion.metalWeapons ?? 0) ? 'metal' : 'wood');
    ctx.restore();
  }
  pennant(ctx, -9, time, own);
  if (battalion.catapult) {
    ctx.save();
    ctx.translate(11, 1);
    siege(ctx);
    ctx.restore();
  }
  ctx.restore();
}

function wheel(ctx: CanvasRenderingContext2D, x: number, time: number) {
  ctx.save();
  ctx.translate(x, 0);
  oval(ctx, 0, 0, 1.7, 1.9, '#5a523d');
  oval(ctx, -0.15, -0.1, 1.25, 1.5, '#a78d61');
  for (let i = 0; i < 3; i++) {
    const angle = time * 1.5 + (i * Math.PI) / 3;
    line(
      ctx,
      [
        [Math.cos(angle) * -1.1, Math.sin(angle) * -1.3],
        [Math.cos(angle) * 1.1, Math.sin(angle) * 1.3],
      ],
      '#d5bc87',
      0.35,
    );
  }
  oval(ctx, 0, 0, 0.4, 0.4, '#64553c');
  ctx.restore();
}

/** Kind and actual cargo are preserved; no goods or travellers are added to state. */
export function drawPainterlyCaravan(
  ctx: CanvasRenderingContext2D,
  caravan: Caravan,
  time: number,
) {
  ctx.save();
  shadow(ctx, 9);
  const own = caravan.factionId === 'player';
  const moving = !caravan.arrived && !caravan.customsRefused;
  const phase = moving ? time : 0;
  const hasCargo = Object.values(caravan.resources).some((amount) => amount > 0);
  if (caravan.kind === 'delegate' && (caravan.delegateCount ?? caravan.population) > 0) {
    ctx.save();
    ctx.scale(0.85, 0.85);
    traveller(ctx, own, Math.sin(phase * 7) * 0.6, true);
    ctx.restore();
    if ((caravan.delegateCount ?? caravan.population) > 1) {
      ctx.save();
      ctx.translate(-4.2, -1);
      ctx.scale(0.65, 0.65);
      traveller(ctx, own, Math.sin(phase * 7 + 2) * 0.6, true);
      ctx.restore();
    }
  } else {
    wheel(ctx, -4.5, phase);
    wheel(ctx, 4, phase);
    shape(
      ctx,
      [
        [-6, -6],
        [4, -7],
        [6, -4.8],
        [5.5, -1.8],
        [-5.4, -1],
      ],
      '#987b52',
    );
    shape(
      ctx,
      [
        [-5.5, -5.2],
        [5.3, -4.6],
        [5.2, -2.1],
        [-5, -1.5],
      ],
      '#b59a69',
    );
    line(
      ctx,
      [
        [-5, -3.8],
        [5, -3.4],
      ],
      '#d2b784',
      0.45,
    );
    line(
      ctx,
      [
        [-4, -5],
        [-3.5, -1.7],
      ],
      '#7f6747',
      0.5,
    );
    line(
      ctx,
      [
        [3.5, -4.5],
        [3.8, -2],
      ],
      '#7f6747',
      0.5,
    );
    line(
      ctx,
      [
        [5.3, -3],
        [9, -2.8],
      ],
      '#886c49',
      0.8,
    );
    if (hasCargo) {
      oval(ctx, -1.5, -7, 3.1, 2.5, caravan.kind === 'tax' ? '#bdb594' : '#ba9c6b');
      oval(ctx, 2.3, -6.4, 2.3, 2.1, '#8b9271');
      line(
        ctx,
        [
          [-2, -8.7],
          [-1.3, -6.8],
          [-1.7, -5.5],
        ],
        '#e1cfa2',
        0.5,
      );
      line(
        ctx,
        [
          [1.7, -7.5],
          [2.8, -5],
        ],
        '#d2c99e',
        0.45,
      );
    }
    if (caravan.kind === 'colonists' && caravan.population > 0) {
      ctx.save();
      ctx.translate(-6, -0.2);
      ctx.scale(0.63, 0.63);
      traveller(ctx, own, Math.sin(phase * 7) * 0.6);
      ctx.restore();
    }
    if (caravan.kind === 'tax') {
      line(
        ctx,
        [
          [4.5, -5],
          [4.5, -11],
        ],
        '#7e6948',
        0.55,
      );
      shape(
        ctx,
        [
          [4.5, -11],
          [7.3, -10.7],
          [6.9, -8],
          [4.5, -8.5],
        ],
        own ? '#8e9d71' : '#ba8f6a',
      );
    }
  }
  ctx.restore();
}
