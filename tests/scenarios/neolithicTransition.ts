import {
  BUILDING_SPECS,
  emptyInventory,
  INNATE_WORDS,
  RESOURCE_SPECS,
} from '../../src/game/content';
import {
  createGame,
  dismissCampfire,
  hasWord,
  issueCommand,
  prepareCampfireCouncil,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import { villageHousing } from '../../src/game/growthReadiness';
import { resourceSpoilage } from '../../src/game/math';
import type { BuildingKind, Target, Unit } from '../../src/game/types';

/** Deliberately prepared Neolithic settlement. This is not a seven-person replay.
 * All subsequent changes use public actions and real simulation ticks.
 */
export function preparedNeolithicSettlement(seed = 6842) {
  const state = createGame(seed, 'guided');
  // This prepared eight-season study retains the ordinary legacy calendar.
  delete state.openingBalanceVersion;
  delete state.openingCouncilsCompleted;
  const template = state.units[0];
  Object.assign(state, {
    started: true,
    time: 0,
    tier: 3,
    units: [],
    buildings: [],
    cities: [],
    factions: [],
    caravans: [],
    dogmas: [],
    traditions: [],
    laws: [],
    sparks: [],
  });
  const words = [
    'S_01',
    'V_01',
    'V_02',
    'V_03',
    'S_02',
    'O_01',
    'V_04',
    'O_02',
    'O_03',
    'O_04',
    'V_05',
    'M_02',
    'O_05',
    'V_07',
    'V_08',
    'O_06',
    'V_09',
    'V_10',
    'C_02',
    'M_04',
    'O_08',
    'O_10',
    'O_07',
    'C_03',
    'V_06',
    'M_01',
    'S_03',
  ];
  state.units = Array.from({ length: 35 }, (_, i) => ({
    ...structuredClone(template),
    id: `founder-${i}`,
    name: `Abitante ${i + 1}`,
    age: i < 24 ? 4 + (i % 3) : 4 + Math.floor(((i - 24) * 6) / 10),
    sex: i % 2 ? ('F' as const) : ('M' as const),
    x: state.home.x + ((i % 5) - 2) * 1.2,
    y: state.home.y + (Math.floor(i / 5) - 3) * 1.2,
    hp: 100,
    hunger: 10,
    temp: 100,
    strength: 5,
    intelligence: 8,
    caste: 'citizen' as const,
    factionId: 'player',
    action: 'idle',
    progress: 0,
    knows: [...words],
    isolation: 0,
    eventMemory: [],
    tension: {},
    cooldowns: {},
    lastEventAt: {},
    parentIds: undefined,
    cityId: undefined,
    jobBuildingId: undefined,
    suspendedJob: undefined,
    command: undefined,
    isKing: false,
  }));
  state.words = Object.fromEntries(
    words.map((id) => [id, { retention: 100, custodians: state.units.map((u) => u.id), uses: 0 }]),
  );
  state.resources = {
    ...emptyInventory(),
    food: 400,
    meat: 140,
    cooked: 100,
    wood: 700,
    stone: 600,
    seed: 100,
    pelt: 50,
    tool: 20,
    ingot: 20,
    coin: 1000,
  };
  const add = (kind: BuildingKind) => {
    const n = state.buildings.length;
    const b = {
      id: `settlement-${kind}-${n}`,
      kind,
      x: state.home.x + Math.cos(n) * 3,
      y: state.home.y + Math.sin(n) * 3,
      hp: BUILDING_SPECS[kind].maxHp,
      active: true,
      completed: true,
      workerIds: [] as string[],
      ...(kind === 'pen' ? { livestock: 1 } : {}),
    };
    state.buildings.push(b);
    return b;
  };
  for (let i = 0; i < 8; i++) add('house');
  for (let i = 0; i < 5; i++) add('storage');
  for (let i = 0; i < 4; i++) add('depot');
  add('palisade');
  const fire = add('campfire');
  const grave = add('grave');
  const jobs = [];
  for (let i = 0; i < 8; i++) jobs.push(add('pen'));
  for (let i = 0; i < 3; i++) jobs.push(add('farm'));
  let index = 0;
  for (const building of [fire, grave, ...jobs]) {
    const count = building.kind === 'campfire' ? 1 : BUILDING_SPECS[building.kind].workers;
    for (let slot = 0; slot < count; slot++) {
      const unit = state.units[index++];
      const tokens = [
        'S_02',
        ...(building.kind === 'campfire' ? ['V_05', 'O_05'] : BUILDING_SPECS[building.kind].recipe),
      ];
      Object.assign(unit, {
        x: building.x,
        y: building.y,
        jobBuildingId: building.id,
        targetId: building.id,
        action: building.kind === 'campfire' ? 'guarding' : 'working',
        command: tokens,
      });
      building.workerIds.push(unit.id);
    }
  }
  // Existing explored surroundings; no new nodes or animals are injected.
  for (const sector of state.sectors)
    if (Math.abs(sector.x - 2) <= 1 && Math.abs(sector.y - 2) <= 1) sector.explored = true;
  return state;
}

export function replayNeolithicTransition(seed = 6842, until = 3600) {
  let state = preparedNeolithicSettlement(seed);
  const initial = {
    population: state.units.length,
    resources: { ...state.resources },
    buildings: state.buildings.map((b) => b.kind),
    words: Object.keys(state.words),
  };
  const actions: { at: number; tokens: string[]; accepted: boolean; reason?: string }[] = [];
  const discoveries: { at: number; id: string; event: string; recipe: string[] }[] = [];
  const snapshots: {
    at: number;
    population: number;
    housing: number;
    births: number;
    deaths: number;
    cohesion: number;
    food: number;
    wood: number;
    stone: number;
    words: number;
    archive: number;
  }[] = [];
  const own = () =>
    state.units.filter((u) => u.hp > 0 && (!u.factionId || u.factionId === 'player'));
  const adults = () => own().filter((u) => u.age >= 4);
  const local = (p: { x: number; y: number }) => Math.hypot(p.x - state.home.x, p.y - state.home.y);
  const safePath = (point: { x: number; y: number }) =>
    !state.entities.some((predator) => {
      if (!['alpha', 'wolf'].includes(predator.kind) || predator.hp <= 0) return false;
      const dx = point.x - state.home.x,
        dy = point.y - state.home.y;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((predator.x - state.home.x) * dx + (predator.y - state.home.y) * dy) /
            Math.max(1, dx * dx + dy * dy),
        ),
      );
      return (
        Math.hypot(predator.x - state.home.x - t * dx, predator.y - state.home.y - t * dy) < 32
      );
    });
  const free = () =>
    adults()
      .filter(
        (u) =>
          !u.jobBuildingId &&
          !u.suspendedJob &&
          !u.carry &&
          ['idle', 'sleeping', 'resting'].includes(u.action) &&
          u.hunger < 70 &&
          u.temp > 30,
      )
      .sort((a, b) => a.age - b.age);
  const say = (tokens: string[], target: Target | undefined, unit: Unit) => {
    if (state.voice < 1 || !tokens.every((id) => hasWord(state, id))) return false;
    const before = state.stats.commands;
    state = issueCommand(state, tokens, target, unit.id);
    const accepted = state.stats.commands > before;
    actions.push({
      at: state.time,
      tokens,
      accepted,
      reason: accepted ? undefined : state.logs[0]?.text,
    });
    return accepted;
  };
  const build = (kind: BuildingKind, unit: Unit) => {
    if (
      !Object.entries(BUILDING_SPECS[kind].cost).every(
        ([r, n]) => state.resources[r as keyof typeof state.resources] >= n,
      )
    )
      return false;
    return say(
      ['S_02', ...BUILDING_SPECS[kind].recipe],
      {
        type: 'point',
        x: state.home.x + 3 * Math.cos(state.buildings.length),
        y: state.home.y + 3 * Math.sin(state.buildings.length),
      },
      unit,
    );
  };
  const nutrition = () =>
    state.resources.food * 25 + state.resources.meat * 40 + state.resources.cooked * 60;
  const jobs = () =>
    state.buildings.filter((b) => !b.cityId && b.hp > 0 && b.active && b.completed !== false);
  let nextDecision = 0;
  const snapshot = () =>
    snapshots.push({
      at: state.time,
      population: own().length,
      housing: villageHousing(state),
      births: state.stats.births,
      deaths: state.stats.deaths,
      cohesion: state.cohesion,
      food: nutrition(),
      wood: state.resources.wood,
      stone: state.resources.stone,
      words: Object.keys(state.words).filter((id) => hasWord(state, id)).length,
      archive: jobs().find((b) => b.kind === 'archive')?.lastEfficiency ?? 0,
    });
  snapshot();
  while (state.time < until && !state.gameOver && !state.urbanized) {
    for (const spark of [...state.sparks]) {
      if (spark.wordId === 'S_07') continue;
      discoveries.push({
        at: state.time,
        id: spark.wordId,
        event: spark.eventLabel,
        recipe: spark.recipe,
      });
      state = solveSpark(state, spark.id, spark.recipe);
    }
    if (state.campfirePending) {
      snapshot();
      while (state.resources.wood > 100 && state.attention < 100) {
        const prior = state.attention;
        state = prepareCampfireCouncil(state);
        if (state.attention === prior) break;
      }
      while (state.attention >= 10) {
        const id = Object.keys(state.words)
          .filter(
            (id) =>
              !INNATE_WORDS.includes(id) &&
              hasWord(state, id) &&
              own().some((u) => u.age < 14 && !state.words[id].custodians.includes(u.id)),
          )
          .sort((a, b) => {
            const young = (id: string) =>
              own().filter(
                (u) =>
                  (u.bornAt ?? 0) > 0 && u.age < 10 && state.words[id].custodians.includes(u.id),
              ).length;
            const critical = [
              'O_09',
              'O_10',
              'V_05',
              'V_04',
              'O_05',
              'V_07',
              'V_09',
              'V_10',
              'O_01',
              'O_02',
              'O_03',
              'V_08',
              'M_02',
              'O_08',
              'C_02',
              'O_06',
              'O_07',
              'C_03',
            ];
            const priority = (id: string) =>
              young(id) === 0
                ? 0
                : critical.includes(id) && young(id) < 2
                  ? 1
                  : state.words[id].retention < 50
                    ? 2
                    : young(id) < 2
                      ? 3
                      : 4;
            return (
              priority(a) - priority(b) ||
              young(a) - young(b) ||
              state.words[a].retention - state.words[b].retention
            );
          })[0];
        if (!id) break;
        const prior = state.attention;
        state = teachWord(state, id);
        if (state.attention === prior) break;
      }
      state = dismissCampfire(state);
    }
    if (state.time >= nextDecision) {
      nextDecision += 5;
      const phase = state.time % 90;
      const daytime = phase < 55 && !state.disasters.blizzard;
      const person = free()[0];
      const count = (kind: BuildingKind) =>
        state.buildings.filter((b) => b.kind === kind && b.hp > 0 && b.completed !== false).length;
      if (state.voice >= 1 && person) {
        const archive = jobs().find((b) => b.kind === 'archive');
        const needs = jobs()
          .filter((b) => BUILDING_SPECS[b.kind].workers > 0)
          .find((b) => {
            if (b.kind === 'campfire')
              return !adults().some(
                (u) => u.jobBuildingId === b.id || u.suspendedJob?.buildingId === b.id,
              );
            return (
              adults().filter(
                (u) => u.jobBuildingId === b.id || u.suspendedJob?.buildingId === b.id,
              ).length < BUILDING_SPECS[b.kind].workers
            );
          });
        const scholar = free().find((u) => u.intelligence >= 7);
        const closedPen = state.buildings.find(
          (b) => b.kind === 'pen' && !b.active && b.hp > 0 && b.completed !== false,
        );
        const vegetableHaulers = adults().filter(
          (u) => u.command?.includes('V_04') && u.command.includes('O_04'),
        ).length;
        const berries = state.entities
          .filter((e) => e.kind === 'berries' && e.amount > 5 && local(e) < 110 && safePath(e))
          .sort((a, b) => local(a) - local(b))[0];
        const hauling = (token: string) =>
          adults().filter(
            (u) =>
              u.command?.includes('V_04') &&
              u.command.includes(token) &&
              ['gathering', 'returning'].includes(u.action),
          ).length;
        const collectMaterial = (token: 'O_03' | 'O_02') => {
          const kind = token === 'O_03' ? 'tree' : 'stone';
          const node = state.entities
            .filter((e) => e.kind === kind && e.amount > 0 && local(e) < 110 && safePath(e))
            .sort((a, b) => local(a) - local(b))[0];
          return node
            ? say(
                ['S_02', 'V_04', token],
                { type: 'entity', id: node.id, x: node.x, y: node.y },
                person,
              )
            : false;
        };
        const season = Math.floor(state.time / 90) % 4;
        let feedReserve = (BUILDING_SPECS.pen.upkeep.food ?? 0) * count('pen');
        for (let future = season; future < 3; future++)
          feedReserve /=
            1 -
            resourceSpoilage(
              RESOURCE_SPECS.food.spoil,
              future === 1,
              count('storage') > 0,
              state.resources.pottery > 0,
            );
        const seedReserve = Math.max(12, count('farm') * 2 + 5);

        const essential = jobs().find(
          (b) =>
            ['campfire', 'grave'].includes(b.kind) &&
            !adults().some((u) => u.jobBuildingId === b.id || u.suspendedJob?.buildingId === b.id),
        );
        if (essential)
          say(
            [
              'S_02',
              ...(essential.kind === 'campfire' ? ['V_05', 'O_05'] : BUILDING_SPECS.grave.recipe),
            ],
            { type: 'building', id: essential.id, x: essential.x, y: essential.y },
            person,
          );
        else if (
          daytime &&
          state.resources.pottery < 1 &&
          !adults().some((u) => u.action === 'cooking')
        )
          say(['S_02', 'V_07', 'O_02', 'O_05'], undefined, person);
        else if (daytime && needs)
          say(
            [
              'S_02',
              ...(needs.kind === 'campfire' ? ['V_05', 'O_05'] : BUILDING_SPECS[needs.kind].recipe),
            ],
            { type: 'building', id: needs.id, x: needs.x, y: needs.y },
            person,
          );
        else if (daytime && state.resources.wood < 140 && hauling('O_03') < 2)
          collectMaterial('O_03');
        else if (daytime && state.resources.stone < 70 && hauling('O_02') < 2)
          collectMaterial('O_02');
        else if (closedPen && state.resources.food >= 5)
          say(
            ['S_02', 'V_10', 'O_04', 'O_01'],
            { type: 'building', id: closedPen.id, x: closedPen.x, y: closedPen.y },
            person,
          );
        else if (
          daytime &&
          Math.floor(state.time / 90) % 4 !== 3 &&
          (state.resources.food < feedReserve || state.resources.seed < seedReserve) &&
          vegetableHaulers < 3 &&
          berries
        )
          say(
            ['S_02', 'V_04', 'O_04'],
            { type: 'entity', id: berries.id, x: berries.x, y: berries.y },
            person,
          );
        else if (
          hasWord(state, 'O_09') &&
          !count('archive') &&
          !adults().some((u) => u.action === 'building')
        )
          build('archive', person);
        else if (
          daytime &&
          archive &&
          scholar &&
          adults().filter(
            (u) => u.jobBuildingId === archive.id || u.suspendedJob?.buildingId === archive.id,
          ).length < 4
        )
          say(
            ['S_02', 'V_05', 'O_09'],
            { type: 'building', id: archive.id, x: archive.x, y: archive.y },
            scholar,
          );
        else if (
          daytime &&
          !hasWord(state, 'O_13') &&
          hasWord(state, 'V_06') &&
          !adults().some((u) => u.action === 'crafting')
        )
          say(['S_02', 'V_06', 'O_02'], undefined, person);
        else if (
          hasWord(state, 'O_13') &&
          !count('workshop') &&
          !adults().some((u) => u.action === 'building')
        )
          build('workshop', person);
        else if (
          villageHousing(state) < own().length * 2.5 &&
          state.resources.stone >= 20 &&
          state.resources.wood >= 110 &&
          !adults().some((u) => u.action === 'building')
        )
          build('house', person);
        else if (
          count('pen') < Math.ceil(own().length / 6) &&
          state.resources.wood >= 110 &&
          !adults().some((u) => u.action === 'building')
        )
          build('pen', person);
        else if (
          count('farm') < Math.ceil(count('pen') / 3) &&
          state.resources.seed >= 5 &&
          !adults().some((u) => u.action === 'building')
        )
          build('farm', person);
        else if (daytime) {
          const emptyPen = jobs().find((b) => b.kind === 'pen' && !(b.livestock ?? 0));
          const deer = state.entities
            .filter((e) => e.kind === 'deer' && e.hp > 0 && local(e) < 110 && safePath(e))
            .sort((a, b) => local(a) - local(b))[0];
          if (emptyPen && deer)
            say(
              ['S_02', 'V_10', 'O_04'],
              { type: 'entity', id: deer.id, x: deer.x, y: deer.y },
              person,
            );
          else if (state.resources.wood < 50 || state.resources.stone < 30) {
            const token = state.resources.wood < 50 ? 'O_03' : 'O_02';
            const kind = token === 'O_03' ? 'tree' : 'stone';
            const node = state.entities
              .filter((e) => e.kind === kind && e.amount > 0 && local(e) < 100 && safePath(e))
              .sort((a, b) => local(a) - local(b))[0];
            if (node)
              say(
                ['S_02', 'V_04', token],
                { type: 'entity', id: node.id, x: node.x, y: node.y },
                person,
              );
          }
        }
      }
    }
    const prior = state.time;
    state = tick(state, Math.min(5, until - state.time));
    if (state.time === prior && !state.campfirePending) break;
  }
  snapshot();
  return { state, initial, actions, discoveries, snapshots };
}
