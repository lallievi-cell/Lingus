import { BUILDING_SPECS, INNATE_WORDS } from '../../src/game/content';
import {
  compileSentence,
  dismissCampfire,
  hasWord,
  inscribeDogma,
  issueCommand,
  prepareCampfireCouncil,
  prepareBriefLesson,
  rehearseWord,
  solveSpark,
  teachWord,
  tick,
} from '../../src/game/engine';
import {
  fertilityBlockers,
  getGrowthReadiness,
  villageHousing,
} from '../../src/game/growthReadiness';
import type { MapEntity, Target, Unit } from '../../src/game/types';
import { replayCampaignOpening } from './campaignOpening';
import { replayPatientOpening } from './patientOpening';
import { getCalendar } from '../../src/game/calendar';

export interface CampaignAction {
  at: number;
  tokens: string[];
  target?: Target;
  executorId?: string;
  selectionCenter?: Target;
  accepted: boolean;
  reason?: string;
}
export interface CampaignSnapshot {
  at: number;
  population: number;
  births: number;
  naturalDeaths: number;
  otherDeaths: number;
  tier: number;
  housing: number;
  cohesion: number;
  food: number;
  wood: number;
  stone: number;
  seeds: number;
  aliveWords: number;
  stableWords: number;
  buildings: string[];
  readyParents: number;
  phase: string;
}
export interface FertilityReport {
  at: number;
  readiness: ReturnType<typeof getGrowthReadiness>;
  people: {
    id: string;
    name: string;
    sex: Unit['sex'];
    age: number;
    hunger: number;
    homeDistance: number;
    blockers: string[];
  }[];
}

/** A bounded Guided replay from the original seven people and four innate words.
 * All changes use public commands, real sparks, paid lessons and ordinary ticks.
 * Reading a resource or a unit never changes it; only explored nodes are targeted.
 */
