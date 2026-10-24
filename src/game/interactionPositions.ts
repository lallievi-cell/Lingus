import type { GameState, Unit } from './types';

export type InteractionKind =
  | 'resource'
  | 'tree'
  | 'stone'
  | 'forage'
  | 'craft'
  | 'cook'
  | 'build'
  | 'work'
  | 'fire'
  | 'hunt'
  | 'meal'
  | 'return'
  | 'rest'
  | 'move';

export type InteractionAnchor = { x: number; y: number; id?: string; kind?: string };
export type InteractionOptions = {
  kind?: InteractionKind;
  /** A moving object keeps its identity even while its coordinates change. */
  key?: string;
  /** Callers with an explicit reservation can supply its permanent slot. */
  slot?: number;
  /** A real rule, such as melee range, can constrain the entire layout. */
  maxRadius?: number;
};

export type InteractionPosition = {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  facingX: number;
  facingY: number;
  slot: number;
  key: string;
};

const WORLD_SIZE = 500;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const maximumRadius: Record<InteractionKind, number> = {
  resource: 3.6,
  tree: 3.6,
  stone: 3.4,
  forage: 3.4,
  craft: 0,
  cook: 0,
  build: 2.4,
  work: 2.7,
  fire: 3.2,
  hunt: 1.5,
  meal: 3,
  return: 6.5,
  rest: 6.5,
  move: 4.5,
};

function hash(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967296;
}

function inferKind(unit: Unit, anchor: InteractionAnchor): InteractionKind {
  if (['hunting', 'combat'].includes(unit.action)) return 'hunt';
  if (unit.action === 'returning') return 'return';
  if (unit.action === 'sleeping') return 'rest';
  if (unit.action === 'crafting') return 'craft';
  if (unit.action === 'cooking') return 'cook';
  if (unit.action === 'building' || unit.action === 'planting') return 'build';
  if (unit.action === 'guarding' || anchor.kind === 'campfire') return 'fire';
  if (unit.action === 'eating') return 'meal';
  if (['moving', 'fleeing', 'patrolling'].includes(unit.action)) return 'move';
  if (anchor.kind === 'tree') return 'tree';
  if (['stone', 'ore'].includes(anchor.kind ?? '')) return 'stone';
  if (anchor.kind === 'berries') return 'forage';
  if (unit.jobBuildingId) return 'work';
  return 'resource';
}

function sameCommunity(a: Unit, b: Unit) {
  return (a.factionId ?? 'player') === (b.factionId ?? 'player');
}

/**
 * Unit order is persistent in a save: deaths stay in the roster and births append.
 * Do not rank the currently active workers: finishing a trip would move everyone
 * else's endpoint and a chasing formation would never reach its working position.
 */
function permanentSlot(state: GameState, unit: Unit) {
  const roster = state.units.filter((other) => sameCommunity(other, unit));
  const index = roster.findIndex((other) => other.id === unit.id);
  return index >= 0 ? index : Math.floor(hash(unit.id) * 64);
}

function offsetFor(kind: InteractionKind, slot: number, radius: number, phase: number) {
  if (radius === 0) return { x: 0, y: 0 };
  if (kind === 'hunt') {
    // Tight melee and longer spear reach use the same six approach directions.
    // Extra actors get distinct angles; they never gain additional attack range.
    const angle = phase + (slot < 6 ? (slot * Math.PI) / 3 : slot * GOLDEN_ANGLE);
    return { x: Math.cos(angle) * radius * 0.9, y: Math.sin(angle) * radius * 0.9 };
  }
  if (['return', 'rest', 'move'].includes(kind)) {
    const angle = phase + slot * GOLDEN_ANGLE;
    const r = Math.min(radius, (kind === 'rest' ? 2 : 1.5) + Math.sqrt(slot) * 1.2);
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  }
  // Six adults in the starting clan can work along the front and flanks. The
  // positive y side stays in front of tall foliage/buildings in the depth sort.
  const firstArc = slot < 6;
  const angle =
    (firstArc ? (slot * Math.PI) / 5 : ((slot * 0.6180339887498949) % 1) * Math.PI) +
    (phase - Math.PI) * 0.012;
  const ring = Math.floor(slot / 6);
  const baseX = kind === 'stone' ? 2.4 : kind === 'fire' ? 2.75 : 2.65;
  const baseY = kind === 'stone' ? 1.8 : 2;
  const x = Math.cos(angle) * (baseX + ring * 0.8);
  const y = 0.4 + Math.sin(angle) * (baseY + ring * 0.7);
  const length = Math.hypot(x, y);
  const ratio = length > radius ? radius / length : 1;
  return { x: x * ratio, y: y * ratio };
}

function withinWorld(x: number, y: number) {
  return x >= 0 && x <= WORLD_SIZE && y >= 0 && y <= WORLD_SIZE;
}

/**
 * Pure physical destination around a logical target. The caller moves the unit
 * here; tx/ty and targetId can continue to describe the actual object/order.
 * No unit, resource, random stream or save data is changed by this function.
 */
export function resolveInteractionPosition(
  state: GameState,
  unit: Unit,
  anchor: InteractionAnchor,
  options: InteractionOptions = {},
): InteractionPosition {
  const kind = options.kind ?? inferKind(unit, anchor);
  const slot = Math.max(0, Math.floor(options.slot ?? permanentSlot(state, unit)));
  const anchorX = Math.max(0, Math.min(WORLD_SIZE, anchor.x));
  const anchorY = Math.max(0, Math.min(WORLD_SIZE, anchor.y));
  const key = options.key ?? anchor.id ?? `${kind}:${anchorX.toFixed(3)},${anchorY.toFixed(3)}`;
  const radius = Number.isFinite(options.maxRadius)
    ? Math.max(0, Math.min(10, options.maxRadius!))
    : maximumRadius[kind];
  const phase = hash(key) * Math.PI * 2;
  let offset = offsetFor(kind, slot, radius, phase);
  if (!withinWorld(anchorX + offset.x, anchorY + offset.y)) {
    // Reorient a border slot into the map rather than clamping several people
    // onto the same edge coordinate. Keep the real interaction radius unchanged.
    const distance = Math.hypot(offset.x, offset.y);
    const angle = Math.atan2(offset.y, offset.x);
    for (let attempt = 1; attempt <= 64; attempt++) {
      const inward = angle + attempt * GOLDEN_ANGLE + slot * 0.037;
      const candidate = { x: Math.cos(inward) * distance, y: Math.sin(inward) * distance };
      if (withinWorld(anchorX + candidate.x, anchorY + candidate.y)) {
        offset = candidate;
        break;
      }
    }
  }
  const x = anchorX + offset.x;
  const y = anchorY + offset.y;
  return { x, y, anchorX, anchorY, facingX: anchorX, facingY: anchorY, slot, key };
}
