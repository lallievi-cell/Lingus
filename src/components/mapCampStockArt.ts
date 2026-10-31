import type { CampStockSlot } from './campInventory';
import type { Resource } from '../game/types';

type Point = [number, number];

/** Local sprite pixels, measured from the world anchor. Shared with map picking. */
export const CAMP_STOCK_ART_BOUNDS: Record<
  CampStockSlot['group'],
  { rx: number; ry: number; verticalOffset: number }
> = {
  food: { rx: 39, ry: 23, verticalOffset: 5 },
  wood: { rx: 36, ry: 24, verticalOffset: 10 },
  stone: { rx: 33, ry: 19, verticalOffset: 6 },
  pelt: { rx: 31, ry: 34, verticalOffset: 19 },
  goods: { rx: 37, ry: 31, verticalOffset: 12 },
};

function shape(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke?: string) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}
function line(ctx: CanvasRenderingContext2D, points: Point[], stroke: string, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke;
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
  fill: string,
) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A woven resting mat makes delivered stock distinct from extraction debris. */
function mat(ctx: CanvasRenderingContext2D, width: number, depth: number) {
  oval(ctx, 3, 5, width + 3, depth + 3, '#39412c24');
  shape(
    ctx,
    [
      [-width, -depth + 2],
      [width - 3, -depth],
      [width, depth - 2],
      [-width + 2, depth],
    ],
    '#b69f6c',
    '#796a4660',
  );
  for (let y = -depth + 3; y < depth; y += 3)
    line(
      ctx,
      [
        [-width + 3, y],
        [width - 3, y - 1],
      ],
      '#ddcd975c',
      0.65,
    );
  for (let x = -width + 4; x < width; x += 5)
    line(
      ctx,
      [
        [x, -depth + 1],
        [x + 1, depth - 1],
      ],
      '#72643b38',
      0.6,
    );
  for (let x = -width + 3; x < width; x += 5) {
    line(
      ctx,
      [
        [x, depth - 1],
        [x - 1, depth + 2],
      ],
      '#a18c5a',
      0.7,
    );
    line(
      ctx,
      [
        [x, -depth + 1],
        [x + 1, -depth - 2],
      ],
      '#c5af78',
      0.7,
    );
  }
}

function log(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, pale = false) {
  shape(
    ctx,
    [
      [x - length, y - 4],
      [x + 10, y - 8],
      [x + 15, y - 4],
      [x + 15, y + 3],
      [x - length, y + 5],
    ],
    pale ? '#9b895e' : '#71513a',
    '#493c2b66',
  );
  shape(
    ctx,
    [
      [x - length, y - 4],
      [x + 10, y - 8],
      [x + 14, y - 4],
      [x - length + 2, y + 1],
    ],
    pale ? '#b8ab82' : '#a27b4d',
  );
  line(
    ctx,
    [
      [x - length + 4, y - 2],
      [x + 7, y - 5],
    ],
    pale ? '#dbcfad' : '#c6a06a',
    0.9,
  );
  line(
    ctx,
    [
      [x - length + 8, y + 3],
      [x + 9, y],
    ],
    '#45392e70',
    0.9,
  );
  oval(ctx, x + 14, y - 0.5, 4.5, 5, '#d8bb87');
  oval(ctx, x + 14, y - 0.5, 2.5, 3.2, '#aa875b');
  oval(ctx, x + 14, y - 0.5, 1, 1.7, '#d6b785');
}
function wood(ctx: CanvasRenderingContext2D, level: number) {
  mat(ctx, 31, 12);
  line(
    ctx,
    [
      [-25, 1],
      [-26, 8],
      [23, 6],
      [24, -1],
    ],
    '#695339',
    3,
  );
  log(ctx, -2, 2, 25, true);
  log(ctx, 5, 10, 25);
  if (level >= 2) {
    log(ctx, -1, -8, 24);
    log(ctx, 8, -2, 24, true);
  }
  if (level >= 3) log(ctx, 5, -17, 22, true);
  // Bindings identify an arranged stack rather than a loose branch pile.
  const top = level >= 3 ? -25 : level >= 2 ? -16 : -7;
  line(
    ctx,
    [
      [-12, top],
      [-14, 8],
      [-11, 13],
    ],
    '#d3bd87',
    1.9,
  );
  line(
    ctx,
    [
      [5, top - 1],
      [3, 7],
      [6, 12],
    ],
    '#c7ad74',
    1.7,
  );
}

