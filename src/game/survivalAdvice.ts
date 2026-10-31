import { cognitiveSlots } from './grammar';
import { getCalendar } from './calendar';
import { getDogmaEffects } from './dogmas';
import { getCustodianStatuses } from './custodianStatus';
import { activeUnits, distance, hasBuilding, hasWord, isPlayerBuilding } from './runtime';
import { thermalConditionsAt } from './thermal';
import type { GameState, Target, Unit } from './types';

export interface SurvivalAdvice {
  id: string;
  priority: 'danger' | 'care';
  title: string;
  text: string;
  action: 'recall' | 'eat' | 'teach' | 'funeral';
  actionLabel: string;
  focus?: Target;
  phrase?: string[];
  destination?: Target;
}
const unitTarget = (unit: Unit): Target => ({ type: 'unit', id: unit.id, x: unit.x, y: unit.y });
const explored = (state: GameState, point: { x: number; y: number }) =>
  state.tier >= 4 ||
  state.sectors.some(
    (sector) =>
      sector.explored &&
      sector.x === Math.floor(point.x / 100) &&
      sector.y === Math.floor(point.y / 100),
  );

/** One actionable priority, based on observed needs. No resources or future events are granted. */
export function getSurvivalAdvice(state: GameState): SurvivalAdvice | null {
  if (!state.started || state.gameOver || state.victory || state.urbanized) return null;
  const people = activeUnits(state);
  const cold = people
    .map((unit) => ({ unit, thermal: thermalConditionsAt(state, unit) }))
    .filter(({ unit, thermal }) => unit.temp <= 40 && thermal.delta < 0)
    .sort(
      (a, b) =>
        Math.max(0, a.unit.temp - 20) / -a.thermal.delta +
        a.unit.hp / 1.5 -
        (Math.max(0, b.unit.temp - 20) / -b.thermal.delta + b.unit.hp / 1.5),
    )[0];
  const hungry = people
    .filter((unit) => unit.hunger >= 85)
    .sort((a, b) => (100 - a.hunger) / 0.8 + a.hp / 2 - ((100 - b.hunger) / 0.8 + b.hp / 2))[0];
  const coldTime = cold
    ? Math.max(0, cold.unit.temp - 20) / -cold.thermal.delta + cold.unit.hp / 1.5
    : Infinity;
  const hungerTime = hungry ? (100 - hungry.hunger) / 0.8 + hungry.hp / 2 : Infinity;
  if (cold && coldTime <= hungerTime)
    return {
      id: `cold:${cold.unit.id}`,
      priority: cold.unit.temp <= 20 ? 'danger' : 'care',
      title: cold.unit.temp <= 20 ? 'Un compagno sta gelando' : 'Cerca riparo prima del gelo',
      text: hasBuilding(state, 'campfire')
        ? state.playMode === 'guided'
          ? 'Raduna gli adulti nel nucleo caldo. I compagni infreddoliti cercano il miglior riparo disponibile; una tormenta può richiedere anche pelli e case.'
          : 'Raduna gli adulti nel miglior riparo. In Classica il calore del falò è uniforme: durante il gelo aiutano anche pelli e case.'
        : 'Serve un riparo attivo: il giaciglio da solo non scalda. Controlla fuoco, combustibile e protezione dei compagni.',
      action: 'recall',
      actionLabel: 'Raduna al riparo',
      focus: unitTarget(cold.unit),
    };
  if (hungry) {
    const season = getCalendar(state).season;
    const vegetarian = getDogmaEffects(state, { unit: hungry }).vegetarian;
    const source = state.entities
      .filter(
        (entity) =>
          entity.amount > 0 &&
          explored(state, entity) &&
          ((entity.kind === 'berries' && season !== 3) ||
            (!vegetarian &&
              ['deer', 'wolf', 'alpha', 'mammoth'].includes(entity.kind) &&
              entity.hp <= 0) ||
            (entity.kind === 'ground' &&
              (vegetarian ? ['food'] : ['food', 'cooked', 'meat']).includes(
                entity.resource ?? '',
              ))),
      )
      .sort((a, b) => distance(a, hungry) - distance(b, hungry))[0];
    const canNameFood = hasWord(state, 'O_04') && cognitiveSlots(state) >= 3;
    const stores =
      state.resources.food + (vegetarian ? 0 : state.resources.meat + state.resources.cooked) > 0;
    return {
      id: `hunger:${hungry.id}`,
      priority: hungry.hunger >= 95 ? 'danger' : 'care',
      title: hungry.hunger >= 95 ? 'Prima viene il cibo' : 'Un compagno deve mangiare',
      text: stores
        ? 'C’è cibo nelle scorte: chi ha fame deve raggiungere il campo per mangiare. Cuoci la carne quando puoi: mangiarla cruda può causare malattia.'
        : source
          ? 'Interrompi il lavoro e guida chi ha fame alla fonte di cibo indicata sulla mappa. Gli animali vivi devono essere abbattuti prima di poterli mangiare.'
          : 'Non ci sono scorte consegnate o fonti commestibili visibili. Esplora con prudenza e porta cibo al campo.',
      action: 'eat',
      actionLabel: (canNameFood && stores) || source ? 'Prepara pasto' : 'Mostra chi ha fame',
      focus: unitTarget(hungry),
      phrase:
        canNameFood && stores ? ['S_01', 'V_02', 'O_04'] : source ? ['S_01', 'V_02'] : undefined,
      destination:
        source && !(canNameFood && stores)
          ? { type: 'entity', id: source.id, x: source.x, y: source.y }
          : undefined,
    };
  }
  const custodian = getCustodianStatuses(state).find(
    (status) =>
      status.risk !== 'safe' || status.wordIds.some((id) => state.words[id].retention < 30),
  );
  if (custodian && hasBuilding(state, 'campfire'))
    return {
      id: `memory:${custodian.unitId}`,
      priority: 'care',
      title: 'Metti al sicuro una parola',
      text: 'Una parola vive nella memoria di un solo custode. Apri il Falò e affidala a un allievo prima che sia troppo tardi.',
      action: 'teach',
      actionLabel: 'Prepara insegnamento',
      focus: unitTarget(people.find((u) => u.id === custodian.unitId)!),
    };
  const funeral = ['S_01', 'V_08', 'O_02', 'O_06'];
  const corpse = state.entities.find(
    (entity) =>
      entity.kind === 'corpse' &&
      entity.amount > 0 &&
      distance(entity, state.home) <= 100 &&
      explored(state, entity),
  );
  if (
    state.cohesion <= 30 &&
    corpse &&
    funeral.length <= cognitiveSlots(state) &&
    funeral.every((id) => hasWord(state, id))
  ) {
    const grave = state.buildings.find(
      (building) =>
        building.kind === 'grave' &&
        isPlayerBuilding(state, building) &&
        building.hp > 0 &&
        building.completed !== false,
    );
    return {
      id: 'mourning',
      priority: 'care',
      title: 'La tribù ha bisogno di un commiato',
      text: 'I lutti e i corpi insepolti indeboliscono la coesione. Prepara un tumulo con pietra e assegna un addetto per celebrare i funerali.',
      action: 'funeral',
      actionLabel: grave ? 'Prepara sepoltura' : 'Prepara tumulo',
      phrase: funeral,
      destination: grave ? { type: 'building', id: grave.id, x: grave.x, y: grave.y } : undefined,
      focus: { type: 'entity', id: corpse.id, x: corpse.x, y: corpse.y },
    };
  }
  return null;
}
