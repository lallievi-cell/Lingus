import {
  createGame,
  dismissCampfire,
  hasWord,
  issueCommand,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import { allAdultsAnchor } from '../../src/game/tribeControl';
import { getCalendar } from '../../src/game/calendar';
import { isPlayerBuilding } from '../../src/game/runtime';
import type { GameState, MapEntity, MapMode, Target } from '../../src/game/types';

/** Public, coarse group decisions in a chosen valley. No material,
 * experience, weather, age, position or knowledge is injected. This route
 * exercises the new opening; it is not a claim about a complete campaign. */
export function replayPatientOpening(
  seed = 6842,
  delay = 0,
  mapMode: MapMode = 'seed-zero',
  strategy: 'steady' | 'prepared' = 'steady',
) {
  let state: GameState = { ...createGame(seed, 'guided', mapMode), started: true };
  const orders: { at: number; tokens: string[]; target?: Target }[] = [];
  const rejectedOrders: { at: number; tokens: string[]; reason: string }[] = [];
  const councils: { at: number; attention: number; taught: string[] }[] = [];
  const councilSnapshots: { at: number; state: GameState }[] = [];
  const foodRetargets: {
    at: number;
    carriedBefore: number;
    storedBefore: number;
    looseBefore: number;
    carriedAfter: number;
    storedAfter: number;
    looseAfter: number;
  }[] = [];
  const snapshots: { at: number; state: GameState }[] = [];
  let firstFireAt: number | null = null;
  const own = () => state.units.filter((u) => u.hp > 0 && u.factionId === 'player');
  const visible = (entity: MapEntity) =>
    state.sectors.some(
      (sector) =>
        sector.explored &&
        sector.x === Math.floor(entity.x / 100) &&
        sector.y === Math.floor(entity.y / 100),
    );
  const nearest = (kind: MapEntity['kind'], minimum = 0) =>
    state.entities
      .filter((e) => e.kind === kind && e.amount > minimum && visible(e))
      .sort(
        (a, b) =>
          Math.hypot(a.x - state.home.x, a.y - state.home.y) -
          Math.hypot(b.x - state.home.x, b.y - state.home.y),
      )[0];
  const target = (entity: MapEntity): Target => ({
    type: 'entity',
    id: entity.id,
    x: entity.x,
    y: entity.y,
  });
  const stone = nearest('stone')!;
  const tree = state.entities
    .filter((e) => e.kind === 'tree' && visible(e))
    .sort(
      (a, b) => Math.hypot(a.x - stone.x, a.y - stone.y) - Math.hypot(b.x - stone.x, b.y - stone.y),
    )[0];
  const say = (tokens: string[], destination?: Target) => {
    const foodOrder =
      tokens.includes('V_04') &&
      destination?.type === 'entity' &&
      state.entities.some((entity) => entity.id === destination.id && entity.kind === 'berries');
    const foodTotals = () => ({
      carried: own().reduce(
        (sum, unit) => sum + (unit.carry?.resource === 'food' ? unit.carry.amount : 0),
        0,
      ),
      stored: state.resources.food,
      loose: state.entities
        .filter((entity) => entity.kind === 'ground' && entity.resource === 'food')
        .reduce((sum, entity) => sum + entity.amount, 0),
    });
    const before = foodOrder ? foodTotals() : undefined;
    const commands = state.stats.commands;
    state = issueCommand(state, tokens, destination, undefined, allAdultsAnchor(state));
    if (before) {
      const after = foodTotals();
      foodRetargets.push({
        at: state.time,
        carriedBefore: before.carried,
        storedBefore: before.stored,
        looseBefore: before.loose,
        carriedAfter: after.carried,
        storedAfter: after.stored,
        looseAfter: after.loose,
      });
    }
    if (state.stats.commands > commands)
      orders.push({ at: state.time, tokens: [...tokens], target: destination });
    else
      rejectedOrders.push({
        at: state.time,
        tokens: [...tokens],
        reason: state.logs[0]?.text ?? '',
      });
  };
  const guard = () => {
    if (!hasWord(state, 'S_02') || !hasWord(state, 'V_05') || !hasWord(state, 'O_05')) return;
    const adult = own()
      .filter((u) => u.age >= 4 && !u.carry && u.action !== 'building')
      .sort(
        (a, b) =>
          Math.hypot(a.x - state.home.x, a.y - state.home.y) -
          Math.hypot(b.x - state.home.x, b.y - state.home.y),
      )[0];
    if (!adult) return;
    const tokens = ['S_02', 'V_05', 'O_05'];
    const previous = state.stats.commands;
    state = issueCommand(state, tokens, { type: 'point', ...state.home }, adult.id);
    if (state.stats.commands > previous) orders.push({ at: state.time, tokens });
    else rejectedOrders.push({ at: state.time, tokens, reason: state.logs[0]?.text ?? '' });
  };
  const foods = () =>
    state.entities.filter((e) => e.kind === 'berries' && e.amount > 0 && visible(e));
  let firstForageId: string | undefined;
  let secondForageIssued = false;
  const groupDistance = (entity: MapEntity) => {
    const distances = own()
      .filter((u) => u.age >= 4 && u.action !== 'building')
      .map((u) => Math.hypot(entity.x - u.x, entity.y - u.y))
      .sort((a, b) => a - b);
    return distances[Math.floor(distances.length / 2)] ?? Infinity;
  };
  const exploredFood = (second = false) =>
    foods()
      .filter(
        (e) =>
          e.amount > 8 &&
          Math.hypot(e.x - state.home.x, e.y - state.home.y) > 30 &&
          (!second || e.id !== firstForageId),
      )
      .sort(
        (a, b) =>
          (second ? Math.hypot(a.x - state.home.x, a.y - state.home.y) : groupDistance(a)) -
          (second ? Math.hypot(b.x - state.home.x, b.y - state.home.y) : groupDistance(b)),
      )[0];
  const nearbyForage = (minimum = 0) =>
    foods()
      .filter(
        (e) =>
          e.amount > minimum &&
          Math.hypot(e.x - state.home.x, e.y - state.home.y) > 30 &&
          own().some((u) => u.age >= 4 && Math.hypot(u.x - e.x, u.y - e.y) <= 30),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - state.home.x, a.y - state.home.y) -
          Math.hypot(b.x - state.home.x, b.y - state.home.y),
      )[0];

  for (let step = 0; step <= 2520 && !state.gameOver; step++) {
    if (step % 40 === 0) {
      for (const spark of [...state.sparks]) state = solveSpark(state, spark.id, spark.recipe);
      if (state.campfirePending) {
        councilSnapshots.push({ at: state.time, state });
        const council = { at: state.time, attention: state.attention, taught: [] as string[] };
        for (let lesson = 0; lesson < 3; lesson++) {
          const word = ['O_05', 'V_04', 'V_06', 'M_02', 'V_05', 'S_02', 'O_01', 'O_02', 'O_03']
            .filter(
              (id) =>
                hasWord(state, id) &&
                !council.taught.includes(id) &&
                own().some((u) => u.age < 14 && !state.words[id].custodians.includes(u.id)),
            )
            .sort((a, b) => state.words[a].custodians.length - state.words[b].custodians.length)[0];
          if (!word || state.attention < 10) break;
          const before = state.stats.taught;
          state = teachWord(state, word);
          if (state.stats.taught === before) break;
          council.taught.push(word);
        }
        councils.push(council);
        state = dismissCampfire(state);
      }
      const time = state.time;
      if (time === 0) say(['S_01', 'V_03'], target(tree));
      if (time === 30) say(['S_01', 'V_03'], target(stone));
      if (time === 100) say(['S_01', 'V_01'], { type: 'point', ...state.home });
      if (time === 170) say(['S_01', 'V_02'], target(nearest('berries')!));
      if (time === 180) {
        const wood = state.entities.find(
          (e) =>
            e.kind === 'ground' &&
            e.resource === 'wood' &&
            e.amount > 0 &&
            Math.hypot(e.x - tree.x, e.y - tree.y) < 2,
        );
        if (wood) say(['S_01', 'V_04', 'O_03'], target(wood));
      }
      if (time === 200) say(['S_01', 'V_06', 'O_02']);
      if (strategy === 'prepared') {
        if (time === 260) {
          const berries = foods()
            .filter((e) => Math.hypot(e.x - state.home.x, e.y - state.home.y) < 30)
            .sort((a, b) => b.amount - a.amount)[0];
          if (berries) say(['S_01', 'V_04'], target(berries));
        }
        if (time === 290 + delay) {
          say(['S_01', 'V_01'], { type: 'point', x: state.home.x, y: state.home.y + 80 });
          if (hasWord(state, 'V_05'))
            say(['S_01', 'V_05', 'O_02'], {
              type: 'point',
              x: state.home.x + 5,
              y: state.home.y + 5,
            });
          guard();
        }
        const secondTripReady =
          time >= 360 + delay &&
          time < 450 &&
          !secondForageIssued &&
          firstForageId &&
          own().every((unit) => !unit.carry);
        if (time === 310 + delay || secondTripReady) {
          const berries = exploredFood(!!secondTripReady);
          if (berries) {
            if (time === 310 + delay) firstForageId = berries.id;
            say(['S_01', 'V_04'], target(berries));
            if (secondTripReady) secondForageIssued = true;
          }
        }
      } else {
        if (time === 270 || time === 280) {
          const berries = foods()
            .filter((e) => Math.hypot(e.x - state.home.x, e.y - state.home.y) < 30)
            .sort((a, b) => b.amount - a.amount)[0];
          if (berries) say(['S_01', time === 270 ? 'V_02' : 'V_04'], target(berries));
        }
        if (time === 290) guard();
        if (time === 300) {
          const source = nearest('tree', 12);
          if (source) say(['S_01', 'V_04', 'O_03'], target(source));
        }
        if (time === 330 + delay) {
          say(['S_01', 'V_01'], { type: 'point', x: state.home.x, y: state.home.y + 80 });
          if (hasWord(state, 'V_05'))
            say(['S_01', 'V_05', 'O_02'], {
              type: 'point',
              x: state.home.x + 5,
              y: state.home.y + 5,
            });
        }
        if (time === 360 + delay || time === 380 + delay) {
          const berries = nearbyForage(time === 380 + delay ? 8 : 0);
          if (berries) say(['S_01', time === 360 + delay ? 'V_02' : 'V_04'], target(berries));
        }
      }
      if (time === 460) say(['S_01', 'V_01'], { type: 'point', ...state.home });
      if (
        state.buildings.some(
          (b) => isPlayerBuilding(state, b) && b.kind === 'campfire' && !b.active && b.hp > 0,
        )
      )
        guard();
    }
    if (
      firstFireAt === null &&
      state.buildings.some(
        (b) => isPlayerBuilding(state, b) && b.kind === 'campfire' && b.active && b.hp > 0,
      )
    )
      firstFireAt = state.time;
    if (
      [300, 450, 550, 600, 630].includes(state.time) ||
      (state.time >= 250 && state.time <= 460 && state.time % 10 === 0)
    )
      snapshots.push({ at: state.time, state });
    if (state.time >= 630) break;
    state = tick(state, 0.25);
  }
  return {
    state,
    firstFireAt,
    orders,
    rejectedOrders,
    councils,
    councilSnapshots,
    foodRetargets,
    snapshots,
    calendar: getCalendar(state),
  };
}