function stone(ctx: CanvasRenderingContext2D, level: number) {
  mat(ctx, 28, 11);
  const piece = (x: number, y: number, s: number, pale: boolean) => {
    shape(
      ctx,
      [
        [x - s, y + 2],
        [x - s * 0.7, y - s * 0.65],
        [x + s * 0.25, y - s],
        [x + s, y - 1],
        [x + s * 0.8, y + s * 0.5],
        [x - s * 0.7, y + s * 0.6],
      ],
      pale ? '#8b9489' : '#666f69',
      '#4b554c80',
    );
    shape(
      ctx,
      [
        [x - s * 0.7, y - s * 0.65],
        [x + s * 0.25, y - s],
        [x + s * 0.8, y - 1],
        [x - s * 0.3, y],
      ],
      pale ? '#b7bdb0' : '#949f93',
    );
    line(
      ctx,
      [
        [x - s * 0.55, y - s * 0.45],
        [x + s * 0.1, y - s * 0.7],
        [x + s * 0.55, y - s * 0.1],
      ],
      '#e3e1ca8c',
      0.7,
    );
  };
  piece(-13, 2, 11, false);
  piece(10, 6, 12, true);
  if (level >= 2) piece(13, -6, 10, false);
  if (level >= 3) {
    piece(-10, -9, 11, true);
    piece(0, -15, 9, true);
  }
}

function leafTray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: Resource,
  level: number,
) {
  ctx.save();
  ctx.translate(x, y);
  shape(
    ctx,
    [
      [-15, -2],
      [-9, -10],
      [7, -10],
      [15, -2],
      [11, 7],
      [-10, 7],
    ],
    '#5e7750',
    '#435c3f',
  );
  shape(
    ctx,
    [
      [-12, -3],
      [-8, -7],
      [7, -7],
      [12, -2],
      [8, 3],
      [-8, 3],
    ],
    '#81965d',
  );
  line(
    ctx,
    [
      [-13, -1],
      [-1, 5],
      [13, -2],
    ],
    '#bdba7e',
    1.4,
  );
  if (kind === 'food') {
    const berries: Point[] = [
      [-7, -3],
      [0, -5],
      [7, -2],
      [-3, 1],
      [5, 2],
    ];
    if (level >= 2) berries.push([-7, -8], [1, -10], [6, -6]);
    for (const [bx, by] of berries) {
      oval(ctx, bx, by, 3.9, 3.2, '#914f4e');
      oval(ctx, bx - 0.8, by - 1, 1.2, 0.9, '#cf8b71');
    }
  } else if (kind === 'seed') {
    oval(ctx, 0, -2, 9, 5, '#bfa463');
    for (let i = 0; i < 9; i++)
      oval(ctx, (i % 3) * 5 - 5, Math.floor(i / 3) * 3 - 6, 1.9, 1, i % 2 ? '#ddc280' : '#8e753e');
  } else {
    const cooked = kind === 'cooked';
    shape(
      ctx,
      [
        [-9, 1],
        [-10, -5],
        [-3, -9],
        [7, -6],
        [10, 0],
        [5, 4],
      ],
      cooked ? '#9b6242' : '#b27165',
      '#774e3d',
    );
    shape(
      ctx,
      [
        [-7, -5],
        [-2, -7],
        [6, -4],
        [3, -1],
        [-7, -1],
      ],
      cooked ? '#c89255' : '#daa38b',
    );
    if (cooked)
      for (let i = 0; i < 3; i++)
        line(
          ctx,
          [
            [-6 + i * 4, -6],
            [-3 + i * 4, 1],
          ],
          '#6e4934',
          1.2,
        );
    else
      line(
        ctx,
        [
          [-8, 1],
          [-3, -3],
          [4, -2],
        ],
        '#ebc7a7',
        1.1,
      );
  }
  ctx.restore();
}
function food(ctx: CanvasRenderingContext2D, slot: CampStockSlot) {
  const resources = slot.resources;
  mat(ctx, 34, 15);
  const positions: Point[] =
    resources.length === 1
      ? [[0, 0]]
      : resources.length === 2
        ? [
            [-16, 0],
            [15, 1],
          ]
        : [
            [-17, -5],
            [16, -6],
            [-14, 9],
            [17, 8],
          ];
  resources.forEach((resource, i) => {
    const point = positions[i % positions.length];
    leafTray(ctx, point[0], point[1], resource, slot.level);
  });
}

