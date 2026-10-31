import type { Battalion, Caravan, City, GameState } from '../game/types';
import { getCityPresentation, type CityPresentation } from './cityPresentation';
import { CITY_FOUNDRY_CHIMNEY } from './regionalLayout';

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
  ctx.translate(2, 1.5);
  ctx.scale(width, 3);
  const paint = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  paint.addColorStop(0, '#29433464');
  paint.addColorStop(1, '#3c493600');
  oval(ctx, 0, 0, 1, 1, paint);
  ctx.restore();
}

function cloth(ctx: CanvasRenderingContext2D, own: boolean) {
  const paint = ctx.createLinearGradient(-3, -12, 3, -4);
  paint.addColorStop(0, own ? '#d6d5a2' : '#e0b38a');
  paint.addColorStop(0.5, own ? '#82936c' : '#b77d5c');
  paint.addColorStop(1, own ? '#385b48' : '#674c3d');
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
  oval(ctx, 0, 0, 1.7, 1.9, '#394b38');
  oval(ctx, -0.15, -0.1, 1.25, 1.5, '#c09c65');
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
      '#ac8051',
    );
    shape(
      ctx,
      [
        [-5.5, -5.2],
        [5.3, -4.6],
        [5.2, -2.1],
        [-5, -1.5],
      ],
      '#cca36b',
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

/** Full-size map pixels around the settlement node, before camera zoom. */
export const CITY_ART_BOUNDS = { left: -48, right: 48, top: -47, bottom: 16 } as const;

function cityRoof(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1, formal = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  oval(ctx, 1, 1, 8.7, 2.9, '#4c53302a');
  shape(
    ctx,
    [
      [-7, -8],
      [2, -10],
      [7, -7],
      [7, 0],
      [-6, 1],
    ],
    '#ddcba6',
  );
  shape(
    ctx,
    [
      [2, -10],
      [7, -7],
      [7, 0],
      [2, -1],
    ],
    '#758773',
  );
  shape(
    ctx,
    [
      [-9, -8],
      [-2, -15],
      [8, -10],
      [2, -6],
    ],
    formal ? '#985c43' : '#a17d4b',
  );
  shape(
    ctx,
    [
      [-9, -8],
      [-2, -15],
      [-1, -10],
      [2, -6],
    ],
    formal ? '#c89163' : '#dfbe7f',
  );
  line(
    ctx,
    [
      [-7.7, -8.1],
      [-2, -13.8],
      [6.5, -9.7],
    ],
    formal ? '#edc18b' : '#f3d79c',
    0.85,
  );
  line(
    ctx,
    [
      [-9, -7.7],
      [2, -5.7],
      [8, -9.7],
    ],
    '#43543c8f',
    0.7,
  );
  // Broad roof courses remain visible at regional zoom; they follow the plane.
  for (let row = 1; row < 3; row++) {
    const t = row / 3;
    line(
      ctx,
      [
        [-2 + (-9 + 2) * t, -15 + 7 * t],
        [-2 + 4 * t, -15 + 9 * t],
      ],
      formal ? '#804a363d' : '#69513352',
      0.5,
    );
  }
  if (!formal) {
    for (let i = 0; i < 4; i++)
      line(
        ctx,
        [
          [-6.8 + i * 1.8, -8.7],
          [-2 + i * 1.5, -12.8],
        ],
        '#897b553f',
        0.5,
      );
  }
  shape(
    ctx,
    [
      [-2, -5],
      [0.5, -5.3],
      [0.7, 0],
      [-2, 0.3],
    ],
    '#304c3d',
  );
  line(
    ctx,
    [
      [-4.7, -5],
      [-3, -5.2],
    ],
    '#d8cfb3',
    0.7,
  );
  line(
    ctx,
    [
      [3, -5.6],
      [5, -5.1],
    ],
    '#506055',
    1,
  );
  ctx.restore();
}

function cityFields(ctx: CanvasRenderingContext2D, profile: CityPresentation, season: number) {
  if (!profile.farms.length) return;
  const alive = profile.farms.some((farm) => farm.active);
  const golden = season === 1 || season === 2;
  const color = !alive ? '#9b9477' : season === 3 ? '#aaa78c' : golden ? '#c9a95c' : '#8fab64';
  const highlight = !alive ? '#b3ac8d' : season === 3 ? '#cdc8ae' : golden ? '#efdaa0' : '#c3d193';
  const fields = profile.vocations.includes('agriculture') ? 3 : 2;
  ctx.save();
  for (let i = 0; i < fields; i++) {
    const x = -44 + i * 11,
      y = 3 + (i % 2) * 4;
    shape(
      ctx,
      [
        [x, y - 4],
        [x + 13, y - 9],
        [x + 23, y - 3],
        [x + 9, y + 3],
      ],
      '#877f4f30',
    );
    shape(
      ctx,
      [
        [x + 0.5, y - 4],
        [x + 13, y - 8],
        [x + 21, y - 3],
        [x + 9, y + 2],
      ],
      color,
    );
    for (let row = 0; row < 6; row++) {
      const px = x + 2 + row * 2.1;
      line(
        ctx,
        [
          [px, y - 4],
          [px + 8, y + 0.4],
        ],
        row % 2 ? highlight : '#7e854d65',
        0.7,
      );
      if (alive && season !== 3)
        line(
          ctx,
          [
            [px + 4, y - 2.2],
            [px + 4.4, y - 4.2],
          ],
          highlight,
          0.6,
        );
    }
    line(
      ctx,
      [
        [x + 1, y - 4.1],
        [x + 12.7, y - 8.1],
      ],
      '#e5dcb16b',
      0.65,
    );
  }
  ctx.restore();
}

function cityGranary(ctx: CanvasRenderingContext2D, active: boolean) {
  ctx.save();
  ctx.translate(-25, -5);
  line(
    ctx,
    [
      [-6, -1],
      [-6, 3],
    ],
    '#7f7553',
    1.3,
  );
  line(
    ctx,
    [
      [6, -1],
      [6, 3],
    ],
    '#7f7553',
    1.3,
  );
  shape(
    ctx,
    [
      [-7, -10],
      [6, -11],
      [7, 0],
      [-6, 1],
    ],
    active ? '#d0b87d' : '#a8a48b',
  );
  shape(
    ctx,
    [
      [-9, -10],
      [-1, -17],
      [9, -10],
      [2, -7],
    ],
    active ? '#e1c487' : '#b8b39a',
  );
  shape(
    ctx,
    [
      [-1, -17],
      [9, -10],
      [2, -7],
    ],
    '#957447',
  );
  for (let i = 0; i < 5; i++)
    line(
      ctx,
      [
        [-5.3 + i * 2, -8],
        [-4.9 + i * 2, 0],
      ],
      '#7b785750',
      0.65,
    );
  line(
    ctx,
    [
      [-5.5, -5],
      [5.5, -5.5],
    ],
    '#e1d5a580',
    0.7,
  );
  shape(
    ctx,
    [
      [-1.8, -4],
      [1.7, -4.2],
      [1.8, 0.4],
      [-1.8, 0.5],
    ],
    '#74734c',
  );
  oval(ctx, -3.8, -2.6, 1.5, 2.2, '#d1bf7e');
  oval(ctx, 4, -2.8, 1.4, 2, '#cbbb8c');
  ctx.restore();
}

function cityFoundry(ctx: CanvasRenderingContext2D, productive: boolean, time: number) {
  ctx.save();
  // Keep the chimney mouth shared with the fog-clipped atmosphere layer.
  ctx.translate(CITY_FOUNDRY_CHIMNEY.x - 1.6, CITY_FOUNDRY_CHIMNEY.y + 30.6);
  oval(ctx, 1, 3, 13, 4, '#58604c2b');
  shape(
    ctx,
    [
      [-11, -9],
      [-6, -19],
      [6, -21],
      [11, -10],
      [10, 3],
      [-10, 3],
    ],
    '#b6ac8b',
  );
  shape(
    ctx,
    [
      [5, -20],
      [11, -10],
      [10, 3],
      [5, 0],
    ],
    '#4b6756',
  );
  shape(
    ctx,
    [
      [-1, -18],
      [-1, -30],
      [4, -31],
      [5, -19],
    ],
    '#d0c8a7',
  );
  oval(ctx, 1.6, -30.6, 3, 1.1, '#314b3d');
  line(
    ctx,
    [
      [0, -26],
      [3.7, -26.3],
    ],
    '#7d897556',
    0.5,
  );
  line(
    ctx,
    [
      [0, -22],
      [4, -22.4],
    ],
    '#7d897556',
    0.5,
  );
  for (let row = 0; row < 3; row++)
    line(
      ctx,
      [
        [-9 + row, -4 - row * 4],
        [8, -5 - row * 4],
      ],
      '#ccd0b16b',
      0.5,
    );
  ctx.beginPath();
  ctx.moveTo(-4.7, 2.5);
  ctx.lineTo(-4.7, -5);
  ctx.quadraticCurveTo(-1, -11.7, 3, -5);
  ctx.lineTo(3, 2.5);
  ctx.closePath();
  ctx.fillStyle = '#243f33';
  ctx.fill();
  if (productive) {
    const glow = ctx.createRadialGradient(-1, -2, 0.4, -1, -2, 9);
    glow.addColorStop(0, '#eda85f91');
    glow.addColorStop(1, '#cf883e00');
    oval(ctx, -1, -2, 9, 7, glow);
    const flicker = Math.sin(time * 5) * 0.5;
    shape(
      ctx,
      [
        [-3.7, 1],
        [-3.6, -2.5],
        [-1.6, -5.7 - flicker],
        [-0.6, -2.3],
        [1, -6.4 + flicker],
        [2, -1],
        [1, 1.4],
      ],
      '#e4ab65',
    );
    shape(
      ctx,
      [
        [-2.3, 1],
        [-1.6, -3.1],
        [-0.1, -1.8],
        [0.7, -3.4],
        [1.2, 1],
      ],
      '#f8d897',
    );
  }
  line(
    ctx,
    [
      [6, 2.5],
      [11, 1.2],
    ],
    '#c7bcb0',
    1.5,
  );
  line(
    ctx,
    [
      [6.8, 1.2],
      [9.6, -0.2],
    ],
    '#637369',
    1.5,
  );
  ctx.restore();
}

function cityMarket(ctx: CanvasRenderingContext2D, active: boolean) {
  ctx.save();
  ctx.translate(-17, 4);
  const colors = active ? ['#b16c4b', '#e1c58d'] : ['#959780', '#b6b49b'];
  shape(
    ctx,
    [
      [-8, -9],
      [5, -11],
      [10, -5],
      [-4, -3],
    ],
    colors[0],
  );
  for (let i = 0; i < 4; i++)
    shape(
      ctx,
      [
        [-6 + i * 3, -9],
        [-4 + i * 3, -9.4],
        [0 + i * 3, -4],
        [-2 + i * 3, -3.7],
      ],
      colors[i % 2],
    );
  line(
    ctx,
    [
      [-6, -7],
      [-6, 2],
    ],
    '#726446',
    0.8,
  );
  line(
    ctx,
    [
      [7, -5],
      [7, 2],
    ],
    '#726446',
    0.8,
  );
  shape(
    ctx,
    [
      [-6, -1],
      [5, -2],
      [7, 0.4],
      [-4, 1.7],
    ],
    '#9d8c5f',
  );
  oval(ctx, -2.5, -1.3, 1.7, 0.8, '#c9b37c');
  oval(ctx, 2.5, -1.9, 1.5, 0.9, '#8a9970');
  ctx.restore();
}

function cityLearningHall(ctx: CanvasRenderingContext2D, active: boolean) {
  ctx.save();
  ctx.translate(-5, -19);
  shape(
    ctx,
    [
      [-10, -8],
      [8, -9],
      [8, 2],
      [-9, 3],
    ],
    active ? '#e4d6b3' : '#b4b49a',
  );
  shape(
    ctx,
    [
      [-12, -8],
      [-2, -15],
      [11, -9],
      [8, -6],
      [-11, -6],
    ],
    '#ac8554',
  );
  line(
    ctx,
    [
      [-10, -7],
      [8, -7.5],
    ],
    '#f5dfb0',
    1,
  );
  for (let i = 0; i < 4; i++) {
    line(
      ctx,
      [
        [-7 + i * 4, -6],
        [-7 + i * 4, 1.7],
      ],
      '#eeebd3',
      1.5,
    );
    line(
      ctx,
      [
        [-5.7 + i * 4, -5.5],
        [-5.7 + i * 4, 1],
      ],
      '#838e7a',
      0.55,
    );
  }
  line(
    ctx,
    [
      [-9, 3],
      [9, 2],
    ],
    '#a4aa90',
    1.2,
  );
  ctx.restore();
}

function cityPalace(ctx: CanvasRenderingContext2D, active: boolean) {
  ctx.save();
  ctx.translate(0, -17);
  shape(
    ctx,
    [
      [-11, -12],
      [9, -13],
      [10, 1],
      [-11, 2],
    ],
    active ? '#cfc7ab' : '#a9ac98',
  );
  shape(
    ctx,
    [
      [-13, -13],
      [-2, -22],
      [12, -14],
      [9, -10],
      [-12, -9],
    ],
    '#a07f5c',
  );
  shape(
    ctx,
    [
      [-13, -13],
      [-2, -22],
      [-1, -16],
      [-12, -9],
    ],
    '#c5a175',
  );
  line(
    ctx,
    [
      [-9, -8],
      [-9, 1],
    ],
    '#eee0b6',
    1.8,
  );
  line(
    ctx,
    [
      [6.5, -9],
      [7, 0],
    ],
    '#eee0b6',
    1.8,
  );
  shape(
    ctx,
    [
      [-3, -7],
      [2, -7],
      [2.5, 1],
      [-3, 1.5],
    ],
    '#536150',
  );
  line(
    ctx,
    [
      [-11, 3],
      [11, 1.8],
    ],
    '#8b9277',
    1.4,
  );
  ctx.restore();
}

function cityRamparts(ctx: CanvasRenderingContext2D, integrity: number, front: boolean) {
  const y = front ? 2 : -9;
  if (!front) {
    line(
      ctx,
      [
        [-31, y + 2],
        [-20, y - 8],
        [4, y - 11],
        [28, y - 1],
        [33, y + 9],
      ],
      '#4c6855',
      3.1,
    );
    line(
      ctx,
      [
        [-31, y + 1],
        [-20, y - 9],
        [4, y - 12],
        [28, y - 2],
      ],
      '#c6c4a0',
      1.2,
    );
    return;
  }
  const leftEnd = integrity < 0.4 ? -16 : -5;
  line(
    ctx,
    [
      [-32, y - 4],
      [-25, y + 5],
      [leftEnd, y + 9],
    ],
    '#71896d',
    4,
  );
  line(
    ctx,
    [
      [-31, y - 5],
      [-25, y + 3.7],
      [leftEnd, y + 7.7],
    ],
    '#ded5af',
    1.3,
  );
  line(
    ctx,
    [
      [6, y + 9],
      [26, y + 5],
      [33, y - 4],
    ],
    '#506e59',
    4,
  );
  line(
    ctx,
    [
      [6, y + 7.5],
      [26, y + 3.7],
      [32, y - 5],
    ],
    '#d8d0a7',
    1.3,
  );
  for (const x of [-30, -20, 19, 30]) {
    shape(
      ctx,
      [
        [x - 2.5, y - 5],
        [x + 2, y - 5.7],
        [x + 2.5, y + 3],
        [x - 2.5, y + 3.7],
      ],
      '#b4b89a',
    );
    line(
      ctx,
      [
        [x - 2.5, y - 5.7],
        [x + 2, y - 6.4],
      ],
      '#ede0b9',
      1.1,
    );
  }
  if (integrity < 0.75)
    line(
      ctx,
      [
        [-21, y - 2],
        [-22.3, y + 1],
        [-20.8, y + 1.7],
        [-21.7, y + 4],
      ],
      '#5c6a5b',
      0.65,
    );
  if (integrity < 0.4) {
    for (let i = 0; i < 5; i++)
      oval(ctx, -13 + i * 2.9, y + 8 + Math.sin(i) * 1.1, 1.6, 1, '#9ba38a');
  } else {
    shape(
      ctx,
      [
        [-4, y + 5],
        [2.8, y + 4.7],
        [3, y + 10],
        [-4.2, y + 10.4],
      ],
      '#77734e',
    );
    line(
      ctx,
      [
        [-3, y + 7],
        [2, y + 6.8],
      ],
      '#b8a476',
      0.7,
    );
  }
}

/** Worn civic ground and connected lanes compose one inhabited place. These are
 * illustration inside the city node, never new regional roads or trade routes. */
function cityGround(ctx: CanvasRenderingContext2D, season: number) {
  const winter = season === 3;
  const ground = ctx.createRadialGradient(-5, -1, 3, 0, -2, 44);
  ground.addColorStop(0, winter ? '#c9c7b5bd' : '#cbb589b8');
  ground.addColorStop(0.62, winter ? '#c9c7b579' : '#baa47770');
  ground.addColorStop(1, winter ? '#c9c7b500' : '#ac956700');
  oval(ctx, 0, -2, 45, 16, ground);
  shape(
    ctx,
    [
      [-34, -6],
      [-23, -15],
      [-9, -17],
      [7, -13],
      [31, -9],
      [38, 3],
      [24, 10],
      [2, 13],
      [-26, 8],
    ],
    winter ? '#d2cdb34a' : '#cbb38943',
  );
  const lanes: Point[][] = [
    [
      [-31, 4],
      [-17, 1],
      [-2, 4],
      [22, 6],
      [34, 2],
    ],
    [
      [-2, 10],
      [-4, -2],
      [-2, -9],
      [7, -15],
    ],
    [
      [-18, -9],
      [-12, -3],
      [-2, 4],
    ],
  ];
  for (const lane of lanes) {
    line(ctx, lane, '#6c74503d', 3.3);
    line(
      ctx,
      lane.map(([x, y]): Point => [x - 0.35, y - 0.3]),
      winter ? '#e5dcc19c' : '#e0c79bba',
      2.3,
    );
  }
  // Sparse flagstones describe a square, without suggesting a new building.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++) {
      const x = -7 + col * 2.9 + (row % 2) * 1.3,
        y = 2 + row * 1.9;
      shape(
        ctx,
        [
          [x, y],
          [x + 2.5, y - 0.3],
          [x + 2.7, y + 1.1],
          [x + 0.2, y + 1.4],
        ],
        (row + col) % 3 ? '#d4c7a69e' : '#a7ac8e6b',
      );
    }
}