export function replayContinuousCampaign(
  seed = 6842,
  until = 1800,
  profile: 'legacy' | 'patient' = 'legacy',
) {
  const opening =
    profile === 'patient'
      ? replayPatientOpening(seed, 0, 'seed-zero', 'prepared', 450)
      : replayCampaignOpening(seed, 270);
  let state = opening.state;
  const actions: CampaignAction[] = opening.orders.map((order) => ({ ...order, accepted: true }));
  const discoveries =
    'discoveries' in opening ? [...opening.discoveries] : ([] as { at: number; wordId: string }[]);
  const snapshots: CampaignSnapshot[] = [];
  const fertilityReports: FertilityReport[] = [];
  const decisionReports: { at: number; resources: object; workers: object[] }[] = [];
  const fedParents = new Set<string>();
  let maxPopulation = Math.max(
    7,
    opening.state.units.filter((u) => u.hp > 0 && u.factionId === 'player').length,
  );
  let nextDecision = state.time;
  let nextSnapshot = getCalendar(state).seasonEnd;
  let phase = 'continuazione';
  const people = () => state.units.filter((u) => !u.factionId || u.factionId === 'player');
  const own = () => people().filter((u) => u.hp > 0);
  const adults = () => own().filter((u) => u.age >= 4);
  const homeDistance = (p: { x: number; y: number }) =>
    Math.hypot(p.x - state.home.x, p.y - state.home.y);
  const safePath = (point: { x: number; y: number }) =>
    profile !== 'patient' ||
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
  const visible = (p: { x: number; y: number }) =>
    state.tier >= 4 ||
    state.sectors.some(
      (s) => s.explored && s.x === Math.floor(p.x / 100) && s.y === Math.floor(p.y / 100),
    );
  const targetFor = (e: MapEntity): Target => ({ type: 'entity', id: e.id, x: e.x, y: e.y });
  const nearest = (kind: MapEntity['kind'], minimum = 0, alive = false) =>
    state.entities
      .filter(
        (e) =>
          e.kind === kind &&
          e.amount > minimum &&
          visible(e) &&
          safePath(e) &&
          (!alive || e.hp > 0),
      )
      .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
  const villageBuildings = () =>
    state.buildings.filter((b) => !b.cityId && b.hp > 0 && b.completed !== false);
  const hasBuilding = (kind: string) => villageBuildings().some((b) => b.kind === kind);
  const foodNutrition = () =>
    state.resources.food * 25 +
    state.resources.meat * 40 +
    state.resources.cooked * 60 +
    state.entities
      .filter(
        (e) =>
          e.kind === 'ground' &&
          ['food', 'meat', 'cooked'].includes(e.resource ?? '') &&
          homeDistance(e) < 15,
      )
      .reduce(
        (sum, e) => sum + e.amount * (e.resource === 'food' ? 25 : e.resource === 'meat' ? 40 : 60),
        0,
      );
  const assigned = (unit: Unit, buildingId: string) =>
    unit.jobBuildingId === buildingId || unit.suspendedJob?.buildingId === buildingId;
  const idle = (u: Unit) =>
    !u.isKing &&
    !u.jobBuildingId &&
    !u.suspendedJob &&
    !u.carry &&
    !(u.action === 'guarding' && u.command?.includes('O_05')) &&
    ['idle', 'sleeping', 'resting', 'guarding'].includes(u.action);
  const say = (tokens: string[], target?: Target, executorId?: string) => {
    if (state.voice < 1 || !tokens.every((id) => hasWord(state, id))) return false;
    if (
      tokens.includes('V_04') &&
      !tokens.includes('M_02') &&
      hasWord(state, 'M_02') &&
      compileSentence(state, [...tokens, 'M_02'], target).valid
    )
      tokens = [...tokens, 'M_02'];
    if (!compileSentence(state, tokens, target).valid) return false;
    const before = state.stats.commands;
    const anchor: Target = { type: 'point', ...state.home };
    state = issueCommand(state, tokens, target, executorId, anchor);
    const accepted = state.stats.commands > before;
    actions.push({
      at: state.time,
      tokens: [...tokens],
      target,
      executorId,
      selectionCenter: anchor,
      accepted,
      reason: accepted ? undefined : state.logs[0]?.text,
    });
    return accepted;
  };
  const record = () =>
    snapshots.push({
      at: state.time,
      population: own().length,
      births: state.stats.births,
      naturalDeaths: people().filter((u) => u.hp <= 0 && u.lastDamageCause === 'oldAge').length,
      otherDeaths: people().filter((u) => u.hp <= 0 && u.lastDamageCause !== 'oldAge').length,
      tier: state.tier,
      housing: villageHousing(state),
      cohesion: state.cohesion,
      food: foodNutrition(),
      wood: state.resources.wood,
      stone: state.resources.stone,
      seeds: state.resources.seed,
      aliveWords: Object.keys(state.words).filter((id) => hasWord(state, id)).length,
      stableWords: Object.keys(state.words).filter((id) => state.words[id].retention >= 50).length,
      buildings: villageBuildings().map((b) => b.kind),
      readyParents: own().filter((u) => fertilityBlockers(state, u, { ageOffset: 1 }).length === 0)
        .length,
      phase,
    });
  record();
  while (state.time < until && !state.gameOver && !state.victory) {
    for (const spark of state.sparks.filter((entry) => !entry.deferred)) {
      // Naming a king immediately installs a monarchy. A tiny village does not
      // need to crown an elderly founder and incur a succession crisis.
      if (spark.wordId === 'S_07' && own().length < 35) continue;
      const known = hasWord(state, spark.wordId);
      state = solveSpark(state, spark.id, spark.recipe);
      if (!known && hasWord(state, spark.wordId))
        discoveries.push({ at: state.time, wordId: spark.wordId });
    }
    if (
      hasBuilding('menhir') &&
      !state.dogmas.some((d) => d.targetId === 'S_04' && d.vectorId === 'M_04') &&
      ['S_04', 'M_03', 'M_04'].every((id) => hasWord(state, id))
    )
      state = inscribeDogma(state, 'S_04', 'M_04');
    if (profile === 'patient' && !state.campfirePending && state.resources.wood >= 10) {
      const fragile = ['V_08', 'O_05', 'V_04', 'S_02', 'O_01'].find(
        (id) =>
          hasWord(state, id) &&
          state.words[id].custodians.length === 1 &&
          own().some((u) => state.words[id].custodians.includes(u.id) && u.age >= 12),
      );
      if (fragile) {
        if (state.attention < 10) state = prepareBriefLesson(state);
        state = teachWord(state, fragile);
      }
    }
    if (state.campfirePending) {
      while (state.resources.wood > (profile === 'patient' ? 32 : 6) && state.attention < 100) {
        const before = state.resources.wood;
        state = prepareCampfireCouncil(state);
        if (state.resources.wood === before) break;
      }
      while (state.attention >= 10) {
        const priority = (id: string) =>
          state.words[id].custodians.length === 1 &&
          own().some((u) => state.words[id].custodians.includes(u.id) && u.age >= 12)
            ? -1000
            : id === 'O_05' && state.words[id].retention < 24
              ? -100
              : state.words[id].retention >= 70
                ? 1000
                : state.words[id].retention >= 30
                  ? -state.words[id].retention
                  : 100 - state.words[id].retention;
        const word = Object.keys(state.words)
          .filter(
            (id) =>
              !INNATE_WORDS.includes(id) &&
              hasWord(state, id) &&
              own().some(
                (u) =>
                  u.age < 14 && u.caste !== 'slave' && !state.words[id].custodians.includes(u.id),
              ),
          )
          .sort((a, b) => priority(a) - priority(b))[0];
        if (!word) break;
        const before = state.stats.taught;
        state = teachWord(state, word);
        if (state.stats.taught === before) break;
      }
      while (state.attention >= 10) {
        const word = Object.keys(state.words)
          .filter(
            (id) =>
              !INNATE_WORDS.includes(id) && hasWord(state, id) && state.words[id].retention < 80,
          )
          .sort((a, b) => state.words[a].retention - state.words[b].retention)
          .find((id) => {
            const next = rehearseWord(state, id);
            if (next !== state) {
              state = next;
              return true;
            }
            return false;
          });
        if (!word) break;
      }
      state = dismissCampfire(state);
    }
    maxPopulation = Math.max(maxPopulation, own().length);
    if (state.time >= nextSnapshot) {
      record();
      nextSnapshot = getCalendar(state).seasonEnd;
    }
    if (state.time >= nextDecision) {
      nextDecision += 5;
      if (profile === 'patient' && state.time < 450)
        decisionReports.push({
          at: state.time,
          resources: { ...state.resources },
          workers: adults().map((u) => ({
            id: u.id,
            hunger: u.hunger,
            action: u.action,
            command: u.command,
            carry: u.carry,
            position: [u.x, u.y],
            job: u.jobBuildingId,
          })),
        });
      const calendar = getCalendar(state);
      const day = calendar.canonicalPhase < 55 && !state.disasters.blizzard;
      const season = calendar.season;
      const ownedPens = villageBuildings().filter((b) => b.kind === 'pen');
      const pens = ownedPens.filter((b) => b.active);
      const herders = adults().filter((u) => pens.some((b) => assigned(u, b.id)));
      const neededHerders = Math.min(
        pens.length * 2,
        Math.max(1, Math.ceil(own().length / 5) - (foodNutrition() > own().length * 140 ? 1 : 0)),
      );
      const needsPen =
        (profile === 'patient' ? ownedPens.length : pens.length) <
        Math.ceil(own().length / (profile === 'patient' ? 10 : 7));
      const corpses = state.entities.some(
        (e) => e.kind === 'corpse' && e.amount > 0 && homeDistance(e) <= 100,
      );
      const gravedigger =
        (profile === 'patient' || own().length < 7) && !corpses
          ? adults().find((u) =>
              villageBuildings().some((b) => b.kind === 'grave' && assigned(u, b.id)),
            )
          : undefined;
      const excessHerder =
        herders.length > neededHerders
          ? herders.find((u) => u.hunger < 70 && u.temp > 30)
          : undefined;
      const available = adults()
        .filter(idle)
        .filter((u) => u.hunger < 70 && u.temp > 30)
        .sort((a, b) => a.age - b.age || a.hunger - b.hunger);
      // Reassign surplus haulers through public individual orders instead of
      // waiting forever for a repeating delivery to become idle.
      const surplusHauler = adults().find(
        (u) =>
          !u.carry &&
          !u.jobBuildingId &&
          !u.suspendedJob &&
          u.hunger < 70 &&
          u.command?.includes('V_04') &&
          ((u.command.includes('O_03') && state.resources.wood >= 20) ||
            (u.command.includes('O_02') &&
              state.resources.stone >=
                (profile === 'patient' && corpses && !hasBuilding('grave')
                  ? 31
                  : profile === 'patient'
                    ? 23
                    : 35)) ||
            (u.command.includes('O_04') && foodNutrition() >= own().length * 90) ||
            (!hasBuilding('hut') && state.resources.pelt >= 5 && state.resources.wood >= 10) ||
            (villageHousing(state) < own().length * 3 &&
              !(corpses && !hasBuilding('grave')) &&
              state.resources.stone >= 20 &&
              state.resources.wood >= 10)),
      );
      const inactiveHerder =
        profile === 'patient'
          ? adults().find(
              (u) =>
                !u.carry && u.hunger < 70 && ownedPens.some((b) => !b.active && assigned(u, b.id)),
            )
          : undefined;
      const person = excessHerder ?? gravedigger ?? inactiveHerder ?? available[0] ?? surplusHauler;
      const transportCount = (token: string) =>
        adults().filter(
          (u) =>
            u.command?.includes('V_04') &&
            (u.command.includes(token) ||
              (token === 'O_04' &&
                state.entities.some(
                  (e) =>
                    e.id === u.targetId &&
                    (e.kind === 'berries' ||
                      (['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) && e.hp <= 0) ||
                      (e.kind === 'ground' &&
                        ['food', 'meat', 'cooked'].includes(e.resource ?? ''))),
                ))) &&
            ['gathering', 'returning'].includes(u.action),
        ).length;
      const collect = (unit: Unit, token: string) => {
        const resource = token === 'O_03' ? 'wood' : token === 'O_02' ? 'stone' : 'food';
        const pile = state.entities
          .filter(
            (e) =>
              e.kind === 'ground' &&
              e.resource === resource &&
              e.amount >= 1 &&
              visible(e) &&
              safePath(e),
          )
          .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
        const node =
          pile ??
          nearest(
            token === 'O_03' ? 'tree' : token === 'O_02' ? 'stone' : 'berries',
            token === 'O_04' ? 3 : 0,
          );
        return (
          !!node &&
          say(['S_02', 'V_04', ...(hasWord(state, token) ? [token] : [])], targetFor(node), unit.id)
        );
      };
      const forage = (unit: Unit) => {
        const carcass = state.entities
          .filter(
            (e) =>
              ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) &&
              e.hp <= 0 &&
              e.amount > 0 &&
              visible(e) &&
              safePath(e),
          )
          .sort((a, b) => homeDistance(a) - homeDistance(b))[0];
        if (carcass)
          return say(
            ['S_02', 'V_04', ...(hasWord(state, 'O_04') ? ['O_04'] : [])],
            targetFor(carcass),
            unit.id,
          );
        if (season !== 3) return collect(unit, 'O_04');
        const deer = nearest('deer', 0, true);
        const hunter =
          profile === 'patient'
            ? adults()
                .filter(
                  (u) =>
                    !u.jobBuildingId &&
                    !u.suspendedJob &&
                    !u.carry &&
                    u.hunger < 75 &&
                    !['building', 'hunting'].includes(u.action),
                )
                .sort((a, b) => b.strength - a.strength)[0]
            : unit;
        return (
          !!deer &&
          !!hunter &&
          (profile !== 'patient' || !adults().some((u) => u.action === 'hunting')) &&
          say(
            ['S_02', 'V_03', ...(hasWord(state, 'O_04') ? ['O_04'] : [])],
            targetFor(deer),
            hunter.id,
          )
        );
      };
      const build = (kind: keyof typeof BUILDING_SPECS, unit: Unit) => {
        const spec = BUILDING_SPECS[kind];
        if (adults().some((u) => u.action === 'building')) return false;
        if (
          !Object.entries(spec.cost).every(
            ([r, n]) => state.resources[r as keyof typeof state.resources] >= n,
          ) &&
          !(kind === 'storage' && state.resources.stone >= 10)
        )
          return false;
        const count = villageBuildings().length;
        return say(
          ['S_02', ...spec.recipe],
          {
            type: 'point',
            x: kind === 'house' ? state.home.x : state.home.x + Math.round(Math.cos(count) * 4),
            y: kind === 'house' ? state.home.y + 2 : state.home.y + Math.round(Math.sin(count) * 4),
          },
          unit.id,
        );
      };
      const assign = (kind: 'pen' | 'grave' | 'farm', unit: Unit) => {
        const b = villageBuildings().find(
          (b) =>
            b.kind === kind &&
            b.active &&
            adults().filter((u) => assigned(u, b.id)).length < BUILDING_SPECS[kind].workers,
        );
        return (
          !!b &&
          say(
            ['S_02', ...BUILDING_SPECS[kind].recipe],
            { type: 'building', id: b.id, x: b.x, y: b.y },
            unit.id,
          )
        );
      };
      // Relighting is the first emergency, before ordinary jobs spend Voice or
      // overwrite the chosen caretaker. The next loop still advances real time.
      const fire = villageBuildings().find((b) => b.kind === 'campfire');
      if (fire && !fire.active && state.resources.wood >= 1 && state.voice >= 1) {
        const guardian =
          available.find((u) => u.age >= 14) ??
          person ??
          adults()
            .filter((u) => !u.isKing && !u.carry && u.action !== 'building')
            .sort(
              (a, b) =>
                Number(!!a.jobBuildingId || !!a.suspendedJob) -
                  Number(!!b.jobBuildingId || !!b.suspendedJob) ||
                homeDistance(a) - homeDistance(b),
            )[0];
        if (guardian && say(['S_02', 'V_05', 'O_05'], undefined, guardian.id)) continue;
      }
      phase = day ? 'ruoli individuali' : 'riposo';
      if (day && person && state.voice >= 1) {
        const closed = villageBuildings().find((b) => b.kind === 'pen' && !b.active);
        const plans: [boolean, () => boolean, string][] = [
          [
            profile === 'patient' &&
              season !== 3 &&
              state.resources.food < Math.max(10, ownedPens.length * 8) &&
              transportCount('O_04') < 2,
            () => collect(person, 'O_04'),
            'foraggio prima del prossimo inverno',
          ],
          [
            profile === 'patient' &&
              corpses &&
              !hasBuilding('grave') &&
              state.resources.stone >= 30,
            () => build('grave', person),
            'sepoltura urgente',
          ],
          [
            profile === 'patient' &&
              corpses &&
              !hasBuilding('grave') &&
              state.resources.stone < 31 &&
              transportCount('O_02') < 2,
            () => collect(person, 'O_02'),
            'pietra per seppellire i defunti',
          ],
          [
            profile === 'patient' &&
              !hasWord(state, 'O_04') &&
              !adults().some((u) => u.action === 'hunting') &&
              !state.entities.some(
                (e) =>
                  ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) &&
                  e.hp <= 0 &&
                  e.amount > 0 &&
                  visible(e),
              ),
            () => {
              const hunter = adults()
                .filter(
                  (u) =>
                    !u.jobBuildingId &&
                    !u.suspendedJob &&
                    !u.carry &&
                    u.hunger < 75 &&
                    u.action !== 'building',
                )
                .sort((a, b) => b.strength - a.strength)[0];
              const deer = nearest('deer', 0, true);
              return !!hunter && !!deer && say(['S_02', 'V_03'], targetFor(deer), hunter.id);
            },
            'prima caccia',
          ],
          [
            profile === 'patient' && !hasWord(state, 'O_04'),
            () => {
              const carcass = state.entities.find(
                (e) =>
                  ['deer', 'wolf', 'alpha', 'mammoth'].includes(e.kind) &&
                  e.hp <= 0 &&
                  e.amount > 0 &&
                  visible(e),
              );
              const eater = adults()
                .filter((u) => idle(u) && u.hunger > 20)
                .sort((a, b) => b.intelligence - a.intelligence)[0];
              return !!carcass && !!eater && say(['S_02', 'V_02'], targetFor(carcass), eater.id);
            },
            'comprendere la preda',
          ],
          [
            profile === 'patient' &&
              foodNutrition() < own().length * (season === 3 ? 20 : 60) &&
              (season !== 3 || adults().some((u) => u.hunger > 70)) &&
              transportCount('O_04') < 2,
            () => forage(person),
            'riserva alimentare urgente',
          ],
          [
            profile === 'patient' &&
              state.resources.meat >= 1 &&
              state.resources.cooked < own().length * 2 &&
              adults().filter((u) => u.action === 'cooking').length < Math.ceil(own().length / 10),
            () => say(['S_02', 'V_07', 'O_04', 'O_05'], undefined, person.id),
            'cucina quotidiana',
          ],
          [
            profile === 'patient' && !ownedPens.length && state.resources.wood >= 20,
            () => build('pen', person),
            'primo allevamento',
          ],
          [
            profile === 'patient' &&
              !ownedPens.length &&
              state.resources.wood < 24 &&
              transportCount('O_03') < 3,
            () => collect(person, 'O_03'),
            'legna per il primo recinto',
          ],
          [
            !!closed && state.resources.food >= 5,
            () =>
              say(
                ['S_02', ...BUILDING_SPECS.pen.recipe],
                { type: 'building', id: closed!.id, x: closed!.x, y: closed!.y },
                person.id,
              ),
            'rifornire il recinto',
          ],
          [!hasBuilding('depot'), () => build('depot', person), 'deposito'],
          [
            profile === 'patient' &&
              !hasBuilding('hut') &&
              pens.length > 0 &&
              !(corpses && !hasBuilding('grave')) &&
              state.resources.wood >= 12 &&
              state.resources.pelt >= 5,
            () => build('hut', person),
            'riparo e nuove generazioni',
          ],
          [
            profile === 'patient' &&
              pens.length > 0 &&
              villageHousing(state) < own().length * 3 &&
              state.resources.wood >= 14 &&
              state.resources.stone >= 23,
            () => build('house', person),
            'alloggi con margine',
          ],
          [
            profile === 'patient' &&
              pens.length > 0 &&
              state.resources.wood < 28 &&
              transportCount('O_03') < 2,
            () => collect(person, 'O_03'),
            'legno per ripari e trasmissione',
          ],
          [
            hasBuilding('grave') &&
              (corpses || (profile !== 'patient' && own().length >= 7)) &&
              !adults().some((u) =>
                villageBuildings().some((b) => b.kind === 'grave' && assigned(u, b.id)),
              ),
            () => assign('grave', person),
            'custodia del tumulo',
          ],
          [herders.length < neededHerders, () => assign('pen', person), 'allevatori'],
          [
            !hasBuilding('house') && state.resources.wood >= 14,
            () => build('house', person),
            'primo riparo',
          ],
          [
            !(profile === 'patient' ? ownedPens.length : pens.length) && state.resources.wood >= 22,
            () => build('pen', person),
            'recinto',
          ],
          [
            hasBuilding('house') && state.resources.stone < 3 && transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'manutenzione della casa',
          ],
          [
            hasBuilding('house') &&
              !hasBuilding('storage') &&
              (state.resources.wood >= 10 || state.resources.stone >= 13),
            () => build('storage', person),
            'pozzo scorte',
          ],
          [
            hasBuilding('house') &&
              !hasBuilding('storage') &&
              state.resources.stone < 13 &&
              transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'pietra per scorte',
          ],
          [
            hasBuilding('grave') && !hasBuilding('menhir') && state.resources.stone >= 23,
            () => build('menhir', person),
            'pietra sacra',
          ],
          [
            villageHousing(state) < own().length * 2 &&
              state.resources.stone >= 23 &&
              state.resources.wood >= 14,
            () => build('house', person),
            'alloggi',
          ],
          [
            !hasBuilding('grave') &&
              (profile !== 'patient' || hasWord(state, 'O_06')) &&
              state.resources.stone < 31 &&
              state.resources.wood >= 4 &&
              transportCount('O_02') < 2,
            () => collect(person, 'O_02'),
            'pietra funeraria prioritaria',
          ],
          [
            season !== 3 &&
              state.resources.food <
                Math.max(12, villageBuildings().filter((b) => b.kind === 'pen').length * 5 + 5) &&
              transportCount('O_04') < 1,
            () => collect(person, 'O_04'),
            'foraggio per il bestiame',
          ],
          [
            state.resources.wood < 12 && transportCount('O_03') < 2,
            () => collect(person, 'O_03'),
            'combustibile urgente',
          ],
          [
            !hasBuilding('house') && state.resources.stone < 20 && transportCount('O_02') < 2,
            () => collect(person, 'O_02'),
            'pietra per casa',
          ],
          [
            !hasBuilding('grave') && state.resources.stone >= 31,
            () => build('grave', person),
            'tumulo',
          ],
          [
            pens.length > 0 && state.resources.stone < 35 && transportCount('O_02') < 1,
            () => collect(person, 'O_02'),
            'riserva di pietra',
          ],
          [
            foodNutrition() < own().length * 15 && transportCount('O_04') < (pens.length ? 1 : 2),
            () => forage(person),
            'cibo',
          ],
          [
            state.resources.wood < (needsPen ? 30 : pens.length ? 22 : 24) &&
              transportCount('O_03') < (needsPen ? 2 : pens.length ? 1 : 2),
            () => collect(person, 'O_03'),
            'legna',
          ],
          [
            !hasBuilding('hut') && state.resources.wood >= 14,
            () => build('hut', person),
            'capanna',
          ],
          [!hasBuilding('farm'), () => build('farm', person), 'campo'],
          [
            state.resources.meat >= 1 &&
              state.resources.cooked < own().length * 2 &&
              !adults().some((u) => u.action === 'cooking'),
            () => say(['S_02', 'V_07', 'O_04', 'O_05'], undefined, person.id),
            'cottura',
          ],
        ];
        for (const [enabled, perform, label] of plans)
          if (enabled && perform()) {
            phase = label;
            break;
          }
      }
      // Nearby building work is valid at night; spend saved inputs before council fuel.
      if (state.voice >= 1) {
        const builder = adults()
          .filter(idle)
          .filter((u) => u.hunger < 75 && u.temp > 30)
          .sort((a, b) => a.hunger - b.hunger)[0];
        if (
          builder &&
          !(corpses && !hasBuilding('grave')) &&
          villageHousing(state) < own().length * 2 &&
          state.resources.stone >= 23 &&
          state.resources.wood >= 14
        )
          build('house', builder);
        else if (builder && needsPen && state.resources.wood >= 24) build('pen', builder);
      }
      if (state.voice >= 1 && getCalendar(state).canonicalPhase >= 70 && foodNutrition() > 0) {
        const seasonId = getCalendar(state).seasonIndex;
        const hungry = adults()
          .filter(
            (u) =>
              u.age < 13 &&
              u.hunger > 45 &&
              homeDistance(u) <= 10 &&
              !u.carry &&
              !fedParents.has(`${seasonId}:${u.id}`),
          )
          .sort((a, b) => b.hunger - a.hunger)[0];
        if (hungry && say(['S_02', 'V_02', 'O_04'], undefined, hungry.id))
          fedParents.add(`${seasonId}:${hungry.id}`);
      }
      for (const kind of ['pen', 'grave', 'farm'] as const) {
        if (!day || state.voice < 1) break;
        if (kind === 'grave' && !corpses && (profile === 'patient' || own().length < 7)) continue;
        if (
          kind === 'pen' &&
          adults().filter((u) => pens.some((b) => assigned(u, b.id))).length >= neededHerders
        )
          continue;
        const free = adults().find((u) => idle(u) && u.hunger < 60);
        if (free) assign(kind, free);
      }
    }
    if (getCalendar(state).canonicalPhase === 85)
      fertilityReports.push({
        at: state.time,
        readiness: getGrowthReadiness(state),
        people: own().map((u) => ({
          id: u.id,
          name: u.name,
          sex: u.sex,
          age: u.age,
          hunger: u.hunger,
          homeDistance: homeDistance(u),
          blockers: fertilityBlockers(state, u, { ageOffset: 1 }),
        })),
      });
    const before = state.time;
    state = tick(state, Math.min(5, until - state.time));
    if (state.time === before && !state.campfirePending) break;
  }
  maxPopulation = Math.max(maxPopulation, own().length);
  record();
  return {
    state,
    actions,
    discoveries,
    snapshots,
    fertilityReports,
    decisionReports,
    opening: { firstFireAt: opening.firstFireAt, orders: opening.orders.length },
    maxPopulation,
  };
}