function hide(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  shape(
    ctx,
    [
      [x - 17, y - 14],
      [x - 8, y - 18],
      [x - 3, y - 14],
      [x + 8, y - 17],
      [x + 17, y - 12],
      [x + 11, y - 5],
      [x + 14, y + 10],
      [x + 5, y + 15],
      [x - 3, y + 11],
      [x - 12, y + 15],
      [x - 16, y + 9],
      [x - 12, y - 3],
    ],
    color,
    '#77523b80',
  );
  shape(
    ctx,
    [
      [x - 10, y - 12],
      [x + 9, y - 12],
      [x + 7, y + 8],
      [x - 8, y + 10],
    ],
    '#dac09280',
  );
  line(
    ctx,
    [
      [x - 2, y - 11],
      [x - 3, y + 8],
    ],
    '#8664466b',
    0.9,
  );
}
function pelt(ctx: CanvasRenderingContext2D, level: number) {
  mat(ctx, 26, 12);
  oval(ctx, 3, 1, 25, 6, '#463e2a21');
  line(
    ctx,
    [
      [-23, 8],
      [-18, -43],
    ],
    '#77573b',
    2.8,
  );
  line(
    ctx,
    [
      [23, 7],
      [18, -43],
    ],
    '#77573b',
    2.8,
  );
  line(
    ctx,
    [
      [-23, -39],
      [23, -39],
    ],
    '#a78a5a',
    3.2,
  );
  line(
    ctx,
    [
      [-17, -39],
      [-18, -43],
    ],
    '#d5c492',
    1.2,
  );
  line(
    ctx,
    [
      [17, -39],
      [18, -43],
    ],
    '#d5c492',
    1.2,
  );
  hide(ctx, -2, -23, '#b28c59');
  // A second folded hide broadens the silhouette without counting individual units.
  if (level >= 2) {
    shape(
      ctx,
      [
        [-15, 1],
        [14, -1],
        [19, 7],
        [9, 12],
        [-16, 9],
      ],
      '#a0764b',
      '#755237',
    );
    line(
      ctx,
      [
        [-12, 4],
        [11, 2],
        [15, 6],
        [-12, 8],
      ],
      '#d4b780',
      1.5,
    );
  }
  if (level >= 3) {
    shape(
      ctx,
      [
        [1, -2],
        [20, -5],
        [25, 2],
        [19, 7],
        [0, 5],
      ],
      '#c3a373',
      '#806240',
    );
    oval(ctx, 20, 1, 4, 4.5, '#e0c899');
    oval(ctx, 20, 1, 1.5, 2, '#a78255');
  }
}