/** A city is a cartographic cluster, while its landmark buildings must really exist. */
export function drawPainterlyCity(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  city: City,
  time: number,
  options: { reducedMotion?: boolean } = {},
) {
  const profile = getCityPresentation(state, city);
  const phase = options.reducedMotion || state.paused ? state.time : time;
  ctx.save();
  shadow(ctx, 32);
  cityGround(ctx, state.seasonIndex % 4);
  cityFields(ctx, profile, state.seasonIndex % 4);
  if (profile.walls) cityRamparts(ctx, profile.wallIntegrity, false);
  if (profile.ruinedWalls && !profile.walls) {
    for (let i = 0; i < 12; i++)
      oval(
        ctx,
        Math.sin(i * 2.1) * 30,
        6 + Math.cos(i * 1.7) * 5,
        1.4 + (i % 3) * 0.5,
        1.1,
        '#909b813d',
      );
  }
  const large = profile.population >= 150;
  for (const [x, y, size] of [
    [-16, -8, 0.76],
    [10, -12, 0.85],
    [-10, 1, 0.85],
    [9, 4, 0.83],
  ])
    cityRoof(ctx, x, y, size, state.tier >= 5);
  if (large) {
    cityRoof(ctx, -24, -11, 0.6, state.tier >= 5);
    cityRoof(ctx, 21, -5, 0.6, state.tier >= 5);
  }
  if (profile.palace) cityPalace(ctx, profile.palace.active);
  else if (profile.learningBuilding) cityLearningHall(ctx, profile.learningBuilding.active);
  else cityRoof(ctx, -1, -12, 1.1, state.tier >= 5);
  const granary = profile.institutions.find((building) => building.kind === 'storage');
  if (granary) cityGranary(ctx, granary.active);
  if (profile.foundries.length)
    cityFoundry(ctx, profile.productiveFoundries.length > 0, options.reducedMotion ? 0 : phase);
  if (profile.market) cityMarket(ctx, profile.market.active);
  if (profile.walls) cityRamparts(ctx, profile.wallIntegrity, true);
  // Civic emblems describe specialization, never a stock quantity or production bonus.
  ctx.save();
  ctx.translate(-13, 14);
  for (const vocation of profile.vocations) {
    if (vocation === 'agriculture') {
      line(
        ctx,
        [
          [0, -3],
          [0.4, -8],
        ],
        '#9d8749',
        0.7,
      );
      for (let i = 0; i < 3; i++) {
        oval(ctx, -0.8, -7 + i * 1.2, 0.8, 0.4, '#d5bb70');
        oval(ctx, 1.2, -7.6 + i * 1.2, 0.8, 0.4, '#c4a358');
      }
    } else if (vocation === 'industry') {
      line(
        ctx,
        [
          [-2, -3],
          [2, -8],
        ],
        '#69766b',
        1,
      );
      shape(
        ctx,
        [
          [0.4, -8],
          [2.6, -9.8],
          [4, -8.6],
          [1.9, -6.8],
        ],
        '#8b9a8e',
      );
    } else if (vocation === 'commerce') {
      oval(ctx, 0, -5.5, 2.1, 2.1, '#bd9e5d');
      oval(ctx, -0.2, -5.7, 1.4, 1.4, '#dfcc8d');
      line(
        ctx,
        [
          [-0.3, -6.6],
          [0.2, -4.7],
        ],
        '#a4884e',
        0.5,
      );
    } else {
      shape(
        ctx,
        [
          [-2.7, -7.5],
          [0, -6.8],
          [2.7, -7.5],
          [2.7, -3.4],
          [0, -2.8],
          [-2.7, -3.4],
        ],
        '#d2c9a4',
      );
      line(
        ctx,
        [
          [0, -6.8],
          [0, -2.8],
        ],
        '#948f6d',
        0.5,
      );
    }
    ctx.translate(8, 0);
  }
  ctx.restore();
  ctx.restore();
}
