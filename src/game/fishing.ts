import { canPayLocally, canUseGroundInput, payLocally } from './craftMaterials';
import { hasWord, nextId } from './runtime';
import type { GameState, Inventory, MapEntity, Resource, Target, Unit } from './types';

export const fishingEnabled = (state: GameState) => state.mapGeneration?.coastalRules === 1;
export const fishingCapacity = (state: GameState) =>
  hasWord(state, 'O_13') ? 5 : hasWord(state, 'V_05') ? 3 : 1;
export const isSeafood = (resource: Resource) => resource === 'fish' || resource === 'cookedFish';
export const FISHING_SECONDS = 6;
export type CookInput = 'meat' | 'fish';
export interface CookingChoice {
  worker: Unit;
  input: CookInput;
  pile?: MapEntity;
}

/** Choose the artisan with the real available input, including an explicitly
 * selected physical pile. Roster order must not hide another artisan's food. */
export function chooseCookingInput(
  state: GameState,
  workers: Unit[],
  target?: Target,
): CookingChoice | undefined {
  const selected =
    fishingEnabled(state) && target?.type === 'entity'
      ? state.entities.find(
          (entity) =>
            entity.id === target.id &&
            entity.kind === 'ground' &&
            entity.resource === 'fish' &&
            entity.amount >= 1,
        )
      : undefined;
  if (selected) {
    const worker = workers.find((candidate) => canUseGroundInput(state, selected, candidate));
    if (worker) return { worker, input: 'fish', pile: selected };
  }
  for (const input of ['meat', ...(fishingEnabled(state) ? ['fish'] : [])] as CookInput[]) {
    const worker = workers.find((candidate) => canPayLocally(state, { [input]: 1 }, candidate));
    if (worker) return { worker, input };
  }
  return undefined;
}

export function payCookingInput(state: GameState, choice: CookingChoice) {
  if (choice.pile) choice.pile.amount -= 1;
  else payLocally(state, { [choice.input]: 1 }, choice.worker);
}

/** A paid cooking portion belongs to the physical world through every interrupt. */
export function refundPaidCooking(
  state: GameState,
  unit: Unit,
  reason: 'interrupt' | 'fire-out' = 'interrupt',
) {
  // Legacy worlds only returned an unfinished portion when the fire went out.
  // Expanding their other interruptions would change their saved food balance.
  if (!fishingEnabled(state) && reason !== 'fire-out') return false;
  if (unit.action !== 'cooking' || !unit.command?.includes('V_07') || unit.craftNeedsPayment)
    return false;
  const resource: Resource = unit.command.includes('O_02')
    ? 'stone'
    : unit.cookInput === 'fish'
      ? 'fish'
      : 'meat';
  unit.craftNeedsPayment = true;
  unit.cookInput = undefined;
  state.entities.push({
    id: nextId(state, 'ground'),
    kind: 'ground',
    x: unit.x,
    y: unit.y,
    amount: 1,
    maxAmount: 1,
    hp: 0,
    maxHp: 1,
    resource,
    sectorId: `sector-${Math.floor(unit.x / 100)}-${Math.floor(unit.y / 100)}`,
  });
  return true;
}

/** Only a stored portion releases a storage slot; a selected pile stays physical. */
export function cookingPaymentCost(choice: CookingChoice): Partial<Inventory> {
  return choice.pile ? {} : { [choice.input]: 1 };
}