function goods(ctx: CanvasRenderingContext2D, slot: CampStockSlot) {
  mat(ctx, 32, 14);
  const resources = slot.resources;
  const crowded = resources.length >= 3;
  if (resources.some((r) => ['tool', 'spear', 'metalArms'].includes(r))) {
    line(
      ctx,
      [
        [-24, 8],
        [-21, -31],
        [-7, -30],
        [-3, 9],
      ],
      '#876444',
      2.6,
    );
    line(
      ctx,
      [
        [-25, -17],
        [-3, -17],
      ],
      '#c1a476',
      2,
    );
    const metal = resources.includes('metalArms');
    if (resources.includes('spear') || metal) {
      line(
        ctx,
        [
          [-17, 8],
          [-16, -34],
        ],
        '#b69a67',
        2,
      );
      shape(
        ctx,
        [
          [-20, -30],
          [-15, -42],
          [-12, -30],
        ],
        metal ? '#a2b1aa' : '#b4b7a5',
        '#5a675c',
      );
    }
    if (resources.includes('tool') || metal) {
      line(
        ctx,
        [
          [-10, 7],
          [-12, -20],
        ],
        '#b99d6a',
        2.2,
      );
      shape(
        ctx,
        [
          [-17, -20],
          [-12, -27],
          [-4, -23],
          [-7, -15],
        ],
        metal ? '#92aaa1' : '#a5aca0',
        '#5f675c',
      );
    }
  }
  if (resources.includes('ore')) {
    ctx.save();
    if (crowded) {
      ctx.translate(-17, 9);
      ctx.scale(0.6, 0.6);
    }
    shape(
      ctx,
      [
        [4, 4],
        [8, -10],
        [19, -13],
        [29, -1],
        [24, 8],
      ],
      '#646e64',
      '#4d594c',
    );
    shape(
      ctx,
      [
        [8, -9],
        [19, -13],
        [25, -4],
        [15, -2],
      ],
      '#969b7c',
    );
    line(
      ctx,
      [
        [12, -8],
        [19, -5],
        [15, 3],
      ],
      '#82a695',
      2.3,
    );
    ctx.restore();
  }
  if (resources.includes('ingot')) {
    ctx.save();
    if (crowded) {
      ctx.translate(9, 6);
      ctx.scale(0.7, 0.7);
    }
    const bars =
      slot.level >= 2
        ? [
            [1, 6],
            [15, 7],
            [8, -1],
          ]
        : [[8, 5]];
    for (const [x, y] of bars) {
      shape(
        ctx,
        [
          [x - 8, y],
          [x - 5, y - 7],
          [x + 8, y - 7],
          [x + 10, y],
          [x + 5, y + 3],
          [x - 6, y + 3],
        ],
        '#8d8261',
        '#66634b',
      );
      shape(
        ctx,
        [
          [x - 5, y - 7],
          [x + 8, y - 7],
          [x + 5, y - 2],
          [x - 7, y - 2],
        ],
        '#c2af77',
      );
    }
    ctx.restore();
  }
  if (resources.includes('pottery')) {
    ctx.save();
    if (crowded) {
      ctx.translate(5, -7);
      ctx.scale(0.85, 0.85);
    }
    oval(ctx, 18, 2, 11, 10, '#8b533a');
    shape(
      ctx,
      [
        [8, 0],
        [10, -14],
        [23, -15],
        [29, -1],
        [25, 6],
        [13, 8],
      ],
      '#b17b52',
      '#795039',
    );
    oval(ctx, 16.5, -14, 6.7, 2.8, '#684c36');
    line(
      ctx,
      [
        [11, -12],
        [10, -3],
      ],
      '#d0a36e',
      1.4,
    );
    line(
      ctx,
      [
        [11, 0],
        [26, -1],
      ],
      '#d6ab77',
      1.3,
    );
    ctx.restore();
  }
  if (resources.includes('coin')) {
    ctx.save();
    if (crowded) {
      ctx.translate(-22, 4);
      ctx.scale(0.6, 0.6);
    }
    oval(ctx, 5, 9, 11, 5, '#816a46');
    shape(
      ctx,
      [
        [-5, 7],
        [-3, -4],
        [9, -5],
        [16, 6],
        [12, 12],
        [-1, 12],
      ],
      '#a18a59',
      '#766444',
    );
    oval(ctx, 4, -4, 5, 3, '#5b553b');
    for (const [x, y] of [
      [1, -3],
      [6, -4],
      [5, 0],
    ]) {
      oval(ctx, x, y, 3.2, 1.8, '#dbc17b');
      oval(ctx, x, y - 0.5, 1.8, 0.7, '#f1dba0');
    }
    ctx.restore();
  }
}

/** Delivered goods only: never creates a collectible entity or changes inventory. */
export function drawCampStock(ctx: CanvasRenderingContext2D, slot: CampStockSlot) {
  if (slot.level === 0) return;
  ctx.save();
  ctx.translate(slot.x * 2.4, slot.y * 1.6);
  if (slot.group === 'wood') wood(ctx, slot.level);
  else if (slot.group === 'stone') stone(ctx, slot.level);
  else if (slot.group === 'food') food(ctx, slot);
  else if (slot.group === 'pelt') pelt(ctx, slot.level);
  else goods(ctx, slot);
  ctx.restore();
}
