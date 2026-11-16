import type { Boat, Building, GameState, Resource } from '../game/types';
import { isWorldPointRevealed } from '../game/worldDimensions';
import { resourceKnown } from './mapResourceLayout';
import { drawFishSprite } from './mapCoastArt';
import { BOAT_BUILD_SECONDS } from '../game/maritimeConfig';

type Point = { x: number; y: number };
const projected = (point: Point) => ({ x: point.x * 2.4, y: point.y * 1.6 });
const alivePassengers = (state: GameState, boat: Boat) =>
  boat.passengerIds
    .map((id) =>
      state.units.find((unit) => unit.id === id && unit.hp > 0 && unit.boatId === boat.id),
    )
    .filter((unit) => unit !== undefined && unit.action !== 'disembarking');

/** The deck owns its crew silhouette. A disembarking person already has a real
 * interpolated position on the gangway and is painted by the ordinary people pass. */
export const unitIsSeatedAboard = (state: GameState, unit: GameState['units'][number]) =>
  !!unit.boatId &&
  unit.action !== 'disembarking' &&
  !!state.boats?.some(
    (boat) => boat.id === unit.boatId && boat.hp > 0 && boat.passengerIds.includes(unit.id),
  );

export function boatArtFrame(state: GameState, boat: Boat, time: number, reducedMotion = false) {
  const next = boat.route?.[boat.routeIndex ?? 0] ?? boat.destination;
  const target =
    next && Math.hypot(next.x - boat.x, next.y - boat.y) > 0.01
      ? { x: next.x - boat.x, y: next.y - boat.y }
      : boat.accessLand
        ? { x: boat.x - boat.accessLand.x, y: boat.y - boat.accessLand.y }
        : { x: 1, y: 0 };
  const passengers = alivePassengers(state, boat);
  const rowing = boat.status === 'sailing' && passengers.length > 0;
  const clock = state.paused ? state.time : time;
  return {
    angle: Math.atan2(target.y * 1.6, target.x * 2.4),
    stroke: rowing && !reducedMotion ? Math.sin(clock * 3.1) : 0,
    rowing,
    passengers,
    progress: Math.max(0, Math.min(1, boat.progress / BOAT_BUILD_SECONDS)),
    cargo: Object.entries(boat.resources)
      .filter(([, amount]) => amount > 0)
      .map(([resource]) => resource as Resource),
  };
}

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width: number) {
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** A small building-local silhouette also used by the construction catalogue. */
export function drawHarborBase(ctx: CanvasRenderingContext2D, building: Building) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#7663462c';
  ctx.beginPath();
  ctx.ellipse(0, 2, 29, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let index = 0; index < 6; index++)
    line(
      ctx,
      [
        [-22, -6 + index * 2.6],
        [22, -9 + index * 2.6],
      ],
      index % 2 ? '#967648' : '#b19460',
      3.3,
    );
  for (const x of [-23, 22]) {
    line(
      ctx,
      [
        [x, 8],
        [x, -26],
      ],
      '#70583c',
      4,
    );
    line(
      ctx,
      [
        [x - 1, -24],
        [x + 1, -24],
      ],
      '#d4ba83',
      2.3,
    );
  }
  line(
    ctx,
    [
      [-22, -20],
      [0, -16],
      [22, -21],
    ],
    '#c8b183',
    1.2,
  );
  if (building.completed === false) {
    for (let index = 0; index < 3; index++)
      line(
        ctx,
        [
          [-13, 4 + index * 3],
          [12, 1 + index * 3],
        ],
        '#d5b477',
        2.6,
      );
  } else {
    ctx.strokeStyle = '#d0b986';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(9, -2, 5, 2.5, -0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** The planks follow the paid structure's real land-to-water access. Their
 * length is physical, so a long pier cannot shrink with the building sprite. */
export function drawHarbor(ctx: CanvasRenderingContext2D, state: GameState, harbor: Building) {
  if (harbor.kind !== 'harbor' || !isWorldPointRevealed(state, harbor.x, harbor.y)) return;
  const land = projected(harbor);
  if (
    harbor.seaAccess &&
    harbor.completed !== false &&
    isWorldPointRevealed(state, harbor.seaAccess.x, harbor.seaAccess.y)
  ) {
    const water = projected(harbor.seaAccess);
    const length = Math.hypot(water.x - land.x, water.y - land.y);
    ctx.save();
    ctx.translate(land.x, land.y);
    ctx.rotate(Math.atan2(water.y - land.y, water.x - land.x));
    ctx.fillStyle = '#584e3745';
    ctx.fillRect(0, -1.5, length + 1, 4.8);
    ctx.fillStyle = '#9e8151';
    ctx.fillRect(0, -2.2, length + 0.8, 4.4);
    const planks = Math.max(2, Math.ceil(length / 1.2));
    for (let index = 0; index <= planks; index++) {
      const x = (length * index) / planks;
      line(
        ctx,
        [
          [x, -2],
          [x, 2],
        ],
        index % 2 ? '#ceaf76' : '#7b633e',
        0.35,
      );
    }
    line(
      ctx,
      [
        [0, -2.1],
        [length, -2.1],
      ],
      '#d9be87',
      0.45,
    );
    line(
      ctx,
      [
        [0, 2.1],
        [length, 2.1],
      ],
      '#6e583a',
      0.45,
    );
    ctx.restore();
  }
  ctx.save();
  ctx.translate(land.x, land.y);
  ctx.scale(0.2, 0.2);
  drawHarborBase(ctx, harbor);
  ctx.restore();
}

/** One vector canoe, a maximum of three real seated people and three small
 * cargo accents. It creates no bitmap or state while painting. */
export function drawBoat(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  boat: Boat,
  time: number,
  reducedMotion = false,
) {
  if (boat.hp <= 0 || !isWorldPointRevealed(state, boat.x, boat.y)) return;
  const frame = boatArtFrame(state, boat, time, reducedMotion);
  const point = projected(boat);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(frame.angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (frame.rowing && !reducedMotion) {
    const wave = frame.stroke * 0.5;
    for (const sign of [-1, 1])
      line(
        ctx,
        [
          [-13, sign * 2.2],
          [-19 - wave, sign * 4],
          [-25 - wave, sign * 5.8],
        ],
        '#d7e5ce60',
        0.5,
      );
  }
  ctx.fillStyle = '#234e5b46';
  ctx.beginPath();
  ctx.ellipse(0, 1, 15.5, 4.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.bezierCurveTo(7, -6.4, -8, -6.1, -14, 0);
  ctx.bezierCurveTo(-8, 6, 8, 6.3, 15, 0);
  ctx.closePath();
  ctx.fillStyle = boat.status === 'building' ? '#b49a6d' : '#87603c';
  ctx.fill();
  ctx.strokeStyle = '#59472f';
  ctx.lineWidth = 0.85;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(11.5, 0);
  ctx.bezierCurveTo(6, -3.7, -5, -3.9, -10.6, 0);
  ctx.bezierCurveTo(-5, 3.8, 6, 3.8, 11.5, 0);
  ctx.closePath();
  ctx.fillStyle = '#4d4933';
  ctx.fill();
  for (let index = 0; index < 7; index++) {
    const x = -9 + index * 3;
    const half = Math.sqrt(Math.max(0, 1 - (x / 13) ** 2)) * 3.6;
    line(
      ctx,
      [
        [x, -half],
        [x, half],
      ],
      '#c8a56c',
      boat.status === 'building' ? 0.65 : 1,
    );
  }
  if (boat.status === 'building') {
    const boards = Math.floor(frame.progress * 7);
    for (let index = 0; index < boards; index++) {
      ctx.fillStyle = index % 2 ? '#b29259' : '#a2834f';
      ctx.fillRect(-10 + index * 3, -2.9, 2.5, 5.8);
    }
  } else {
    for (let index = 0; index < Math.min(3, frame.passengers.length); index++) {
      const unit = frame.passengers[index]!;
      const x = -7 + index * 6.5;
      ctx.fillStyle = unit.sex === 'F' ? '#aa8268' : '#899278';
      ctx.beginPath();
      ctx.ellipse(x, 0, 1.8, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dec19a';
      ctx.beginPath();
      ctx.ellipse(x + 0.3, -1.4, 1.25, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64583d';
      ctx.beginPath();
      ctx.ellipse(x + 0.1, -2.2, 1.3, 0.65, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      if (frame.rowing) {
        const side = index % 2 ? -1 : 1;
        const reach = frame.stroke * 1.6;
        line(
          ctx,
          [
            [x, side * 1.2],
            [x - reach, side * 7.4],
          ],
          '#a78753',
          0.6,
        );
        line(
          ctx,
          [
            [x - reach, side * 6.3],
            [x - reach - 0.2, side * 8.3],
          ],
          '#765633',
          1.2,
        );
      }
    }
    frame.cargo.slice(0, 3).forEach((resource, index) => {
      const x = -8 + index * 3.4;
      ctx.save();
      ctx.translate(x, 1.8);
      if ((resource === 'fish' || resource === 'cookedFish') && resourceKnown(state, resource)) {
        ctx.scale(0.1, 0.1);
        drawFishSprite(ctx, resource === 'cookedFish');
      } else {
        ctx.fillStyle =
          resourceKnown(state, resource) && resource === 'wood' ? '#b18b52' : '#b5ac82';
        ctx.fillRect(-1.3, -0.7, 2.6, 1.4);
        line(
          ctx,
          [
            [-0.5, -0.9],
            [0, 0.9],
          ],
          '#6e654a',
          0.25,
        );
      }
      ctx.restore();
    });
  }
  ctx.restore();
}
