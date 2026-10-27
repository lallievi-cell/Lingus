import type { GameState, Resource, WorldTarget } from '../game/types';
import { hasBuilding, isPlayerBuilding } from '../game/runtime';
import { FIRE_HEAT } from '../game/thermal';
import { isAllAdultsAnchor, selectableTribeAdults } from '../game/tribeSelection';
import { getCustodianStatuses, type CustodianStatus } from '../game/custodianStatus';
import { getLifeStage } from '../game/demography';
import { visibleUnitEquipment, type VisibleUnitEquipment } from '../game/unitEquipment';
import { getGroundPiles, groundPileFor, resourceKnown, type GroundPile } from './mapResourceLayout';
import { createPainterlyTerrain } from './mapTerrainArt';
import { drawPainterlyNature } from './mapNatureArt';
import { drawPainterlyBuilding } from './mapBuildingArt';
import { drawPainterlyBody } from './mapPeopleArt';
import { getUnitAnimation, type UnitAnimationPose } from './unitAnimation';
import { createMapMotionSession, observeUnitMotion, type MapMotionSession } from './mapMotion';
import type { AnimalAnimationContext } from './animalAnimation';
import { drawPainterlyBattalion, drawPainterlyCaravan, drawPainterlyCity } from './mapStrategicArt';
import { drawMapAtmosphere, isFoundryProducing, type AtmosphereOptions } from './mapAtmosphere';
import { drawRegionalRoutes } from './mapRouteArt';
import { drawRegionalSieges } from './mapSiegeArt';
import { getBattalionDisplayPoint } from './regionalLayout';
import { foreignUnitDisposition } from './unitReadability';

const fallbackMotionSession = createMapMotionSession();

export const visibleBorderRadius = (state: GameState) => (hasBuilding(state, 'palace') ? 100 : 35);

export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 800;
export const WORLD_SIZE = 500;
export const SPRITE_SCALE = 0.2;
export const worldPoint = (x: number, y: number) => ({ x: x * 2.4, y: y * 1.6 });
export const hasConcept = (state: GameState, id: string) => (state.words[id]?.retention ?? 0) > 0;
export function isVisibleAt(state: GameState, x: number, y: number) {
  return (
    state.tier >= 4 ||
    state.sectors.some(
      (s) =>
        s.explored &&
        s.x === Math.min(4, Math.floor(x / 100)) &&
        s.y === Math.min(4, Math.floor(y / 100)),
    )
  );
}

export const entityNames: Record<string, string> = {
  ore: 'Vena mineraria',
  alpha: 'Predatore alfa',
  ground: 'Risorse a terra',
  seedling: 'Germoglio',
  farm: 'Campo agricolo',
  pen: 'Recinto',
  foundry: 'Fonderia',
  archive: 'Archivio',
  palace: 'Palazzo',
  temple: 'Tempio',
  school: 'Scuola',
  workshop: 'Officina',
  court: 'Tribunale',
  market: 'Mercato',
  walls: 'Mura',
  stele: 'Stele',
  berries: 'Bacche selvatiche',
  tree: 'Bosco di betulle',
  stone: 'Affioramento di selce',
  deer: 'Cervo',
  wolf: 'Lupo',
  mammoth: 'Mammut',
  corpse: 'Resti di un compagno',
  campfire: 'Falò centrale',
  storage: 'Pozzo delle scorte',
  depot: 'Deposito dei materiali',
  hut: 'Capanna',
  palisade: 'Palizzata',
  menhir: 'Pietra sacra',
  grave: 'Tumulo',
  house: 'Casa in pietra',
};

