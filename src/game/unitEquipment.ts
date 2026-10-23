import { ADULT_AGE } from './content';
import { getDogmaEffects } from './dogmas';
import { activeUnits } from './runtime';
import type { GameState, Inventory, Resource, Unit } from './types';

export interface CombatEquipment {
  damage: number;
  armor: number;
  kind?: 'metalArms' | 'spear' | 'tool';
  inventory: Inventory;
}

const ownAdult = (unit: Unit) =>
  unit.hp > 0 && unit.age >= ADULT_AGE && (!unit.factionId || unit.factionId === 'player');

/** Equipment is supplied by the same real stock that is charged for its wear. */
export function equipmentInventoryAt(state: GameState, unit: Unit): Inventory {
  return unit.cityId && state.urbanized
    ? (state.cities.find((city) => city.id === unit.cityId && city.factionId === 'player')
        ?.resources ?? state.resources)
    : state.resources;
}

function fightersAt(state: GameState, inventory: Inventory) {
  return activeUnits(state)
    .filter(
      (unit) =>
        ownAdult(unit) &&
        ['hunting', 'combat'].includes(unit.action) &&
        equipmentInventoryAt(state, unit) === inventory,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Whole items are reserved once, in stable fighter order: metal, spear, then stone. */
export function combatEquipmentFor(state: GameState, unit: Unit): CombatEquipment {
  const inventory = equipmentInventoryAt(state, unit);
  const unarmed = { damage: 5, armor: 0, inventory };
  if (!ownAdult(unit)) return unarmed;
  const fighters = fightersAt(state, inventory);
  // Civil assault explicitly queries an otherwise idle attacker or defender.
  // Preserve that immediate defensive query; idle people do not display gear.
  const rank = Math.max(
    0,
    fighters.findIndex((fighter) => fighter.id === unit.id),
  );
  const metal = Math.floor(inventory.metalArms),
    spears = Math.floor(inventory.spear);
  if (rank < metal) return { damage: 40, armor: 0.5, kind: 'metalArms', inventory };
  const nonMetalRank = rank - metal;
  const armor = nonMetalRank < Math.floor(inventory.pelt) ? 0.15 : 0;
  if (nonMetalRank < spears) return { damage: 15, armor, kind: 'spear', inventory };
  const stoneRank = nonMetalRank - spears;
  if (stoneRank < Math.floor(inventory.tool)) {
    const obsidian = getDogmaEffects(state).obsidianDamage;
    return { damage: obsidian || 8, armor: obsidian ? 0 : armor, kind: 'tool', inventory };
  }
  return { damage: 5, armor, inventory };
}

function gatheredMaterial(state: GameState, unit: Unit): Resource | undefined {
  const target = state.entities.find((entity) => entity.id === unit.targetId);
  if (target?.kind === 'tree') return 'wood';
  if (target?.kind === 'stone') return 'stone';
  if (target?.kind === 'ground') return target.resource;
  return undefined;
}

/** A village tool cannot accelerate a fighter and a gatherer at the same time. */
export function gatheringEquipmentFor(
  state: GameState,
  unit: Unit,
  resource = gatheredMaterial(state, unit),
) {
  const inventory = state.resources;
  if (!ownAdult(unit) || unit.action !== 'gathering' || !['wood', 'stone'].includes(resource ?? ''))
    return { kind: undefined, speed: 1, inventory };
  const workers = activeUnits(state).filter(
    (worker) =>
      ownAdult(worker) &&
      worker.action === 'gathering' &&
      ['wood', 'stone'].includes(gatheredMaterial(state, worker) ?? ''),
  );
  const rank = workers.findIndex((worker) => worker.id === unit.id);
  const fighters = fightersAt(state, inventory).length;
  const combatTools = Math.min(
    Math.floor(inventory.tool),
    Math.max(0, fighters - Math.floor(inventory.metalArms) - Math.floor(inventory.spear)),
  );
  const equipped = rank >= 0 && rank < Math.floor(inventory.tool) - combatTools;
  return { kind: equipped ? ('tool' as const) : undefined, speed: equipped ? 1.5 : 1, inventory };
}

export type HeldEquipment = 'flint' | 'spear' | 'metal-blade' | 'workpiece';
export interface VisibleUnitEquipment {
  held?: HeldEquipment;
  armor?: 'metal' | 'pelt';
}

/** The renderer describes equipment actually used now, not all items in stock. */
export function visibleUnitEquipment(state: GameState, unit: Unit): VisibleUnitEquipment {
  if (!ownAdult(unit)) return {};
  if (['hunting', 'combat'].includes(unit.action)) {
    const equipment = combatEquipmentFor(state, unit);
    return {
      held:
        equipment.kind === 'metalArms'
          ? 'metal-blade'
          : equipment.kind === 'spear'
            ? 'spear'
            : equipment.kind === 'tool'
              ? 'flint'
              : undefined,
      armor: equipment.armor === 0.5 ? 'metal' : equipment.armor > 0 ? 'pelt' : undefined,
    };
  }
  if (gatheringEquipmentFor(state, unit).kind) return { held: 'flint' };
  // This is the stone already paid for the current craft, not a free finished tool.
  if (
    unit.action === 'crafting' &&
    unit.command?.includes('V_06') &&
    unit.command.includes('O_02') &&
    !unit.craftNeedsPayment
  )
    return { held: 'workpiece' };
  return {};
}