export function seededRandom(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function oval(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string | CanvasGradient,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

function polygon(
  ctx: CanvasRenderingContext2D,
  points: number[][],
  color: string,
  stroke?: string,
  width = 1,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/** Small physical silhouettes, shared by piles and a person's actual carried load. */
function drawMaterial(
  ctx: CanvasRenderingContext2D,
  resource: Resource,
  x: number,
  y: number,
  recognized: boolean,
) {
  if (!recognized) {
    rock(ctx, x - 8, y + 2, 11, 1, true);
    rock(ctx, x + 8, y + 2, 10, 0, true);
    rock(ctx, x, y - 4, 11, 1, true);
    return;
  }
  if (resource === 'wood') {
    const log = (px: number, py: number) => {
      polygon(
        ctx,
        [
          [px - 15, py - 5],
          [px + 10, py - 8],
          [px + 15, py - 3],
          [px + 15, py + 4],
          [px - 14, py + 6],
        ],
        '#806044',
      );
      polygon(
        ctx,
        [
          [px - 15, py - 5],
          [px + 10, py - 8],
          [px + 15, py - 3],
          [px - 12, py + 1],
        ],
        '#aa8055',
      );
      line(
        ctx,
        [
          [px - 10, py - 2],
          [px + 9, py - 5],
        ],
        '#c89c66',
        1.5,
      );
      oval(ctx, px + 14, py, 4.8, 5.6, '#d3b37b');
      ctx.strokeStyle = '#99724e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px + 14, py, 2.5, 3.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    };
    log(x - 9, y + 2);
    log(x + 9, y + 5);
    log(x, y - 8);
    line(
      ctx,
      [
        [x - 6, y - 11],
        [x - 7, y + 10],
      ],
      '#e3cda0',
      2.2,
    );
  } else if (resource === 'stone' || resource === 'ore') {
    rock(ctx, x - 13, y + 3, 11, 1);
    rock(ctx, x + 12, y + 4, 12, 0);
    rock(ctx, x, y - 3, 15, 1);
    if (resource === 'ore')
      line(
        ctx,
        [
          [x - 7, y - 11],
          [x + 2, y - 6],
          [x - 1, y + 1],
          [x + 9, y - 1],
        ],
        '#6e9a85',
        3,
      );
    else
      line(
        ctx,
        [
          [x - 8, y - 9],
          [x - 2, y - 13],
          [x + 7, y - 6],
        ],
        '#e8e7d1',
        2,
      );
  } else if (resource === 'meat' || resource === 'cooked') {
    const cooked = resource === 'cooked';
    polygon(
      ctx,
      [
        [x - 22, y + 5],
        [x - 14, y - 9],
        [x + 4, y - 14],
        [x + 19, y - 4],
        [x + 21, y + 7],
        [x + 5, y + 13],
      ],
      cooked ? '#936445' : '#b96f60',
    );
    polygon(
      ctx,
      [
        [x - 17, y + 3],
        [x - 11, y - 5],
        [x + 2, y - 10],
        [x + 14, y - 3],
        [x + 14, y + 5],
        [x + 3, y + 8],
      ],
      cooked ? '#b58254' : '#d4937d',
    );
    oval(ctx, x + 5, y, 6, 5, '#f0dfb7');
    oval(ctx, x + 5, y, 2.3, 2, cooked ? '#97694c' : '#b47766');
    line(
      ctx,
      [
        [x - 13, y + 2],
        [x - 6, y - 1],
        [x - 5, y - 5],
      ],
      '#edc1a2',
      1.5,
    );
    if (cooked)
      for (let i = 0; i < 3; i++)
        line(
          ctx,
          [
            [x - 13 + i * 6, y - 6],
            [x - 8 + i * 6, y + 5],
          ],
          '#73563d',
          1.5,
        );
  } else if (resource === 'food') {
    polygon(
      ctx,
      [
        [x - 23, y + 3],
        [x - 12, y - 9],
        [x + 21, y + 1],
        [x + 9, y + 10],
        [x - 9, y + 11],
      ],
      '#6d8656',
    );
    line(
      ctx,
      [
        [x - 18, y + 4],
        [x + 17, y + 3],
      ],
      '#a6b778',
      1,
    );
    for (const [dx, dy] of [
      [-12, 0],
      [-3, -6],
      [7, -2],
      [12, 4],
      [1, 5],
      [-8, 6],
    ]) {
      oval(ctx, x + dx, y + dy, 5, 4.7, '#a4524e');
      oval(ctx, x + dx - 1, y + dy - 1, 1.4, 1.2, '#d99c80');
      line(
        ctx,
        [
          [x + dx, y + dy - 4],
          [x + dx + 1, y + dy - 7],
        ],
        '#566845',
        1.2,
      );
    }
  } else if (resource === 'pelt') {
    polygon(
      ctx,
      [
        [x - 20, y - 7],
        [x - 12, y - 11],
        [x - 6, y - 7],
        [x + 10, y - 12],
        [x + 18, y - 6],
        [x + 14, y],
        [x + 20, y + 8],
        [x + 9, y + 11],
        [x + 2, y + 7],
        [x - 12, y + 12],
        [x - 19, y + 5],
      ],
      '#aa875b',
    );
    polygon(
      ctx,
      [
        [x - 15, y - 5],
        [x + 9, y - 8],
        [x + 12, y + 5],
        [x - 10, y + 8],
      ],
      '#ccb083',
    );
    line(
      ctx,
      [
        [x - 13, y + 5],
        [x + 11, y + 1],
      ],
      '#8c6a48',
      1.5,
    );
  } else if (resource === 'seed') {
    oval(ctx, x, y + 1, 15, 11, '#bba474');
    polygon(
      ctx,
      [
        [x - 10, y - 5],
        [x - 6, y - 15],
        [x + 7, y - 15],
        [x + 11, y - 5],
      ],
      '#d1be8a',
    );
    line(
      ctx,
      [
        [x - 9, y - 8],
        [x + 9, y - 8],
      ],
      '#7c704d',
      2,
    );
    for (let i = 0; i < 5; i++) oval(ctx, x + 19 + (i % 2) * 4, y + 2 - i * 3, 2.3, 1.3, '#b7a16a');
  } else if (resource === 'ingot') {
    for (const [dx, dy] of [
      [-11, 4],
      [10, 4],
      [0, -7],
    ]) {
      polygon(
        ctx,
        [
          [x + dx - 12, y + dy + 4],
          [x + dx - 8, y + dy - 4],
          [x + dx + 10, y + dy - 6],
          [x + dx + 13, y + dy + 2],
        ],
        '#7d8b80',
      );
      line(
        ctx,
        [
          [x + dx - 7, y + dy - 3],
          [x + dx + 9, y + dy - 5],
        ],
        '#c2c7ad',
        2,
      );
    }
  } else if (resource === 'pottery') {
    oval(ctx, x + 10, y + 4, 12, 9, '#a16a4b');
    oval(ctx, x - 7, y, 12, 12, '#bd895e');
    oval(ctx, x - 7, y - 8, 8, 3, '#744f3b');
    line(
      ctx,
      [
        [x - 16, y - 2],
        [x - 14, y + 5],
      ],
      '#d9b380',
      2,
    );
  } else if (resource === 'coin') {
    for (const [dx, dy] of [
      [-10, 5],
      [6, 7],
      [0, -1],
      [13, -2],
    ]) {
      oval(ctx, x + dx, y + dy, 8, 4.5, '#9b7c3c');
      oval(ctx, x + dx, y + dy - 2, 8, 4.5, '#d0b364');
      line(
        ctx,
        [
          [x + dx - 3, y + dy - 2],
          [x + dx + 3, y + dy - 2],
        ],
        '#f0db9c',
        1.4,
      );
    }
  } else if (resource === 'spear' || resource === 'metalArms') {
    for (const [dx, dy] of [
      [-6, 4],
      [5, -2],
    ]) {
      line(
        ctx,
        [
          [x + dx - 16, y + dy + 11],
          [x + dx + 12, y + dy - 11],
        ],
        '#8a6946',
        3,
      );
      polygon(
        ctx,
        [
          [x + dx + 8, y + dy - 13],
          [x + dx + 22, y + dy - 18],
          [x + dx + 15, y + dy - 5],
        ],
        resource === 'metalArms' ? '#a6b4a5' : '#a2a69b',
      );
    }
  } else {
    polygon(
      ctx,
      [
        [x - 18, y + 5],
        [x - 12, y - 9],
        [x + 6, y - 15],
        [x + 19, y - 3],
        [x + 10, y + 10],
        [x - 4, y + 12],
      ],
      '#78877c',
    );
    polygon(
      ctx,
      [
        [x - 12, y - 6],
        [x + 5, y - 11],
        [x + 15, y - 2],
        [x + 5, y + 4],
      ],
      '#bac2af',
    );
    line(
      ctx,
      [
        [x - 6, y + 8],
        [x + 2, y - 5],
        [x + 13, y - 2],
      ],
      '#dce0c7',
      1.2,
    );
  }
}

function drawGroundPile(ctx: CanvasRenderingContext2D, state: GameState, pile: GroundPile) {
  const p = worldPoint(pile.x, pile.y);
  oval(ctx, p.x + 2, p.y + 5, 29, 12, '#394a302b');
  oval(ctx, p.x, p.y + 2, 27, 10, '#d1bd8b55');
  drawMaterial(ctx, pile.resource, p.x, p.y, resourceKnown(state, pile.resource));
}

function rock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  shade = 0,
  unknown = false,
) {
  oval(ctx, x + size * 0.12, y + 2, size * 0.86, size * 0.26, '#59634b20');
  polygon(
    ctx,
    [
      [x - size, y],
      [x - size * 0.75, y - size * 0.75],
      [x - size * 0.08, y - size * 1.12],
      [x + size * 0.72, y - size * 0.68],
      [x + size, y - size * 0.05],
      [x + size * 0.3, y + size * 0.24],
    ],
    unknown ? '#969c96' : shade ? '#939c8a' : '#8f9580',
  );
  polygon(
    ctx,
    [
      [x - size * 0.75, y - size * 0.75],
      [x - size * 0.08, y - size * 1.12],
      [x + size * 0.72, y - size * 0.68],
      [x + size * 0.06, y - size * 0.4],
    ],
    unknown ? '#bdc1b9' : '#bcc1a6',
  );
  polygon(
    ctx,
    [
      [x + size * 0.06, y - size * 0.4],
      [x + size * 0.72, y - size * 0.68],
      [x + size, y - size * 0.05],
      [x + size * 0.3, y + size * 0.24],
    ],
    unknown ? '#777f78' : '#747f70',
  );
  line(
    ctx,
    [
      [x - size * 0.6, y - size * 0.3],
      [x - size * 0.18, y - size * 0.62],
      [x + size * 0.06, y - size * 0.4],
    ],
    unknown ? '#d4d7cd' : '#d1d1b9',
    0.8,
  );
}

export function createTerrain(
  seed: number,
  seasonIndex: number,
  world?: Pick<GameState, 'mapGeneration' | 'sectors' | 'home'>,
): HTMLCanvasElement {
  return createPainterlyTerrain(seed, seasonIndex, world);
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: GameState['entities'][number],
  time: number,
  seasonIndex: number,
  selected: boolean,
  unknown = false,
  animationContext?: AnimalAnimationContext,
) {
  const { x, y } = worldPoint(entity.x, entity.y);
  ctx.save();
  ctx.translate(x, y);
  drawPainterlyNature(ctx, entity, time, seasonIndex, unknown, animationContext);
  ctx.restore();
  if (selected && entity.hp !== undefined && entity.maxHp && entity.hp < entity.maxHp) {
    const ratio = Math.max(0, entity.hp / entity.maxHp);
    ctx.fillStyle = '#334a3b33';
    ctx.fillRect(x - 15, y + 18, 30, 3);
    ctx.fillStyle = '#b4805a';
    ctx.fillRect(x - 15, y + 18, 30 * ratio, 3);
  }
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: GameState['buildings'][number],
  time: number,
  producing?: boolean,
) {
  const { x, y } = worldPoint(building.x, building.y);
  ctx.save();
  ctx.translate(x, y);
  drawPainterlyBuilding(ctx, building, time, { producing });
  ctx.restore();
}

function drawHandheld(
  ctx: CanvasRenderingContext2D,
  equipment: VisibleUnitEquipment,
  time: number,
  id: number,
  pose: UnitAnimationPose,
) {
  if (!equipment.held) return;
  ctx.save();
  ctx.translate(pose.rightHand.x, pose.rightHand.y);
  ctx.scale(pose.facing, 1);
  ctx.rotate(pose.toolAngle);
  // Scale the object around its grip; the person's hand keeps its true size.
  const size = equipment.held === 'spear' ? 1 : equipment.held === 'metal-blade' ? 0.82 : 0.75;
  ctx.save();
  ctx.scale(size, size);
  if (equipment.held === 'spear') {
    // A real spear has both a wooden shaft and a bound, pointed stone head.
    line(
      ctx,
      [
        [0, 8],
        [0, -25],
      ],
      '#806043',
      1.9,
    );
    line(
      ctx,
      [
        [-0.4, 6],
        [-0.4, -24],
      ],
      '#b69b6e',
      0.55,
    );
    line(
      ctx,
      [
        [0, -10],
        [0.5, -10.6],
      ],
      '#5b4936',
      0.65,
    );
    polygon(
      ctx,
      [
        [0, -32],
        [-3.1, -23],
        [-1, -20],
        [2.8, -23],
      ],
      '#a8afa8',
      '#596965',
      0.9,
    );
    line(
      ctx,
      [
        [-0.2, -29],
        [-0.2, -22],
      ],
      '#e3e1ca',
      0.9,
    );
    line(
      ctx,
      [
        [-1.5, -21],
        [1.6, -20],
        [-1.5, -19],
      ],
      '#d8c39a',
      1,
    );
  } else if (equipment.held === 'metal-blade') {
    line(
      ctx,
      [
        [0, 5],
        [0, -1],
      ],
      '#72543a',
      2.8,
    );
    line(
      ctx,
      [
        [-3.4, -1],
        [3.4, -1],
      ],
      '#9b8050',
      1.8,
    );
    polygon(
      ctx,
      [
        [-2.6, -2],
        [-2.3, -14],
        [0, -21],
        [2.6, -14],
        [2.2, -2],
      ],
      '#b5ae87',
      '#686e61',
      0.9,
    );
    line(
      ctx,
      [
        [0, -4],
        [0, -17],
      ],
      '#f0e6bc',
      1,
    );
    oval(ctx, 0, 5.6, 1.8, 1.4, '#bca477');
  } else {
    const workpiece = equipment.held === 'workpiece';
    // The lithic recipe pays only stone: this is a hand axe, with no free handle.
    polygon(
      ctx,
      [
        [-3.4, 1],
        [-5.3, -4],
        [-3.5, -10],
        [0, -14],
        [3.3, -10],
        [4.6, -4],
        [2.3, 1],
      ],
      workpiece ? '#88897a' : '#728581',
      '#4f635e',
      1,
    );
    polygon(
      ctx,
      [
        [-3, -4],
        [0, -12],
        [2, -6],
        [0, -2],
      ],
      workpiece ? '#b8baa1' : '#b9c9bd',
    );
    line(
      ctx,
      [
        [-3.6, -3],
        [-1, -5],
        [1, -3],
      ],
      '#d8dcc5',
      0.8,
    );
    line(
      ctx,
      [
        [1.8, -9],
        [0.4, -6.8],
        [2, -5.7],
      ],
      '#596e68',
      0.45,
    );
    line(
      ctx,
      [
        [-3.1, -6.3],
        [-1.3, -8.7],
      ],
      '#dce3cd',
      0.4,
    );
    if (workpiece && pose.kind === 'craft' && pose.impact > 0) {
      const flake = (time * 3 + id) % 1;
      oval(ctx, 6 + flake * 3, -9 + flake * 6, 0.7, 0.5, '#d6d7b5');
    }
  }
  ctx.restore();
  // Fingers remain in front of the object, making the grip legible at map scale.
  oval(ctx, 0.7, 0.2, 1.8, 1.3, '#c2a07a');
  ctx.restore();
}

function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: GameState['units'][number],
  time: number,
  selected: boolean,
  carryRecognized: boolean,
  custodian?: CustodianStatus,
  isGroupMember = false,
  newbornArrival = false,
  equipment: VisibleUnitEquipment = {},
  numbered = false,
  pose = getUnitAnimation(unit, time, { equipment }),
  foreign?: 'visitor' | 'hostile',
) {
  const { x, y } = worldPoint(unit.x, unit.y);
  const id = Array.from(unit.id).reduce((n, c) => n + c.charCodeAt(0), 0);
  const sleeping = pose.kind === 'sleep';
  const stage = getLifeStage(unit),
    elder = stage === 'elder',
    child = stage === 'child',
    newborn = stage === 'newborn';
  const bob = pose.bob;
  ctx.save();
  ctx.translate(x, y + bob);
  if (newbornArrival) {
    const pulse = (1 + Math.sin(time * 4)) / 2;
    ctx.save();
    ctx.strokeStyle = `rgba(100, 135, 94, ${0.6 - pulse * 0.25})`;
    ctx.fillStyle = '#9dbd7730';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 1, 13 + pulse * 5, 5.5 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '600 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#fbf7df';
    ctx.lineWidth = 3;
    const caption = numbered ? '+1 Nuova vita' : 'Nuova vita';
    ctx.strokeText(caption, 0, -39 - pulse * 2);
    ctx.fillStyle = '#4f7452';
    ctx.fillText(caption, 0, -39 - pulse * 2);
    ctx.restore();
  }
  if (isGroupMember) {
    const pulse = 0.42 + Math.sin(time * 3.5 + id) * 0.16;
    ctx.save();
    ctx.fillStyle = `rgba(217, 169, 78, ${pulse})`;
    ctx.strokeStyle = `rgba(189, 137, 47, ${pulse + 0.25})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(2, 3, 10.5, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(2, 2.5);
  ctx.scale(newborn ? 5 : child ? 6 : 8, 3.2);
  const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  contact.addColorStop(0, '#33452b48');
  contact.addColorStop(0.5, '#33452b22');
  contact.addColorStop(1, '#33452b00');
  oval(ctx, 0, 0, 1, 1, contact);
  ctx.restore();
  // Keep the feet, selection and warning markers at the real map position.
  // Scaling only the body also keeps a child easy to select on a touch screen.
  ctx.save();
  const bodyScale = child ? 0.7 : elder ? 0.94 : newborn ? 0.82 : 1;
  ctx.scale(bodyScale, bodyScale);
  drawPainterlyBody(ctx, unit, time, equipment, pose, foreign);
  if (!newborn && !child && !sleeping && equipment.held)
    drawHandheld(ctx, equipment, time, id, pose);
  if (unit.carry && unit.carry.amount > 0 && !sleeping) {
    ctx.save();
    ctx.translate(
      (pose.leftHand.x + pose.rightHand.x) / 2,
      (pose.leftHand.y + pose.rightHand.y) / 2 + 1,
    );
    ctx.scale(0.38, 0.38);
    drawMaterial(ctx, unit.carry.resource, 0, 0, carryRecognized);
    ctx.restore();
  }
  ctx.restore();
  if (unit.isolation && unit.isolation > 3 && unit.isolation < 30) {
    oval(ctx, -7, -32, 4.5, 4.5, '#5e755b');
    ctx.fillStyle = '#f8f1db';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', -7, -29.5);
  }
  if (unit.hp < 45 || unit.hunger >= 80 || unit.temp <= 20) {
    const cold = unit.temp <= 20 && unit.hp >= 45;
    oval(ctx, 8, -32, 4.5, 4.5, unit.hp < 45 ? '#ad5941' : cold ? '#668e9a' : '#bc9a50');
    ctx.fillStyle = '#f8f1db';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    if (cold) {
      line(
        ctx,
        [
          [8, -35],
          [8, -29],
        ],
        '#f8f1db',
        1,
      );
      line(
        ctx,
        [
          [5.4, -33.5],
          [10.6, -30.5],
        ],
        '#f8f1db',
        1,
      );
      line(
        ctx,
        [
          [5.4, -30.5],
          [10.6, -33.5],
        ],
        '#f8f1db',
        1,
      );
    } else ctx.fillText('!', 8, -29.5);
  }
  if (custodian) {
    const color =
      custodian.risk === 'critical'
        ? '#ad5941'
        : custodian.risk === 'ageing'
          ? '#a87a32'
          : '#597a66';
    // A voice, separate from the diamond that opens a discovery puzzle.
    ctx.save();
    ctx.translate(-15, -38);
    if (custodian.risk !== 'safe') {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.2 + (1 + Math.sin(time * 3)) * 0.15;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10 + Math.sin(time * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    oval(ctx, 0, 0, 7.5, 6.5, '#fff8e6');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    polygon(
      ctx,
      [
        [-4, 4],
        [-6, 9],
        [0, 6],
      ],
      color,
    );
    oval(ctx, -2.5, 0, 1.1, 1.1, color);
    line(
      ctx,
      [
        [0, -2.5],
        [2, 0],
        [0, 2.5],
      ],
      color,
      1.3,
    );
    line(
      ctx,
      [
        [2.5, -4],
        [5, 0],
        [2.5, 4],
      ],
      color,
      1.1,
    );
    ctx.restore();
  }
  if (selected) {
    ctx.font = '11px Georgia';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#334d3c';
    ctx.fillText(unit.name, 0, -40);
  }
  ctx.restore();
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  ready = false,
  ghost = false,
) {
  const p = worldPoint(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = ready ? '#f7f0cf' : '#fff8de';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#3d503955';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.ellipse(0, 2, 22 + Math.sin(time * 2) * 0.7, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8c8955';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(0, 2, 25, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!ghost) {
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      line(
        ctx,
        [
          [Math.cos(angle) * 28, Math.sin(angle) * 16 + 2],
          [Math.cos(angle) * 34, Math.sin(angle) * 20 + 2],
        ],
        '#425c43',
        1.5,
      );
    }
  }
  ctx.restore();
}

function drawCampground(ctx: CanvasRenderingContext2D, state: GameState, showBoundary: boolean) {
  if (state.urbanized || !state.home || !showBoundary) return;
  const p = worldPoint(state.home.x, state.home.y);
  const isNight = state.time % 90 >= 60;

  ctx.save();

  // The painted terrain already contains an irregular clearing. Only the actual
  // 10m sleeping radius is overlaid while inspecting or giving a group order.
  const rx = 10 * 2.4;
  const ry = 10 * 1.6;

  // Tactical boundaries appear while inspecting the camp, with a fine line at every zoom.
  if (showBoundary) {
    const scale = Math.max(0.1, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
    ctx.strokeStyle = isNight ? 'rgba(225, 204, 158, 0.55)' : 'rgba(78, 99, 65, 0.42)';
    ctx.lineWidth = 1.2 / scale;
    ctx.setLineDash([5 / scale, 6 / scale]);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  terrain: HTMLCanvasElement,
  time: number,
  selected: WorldTarget | null,
  hovered: WorldTarget | null,
  commandReady: boolean,
  groupAnchor?: WorldTarget | null,
  isGroupActive = false,
  ping?: { x: number; y: number; time: number } | null,
  orderFeedback?: {
    from: { x: number; y: number }[];
    to: { x: number; y: number };
    time: number;
  } | null,
  viewport?: { minX: number; minY: number; maxX: number; maxY: number },
  motionSession: MapMotionSession = fallbackMotionSession,
  atmosphereOptions?: AtmosphereOptions,
) {
  ctx.drawImage(terrain, 0, 0, MAP_WIDTH, MAP_HEIGHT);
  drawRegionalRoutes(ctx, state, viewport);
  const nearHome = (target: WorldTarget | null) =>
    target?.type === 'point' && Math.hypot(target.x - state.home.x, target.y - state.home.y) <= 10;
  drawCampground(ctx, state, isGroupActive || nearHome(selected) || nearHome(hovered));
  // Artwork can extend above its anchor. Leave a margin so crowns and smoke never pop at edges.
  const inView = (point: { x: number; y: number }) =>
    !viewport ||
    (point.x >= viewport.minX - 16 &&
      point.x <= viewport.maxX + 16 &&
      point.y >= viewport.minY - 16 &&
      point.y <= viewport.maxY + 16);
  const lineScale = Math.max(0.1, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
  const motions = new Map(
    state.units
      .filter((u) => u.hp > 0)
      .map(
        (unit) =>
          [
            unit.id,
            observeUnitMotion(motionSession, unit, state.time, time, state.paused),
          ] as const,
      ),
  );
  const renderUnits = new Map(
    state.units.map((unit) => {
      const motion = motions.get(unit.id);
      return [
        unit.id,
        motion ? { ...unit, x: motion.displayX, y: motion.displayY } : unit,
      ] as const;
    }),
  );
  const renderEntities = new Map(
    state.entities.map((entity) => {
      if (!['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind) || entity.hp <= 0)
        return [entity.id, entity] as const;
      const motion = observeUnitMotion(motionSession, entity, state.time, time, state.paused);
      return [entity.id, { ...entity, x: motion.displayX, y: motion.displayY }] as const;
    }),
  );
  const animalContext: AnimalAnimationContext = {
    units: state.units,
    simulationTime: state.time,
    sessionKey: motionSession,
  };
  const piles = getGroundPiles(state);
  const custodians = new Map(getCustodianStatuses(state).map((status) => [status.unitId, status]));
  const focused = hovered?.type === 'building' ? hovered : selected;
  const fire =
    focused?.type === 'building'
      ? state.buildings.find((b) => b.id === focused.id && b.kind === 'campfire')
      : undefined;
  if (
    fire?.active &&
    fire.hp > 0 &&
    fire.completed !== false &&
    isPlayerBuilding(state, fire) &&
    isVisibleAt(state, fire.x, fire.y)
  ) {
    const center = worldPoint(fire.x, fire.y);
    ctx.save();
    ctx.beginPath();
    // This range uses world metres; the flame sprite itself is deliberately small.
    ctx.ellipse(
      center.x,
      center.y,
      FIRE_HEAT.radius * 2.4,
      FIRE_HEAT.radius * 1.6,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = '#d49b3912';
    ctx.fill();
    ctx.strokeStyle = '#aa792872';
    ctx.lineWidth = 1.2 / lineScale;
    ctx.setLineDash([5 / lineScale, 5 / lineScale]);
    ctx.stroke();
    if (state.playMode === 'guided') {
      ctx.beginPath();
      ctx.ellipse(
        center.x,
        center.y,
        FIRE_HEAT.guidedCoreRadius * 2.4,
        FIRE_HEAT.guidedCoreRadius * 1.6,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = '#e9b54732';
      ctx.fill();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#b77d22bb';
      ctx.lineWidth = 1.5 / lineScale;
      ctx.stroke();
    }
    ctx.restore();
  }
  const liveAnchor =
    groupAnchor && !state.urbanized
      ? groupAnchor.type === 'unit'
        ? (state.units.find((u) => u.id === groupAnchor.id && u.hp > 0) ?? groupAnchor)
        : groupAnchor
      : null;

  if (isGroupActive && isAllAdultsAnchor(groupAnchor)) {
    ctx.save();
    ctx.strokeStyle = '#b98839cc';
    ctx.lineWidth = 1.25 / lineScale;
    for (const person of selectableTribeAdults(state)) {
      if (!isVisibleAt(state, person.x, person.y)) continue;
      const p = worldPoint(person.x, person.y);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 2.3 * 2.4, 2.3 * 1.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (liveAnchor && isGroupActive) {
    const p = worldPoint(liveAnchor.x, liveAnchor.y);
    ctx.save();
    const pulse = 0.5 + Math.sin(time * 3) * 0.15;
    ctx.strokeStyle = `rgba(187, 138, 57, ${pulse + 0.25})`;
    ctx.fillStyle = 'rgba(217, 169, 78, 0.035)';
    ctx.lineWidth = 1.5 / lineScale;
    ctx.setLineDash([7 / lineScale, 5 / lineScale]);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 15 * 2.4, 15 * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Animazione ad onda del gruppo (ping quando viene cliccato/spostato)
  if (ping && time - ping.time >= 0 && time - ping.time <= 1.0) {
    const progress = (time - ping.time) / 1.0;
    const r = progress * 15;
    const p = worldPoint(ping.x, ping.y);
    const alpha = (1 - progress) * 0.75;
    ctx.save();
    ctx.strokeStyle = `rgba(217, 169, 78, ${alpha})`;
    ctx.lineWidth = 1.3 * (1 - progress * 0.4);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 2.4, r * 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Linee di esecuzione dell'ordine verso il bersaglio (Action Beams)
  if (orderFeedback && time - orderFeedback.time >= 0 && time - orderFeedback.time <= 1.2) {
    const elapsed = time - orderFeedback.time;
    const alpha = (1 - elapsed / 1.2) * 0.75;
    const targetP = worldPoint(orderFeedback.to.x, orderFeedback.to.y);
    ctx.save();
    ctx.strokeStyle = `rgba(224, 180, 80, ${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    for (const source of orderFeedback.from) {
      const srcP = worldPoint(source.x, source.y);
      ctx.beginPath();
      ctx.moveTo(srcP.x, srcP.y);
      ctx.lineTo(targetP.x, targetP.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  const liveTarget = (target: WorldTarget) =>
    target.type === 'unit'
      ? (renderUnits.get(target.id ?? '') ?? target)
      : target.type === 'entity'
        ? (groundPileFor(state, target.id, piles) ?? renderEntities.get(target.id ?? '') ?? target)
        : target.type === 'city'
          ? (state.cities.find((c) => c.id === target.id) ?? target)
          : target.type === 'battalion'
            ? (() => {
                const army = state.battalions.find((b) => b.id === target.id);
                return army ? getBattalionDisplayPoint(state, army) : target;
              })()
            : target.type === 'caravan'
              ? (state.caravans.find((c) => c.id === target.id) ?? target)
              : target;
  const sprite = (point: { x: number; y: number }, draw: () => void, scale = SPRITE_SCALE) => {
    const p = worldPoint(point.x, point.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.translate(-p.x, -p.y);
    draw();
    ctx.restore();
  };
  if (selected) {
    const p = liveTarget(selected);
    sprite(
      p,
      () => drawSelection(ctx, p.x, p.y, time, commandReady),
      ['city', 'battalion', 'caravan'].includes(selected.type) ? 1 : SPRITE_SCALE,
    );
  }
  if (hovered && hovered.id !== selected?.id) {
    const p = liveTarget(hovered);
    sprite(
      p,
      () => drawSelection(ctx, p.x, p.y, time, commandReady, true),
      ['city', 'battalion', 'caravan'].includes(hovered.type) ? 1 : SPRITE_SCALE,
    );
  }
  const objects: { y: number; draw: () => void }[] = [];
  for (const entity of renderEntities.values()) {
    if (
      entity.kind === 'ground' ||
      (entity.amount <= 0 && !['tree', 'stone'].includes(entity.kind)) ||
      !inView(entity) ||
      !isVisibleAt(state, entity.x, entity.y) ||
      (entity.kind === 'ore' && !hasConcept(state, 'O_07'))
    )
      continue;
    if (
      entity.kind === 'wolf' &&
      state.time % 90 < 60 &&
      !entity.attacked &&
      !state.units.some((u) => u.hp > 0 && Math.hypot(u.x - entity.x, u.y - entity.y) < 20)
    )
      continue;
    const unknown =
      (entity.kind === 'tree' && !hasConcept(state, 'O_03')) ||
      (entity.kind === 'stone' && !hasConcept(state, 'O_02'));
    objects.push({
      y: entity.y,
      draw: () =>
        sprite(entity, () => {
          drawEntity(
            ctx,
            entity,
            time,
            state.seasonIndex,
            selected?.id === entity.id,
            unknown,
            animalContext,
          );
        }),
    });
  }
  for (const pile of piles) {
    if (!inView(pile) || !isVisibleAt(state, pile.entity.x, pile.entity.y)) continue;
    objects.push({
      y: pile.y + 0.1,
      draw: () => sprite(pile, () => drawGroundPile(ctx, state, pile)),
    });
  }
  if (!state.urbanized)
    for (const b of state.buildings.filter(
      (b) => b.hp > 0 && inView(b) && isVisibleAt(state, b.x, b.y),
    ))
      objects.push({
        y: b.y,
        draw: () =>
          sprite(b, () =>
            drawBuilding(
              ctx,
              b,
              time,
              b.kind === 'foundry' ? isFoundryProducing(state, b) : undefined,
            ),
          ),
      });
  for (const unit of [...renderUnits.values()].filter(
    (u) =>
      u.hp > 0 &&
      inView(u) &&
      isVisibleAt(state, u.x, u.y) &&
      (!state.urbanized ||
        (u.factionId !== undefined && u.factionId !== 'player') ||
        u.isKing ||
        ['delegating', 'frontline', 'frontline-returning'].includes(u.action)),
  ))
    objects.push({
      y: unit.y + 0.3,
      draw: () =>
        sprite(unit, () => {
          const isGroupMember = !!(
            isGroupActive &&
            liveAnchor &&
            Math.hypot(unit.x - liveAnchor.x, unit.y - liveAnchor.y) <= 15
          );
          const actual = state.units.find((u) => u.id === unit.id)!;
          const target =
            state.entities.find((e) => e.id === actual.targetId) ??
            state.buildings.find(
              (b) => b.id === actual.jobBuildingId || b.id === actual.targetId,
            ) ??
            (actual.action === 'guarding'
              ? state.buildings.find(
                  (b) =>
                    b.kind === 'campfire' &&
                    b.hp > 0 &&
                    Math.hypot(b.x - actual.x, b.y - actual.y) <= 15,
                )
              : undefined) ??
            state.units.find((u) => u.id === actual.targetId) ??
            (actual.tx !== undefined && actual.ty !== undefined
              ? { x: actual.tx, y: actual.ty }
              : undefined);
          const motion = motions.get(unit.id);
          const equipment = visibleUnitEquipment(state, actual);
          const range = ['combat', 'hunting'].includes(actual.action)
            ? target && 'kind' in target && equipment.held === 'spear'
              ? 3
              : 1.5
            : actual.action === 'crafting' || actual.action === 'cooking'
              ? 0.1
              : actual.jobBuildingId
                ? 3
                : 3.7;
          const cyclicWork = [
            'gathering',
            'crafting',
            'cooking',
            'building',
            'planting',
            'eating',
            'domesticating',
            'hunting',
            'combat',
          ].includes(actual.action);
          const workedRecently = Object.entries(actual.lastEventAt ?? {}).some(
            ([key, at]) =>
              key.startsWith('WORK:') && at >= (actual.lastOrderAt ?? 0) && state.time - at < 2,
          );
          const ready =
            (!target || Math.hypot(target.x - actual.x, target.y - actual.y) <= range + 0.01) &&
            (!cyclicWork || actual.progress > 0 || workedRecently) &&
            (!['combat', 'hunting'].includes(actual.action) ||
              !target ||
              !('hp' in target) ||
              target.hp > 0);
          const targetFacing =
            target && Math.abs(target.x - unit.x) > 0.1 ? (target.x > unit.x ? 1 : -1) : undefined;
          const recentEvent =
            state.time - (actual.lastEventAt?.DELIVERY ?? -Infinity) < 0.6
              ? 'deposit'
              : state.time - (actual.lastEventAt?.MEAL ?? -Infinity) < 0.8
                ? 'meal'
                : undefined;
          const pose = getUnitAnimation(actual, time, {
            moving: motion?.moving ?? false,
            facing: motion?.moving ? motion.facing : (targetFacing ?? motion?.facing),
            targetKind: target && 'kind' in target ? target.kind : undefined,
            target,
            ready,
            equipment,
            recentEvent,
          });
          drawUnit(
            ctx,
            unit,
            time,
            selected?.id === unit.id && hasConcept(state, 'S_02'),
            !!unit.carry && resourceKnown(state, unit.carry.resource),
            custodians.get(unit.id),
            isGroupMember,
            (state.tribeEvents ?? []).some(
              (event) =>
                event.kind === 'birth' &&
                event.unitId === unit.id &&
                state.time >= event.time &&
                state.time - event.time < 5,
            ),
            equipment,
            hasConcept(state, 'O_08'),
            pose,
            foreignUnitDisposition(state, actual),
          );
        }),
    });
  for (const city of state.cities.filter(
    (c) =>
      (!viewport ||
        (c.x >= viewport.minX - 35 &&
          c.x <= viewport.maxX + 35 &&
          c.y >= viewport.minY - 40 &&
          c.y <= viewport.maxY + 40)) &&
      isVisibleAt(state, c.x, c.y) &&
      c.factionId !== 'ruins',
  ))
    objects.push({
      y: city.y,
      draw: () => {
        const p = worldPoint(city.x, city.y),
          own = city.factionId === 'player';
        if (state.tier >= 4) {
          ctx.save();
          ctx.translate(p.x, p.y);
          drawPainterlyCity(ctx, state, city, time, {
            reducedMotion: atmosphereOptions?.reducedMotion,
          });
          ctx.restore();
        } else {
          oval(ctx, p.x, p.y + 2, 19, 7, '#3a4b3025');
          sprite(
            city,
            () => {
              for (let i = 0; i < 5; i++)
                drawBuilding(
                  ctx,
                  {
                    id: 'city-roof',
                    kind: i === 4 && city.capital ? 'palace' : 'house',
                    x: city.x + (i % 3) * 11 - 10,
                    y: city.y + Math.floor(i / 3) * 15 - 8,
                    hp: 400,
                    active: true,
                  },
                  time,
                );
            },
            0.45,
          );
          // Urbanization keeps the actual institutions visible around the city node.
          const institutions = state.buildings.filter(
            (b) =>
              b.cityId === city.id &&
              b.hp > 0 &&
              b.completed !== false &&
              ['walls', 'market', 'court', 'temple', 'archive', 'school', 'workshop'].includes(
                b.kind,
              ),
          );
          for (let i = 0; i < institutions.length; i++) {
            const angle = -Math.PI + (i * Math.PI * 2) / Math.max(7, institutions.length);
            const building = {
              ...institutions[i],
              x: city.x + Math.cos(angle) * 18,
              y: city.y + Math.sin(angle) * 22,
            };
            sprite(building, () => drawBuilding(ctx, building, time), 0.18);
          }
        }
        ctx.fillStyle = own ? '#456a48' : '#a57855';
        const flagY = state.tier >= 4 ? -42 : -27;
        ctx.fillRect(p.x - 1, p.y + flagY, 1.4, 15);
        polygon(
          ctx,
          [
            [p.x, p.y + flagY],
            [p.x + 11, p.y + flagY + 4],
            [p.x, p.y + flagY + 8],
          ],
          own ? '#6d8b54' : '#b38e6c',
        );
        const labelScale = Math.max(0.05, lineScale / (atmosphereOptions?.pixelRatio ?? 1));
        const nameSize =
          state.tier >= 4 ? Math.max(9, Math.min(16, 10 * labelScale)) / labelScale : 10;
        ctx.font = `${nameSize}px Georgia`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#465b3d';
        ctx.strokeStyle = '#f8f3e3';
        ctx.lineWidth = state.tier >= 4 ? 2 / labelScale : 3;
        ctx.strokeText(city.name, p.x, p.y + (state.tier >= 4 ? 27 : 23));
        ctx.fillText(city.name, p.x, p.y + (state.tier >= 4 ? 27 : 23));
        if (hasConcept(state, 'O_08')) {
          ctx.font = `${state.tier >= 4 ? Math.max(7, Math.min(10, 7 * labelScale)) / labelScale : 7}px sans-serif`;
          ctx.fillStyle = '#7e896c';
          ctx.fillText(
            `${Object.values(city.cohorts).reduce((n, v) => n + v, 0)}`,
            p.x,
            p.y + (state.tier >= 4 ? 37 : 33),
          );
        }
      },
    });
  for (const b of state.battalions.filter(
    (b) => b.hp > 0 && inView(getBattalionDisplayPoint(state, b)) && isVisibleAt(state, b.x, b.y),
  ))
    objects.push({
      y: getBattalionDisplayPoint(state, b).y,
      draw: () => {
        const display = getBattalionDisplayPoint(state, b);
        const p = worldPoint(display.x, display.y);
        if (display.x !== b.x || display.y !== b.y) {
          const anchor = worldPoint(b.x, b.y);
          line(
            ctx,
            [
              [anchor.x, anchor.y],
              [p.x, p.y],
            ],
            '#9c81644d',
            0.65,
          );
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        drawPainterlyBattalion(ctx, b, time);
        ctx.restore();
      },
    });
  for (const c of state.caravans.filter(
    (c) => c.hp > 0 && !c.arrived && inView(c) && isVisibleAt(state, c.x, c.y),
  ))
    objects.push({
      y: c.y,
      draw: () => {
        const p = worldPoint(c.x, c.y);
        ctx.save();
        ctx.translate(p.x, p.y);
        drawPainterlyCaravan(ctx, c, time);
        ctx.restore();
      },
    });
  objects.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  drawRegionalSieges(ctx, state, time, { ...atmosphereOptions, viewport });
  for (const spark of state.sparks) {
    const u = renderUnits.get(spark.unitId);
    if (!u || u.hp <= 0 || !inView(u)) continue;
    sprite(u, () => {
      const p = worldPoint(u.x, u.y),
        x = p.x,
        y = p.y - 36 + Math.sin(time * 3) * 2;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 25);
      glow.addColorStop(0, '#f9e4a477');
      glow.addColorStop(1, '#f9e4a400');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 25, y - 25, 50, 50);
      polygon(
        ctx,
        [
          [x, y - 10],
          [x + 8, y],
          [x, y + 10],
          [x - 8, y],
        ],
        '#f7e5b0',
      );
      ctx.strokeStyle = '#a38740';
      ctx.lineWidth = 1;
      ctx.stroke();
      line(
        ctx,
        [
          [x + 1, y - 6],
          [x - 3, y + 1],
          [x + 2, y + 1],
          [x - 1, y + 6],
        ],
        '#987c35',
        2,
      );
    });
  }
  if (hasConcept(state, 'O_10')) {
    const p = worldPoint(state.home.x, state.home.y),
      radius = visibleBorderRadius(state);
    ctx.strokeStyle = '#a5ae6a99';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * 2.4, radius * 1.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (state.tier >= 4) {
    ctx.strokeStyle = '#8c947738';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo((i * MAP_WIDTH) / 5, 0);
      ctx.lineTo((i * MAP_WIDTH) / 5, MAP_HEIGHT);
      ctx.moveTo(0, (i * MAP_HEIGHT) / 5);
      ctx.lineTo(MAP_WIDTH, (i * MAP_HEIGHT) / 5);
      ctx.stroke();
    }
  }
  for (let sy = 0; sy < 5; sy++)
    for (let sx = 0; sx < 5; sx++)
      if (!isVisibleAt(state, sx * 100 + 50, sy * 100 + 50)) {
        ctx.fillStyle = '#e3e1cbf5';
        ctx.fillRect(
          (sx * MAP_WIDTH) / 5,
          (sy * MAP_HEIGHT) / 5,
          MAP_WIDTH / 5 + 0.5,
          MAP_HEIGHT / 5 + 0.5,
        );
      }

  // Twilight comes from the simulation, so pausing also pauses the day.
  const seasonTime = state.time % 90;
  const darkness =
    seasonTime < 54
      ? 0
      : seasonTime < 65
        ? (seasonTime - 54) / 11
        : seasonTime < 84
          ? 1
          : (90 - seasonTime) / 6;
  if (darkness > 0) {
    ctx.fillStyle = `rgba(35,53,66,${darkness * 0.38})`;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    for (const fire of state.buildings.filter(
      (b) =>
        b.kind === 'campfire' &&
        b.active &&
        b.hp > 0 &&
        b.completed !== false &&
        inView(b) &&
        isVisibleAt(state, b.x, b.y),
    )) {
      const p = worldPoint(fire.x, fire.y);
      const light = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 36);
      light.addColorStop(0, `rgba(245,188,98,${darkness * 0.26})`);
      light.addColorStop(0.55, `rgba(245,188,98,${darkness * 0.08})`);
      light.addColorStop(1, '#f5bc6200');
      ctx.fillStyle = light;
      ctx.fillRect(p.x - 36, p.y - 36, 72, 72);
    }
  }

  drawMapAtmosphere(ctx, state, time, viewport, atmosphereOptions);

  // Unexplored margins fade into the paper rather than a hard black RTS mask.
  const vignette = ctx.createRadialGradient(600, 405, 280, 600, 405, 720);
  vignette.addColorStop(0, '#e9e6cd00');
  vignette.addColorStop(0.55, '#e9e6cd00');
  vignette.addColorStop(1, '#e9e6cddd');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // A few birds provide scale, never gameplay information.
  ctx.strokeStyle = '#546d534d';
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 3; i++) {
    const x = ((time * 3 + 140 + i * 17) % 1400) - 100,
      y = 130 + Math.sin(time * 0.04 + i) * 15 + i * 9;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 2);
    ctx.quadraticCurveTo(x - 2, y - 4 - Math.sin(time * 2) * 2, x, y);
    ctx.quadraticCurveTo(x + 2, y - 4 - Math.sin(time * 2) * 2, x + 4, y - 2);
    ctx.stroke();
  }
}
