import { getDogmaConflict, getDogmaVectors, previewDogma, vectorFamily } from './dogmas';
import { log, nextId } from './runtime';
import { dogmaWeight } from './math';
import { effectiveElapsed, getCalendar } from './calendar';
import type { City, Faction, GameState } from './types';

/** A product policy: communities interpret their own paid, remembered practices.
 * It neither assigns initial religions nor teaches unavailable words. */
export function developForeignCulture(state: GameState, city: City, faction: Faction) {
  if (!faction.words.includes('M_03') || city.cohorts.sages < 1) return;
  const monument = state.buildings.some(
    (building) =>
      building.cityId === city.id &&
      building.kind === 'menhir' &&
      building.hp > 0 &&
      building.active &&
      building.completed !== false,
  );
  if (!monument) return;
  const ageStamp = `foreignDogmaAgeAt:${faction.id}`,
    ordinal = getCalendar(state).seasonIndex;
  if (state.eventTimes[ageStamp] !== ordinal) {
    state.eventTimes[ageStamp] = ordinal;
    for (const dogma of faction.dogmas) {
      dogma.age++;
      if (!dogma.reforming) dogma.weight = dogmaWeight(dogma.age);
    }
  }
  for (const dogma of faction.dogmas) {
    const local = city.dogmas.find((entry) => entry.id === dogma.id);
    if (local) Object.assign(local, dogma);
  }
  // Two slowly formed local doctrines leave a slot for later cultural contact.
  const last = state.eventTimes[`foreignDoctrine:${faction.id}`];
  if (
    faction.dogmas.length >= 2 ||
    city.dogmas.length >= 3 ||
    (last !== undefined && effectiveElapsed(state, last, state.time) < 360)
  )
    return;
  const repeatedHearth = (state.eventTimes[`foreignHearthPromises:${city.id}`] ?? 0) >= 2;
  const cooked = (faction.craftCycles?.V_07 ?? 0) > 0;
  const built = (faction.craftCycles?.V_08 ?? 0) > 0;
  const night = faction.eventMemory?.some((event) => event.tag === 'ENV_NIGHTFALL');
  const choices = [
    {
      target: 'C_01',
      vector: 'C_02',
      witnessed: !!night && repeatedHearth,
      cause: 'i pasti e il fuoco custoditi durante le notti',
    },
    {
      target: 'O_05',
      vector: 'C_02',
      witnessed: repeatedHearth && cooked,
      cause: 'il fuoco che cuoce i pasti e viene alimentato nel tempo',
    },
    {
      target: 'O_03',
      vector: 'V_05',
      witnessed: built && repeatedHearth,
      cause: 'il legno raccolto per costruire e mantenere il focolare',
    },
  ];
  let identity = state.mapGeneration?.seed ?? 6842;
  for (const letter of faction.id)
    identity = (Math.imul(identity, 31) + letter.charCodeAt(0)) >>> 0;
  const ordered = [
    ...choices.slice(identity % choices.length),
    ...choices.slice(0, identity % choices.length),
  ];
  const choice = ordered.find(
    (entry) =>
      entry.witnessed &&
      faction.words.includes(entry.target) &&
      faction.words.includes(entry.vector) &&
      !faction.dogmas.some(
        (dogma) => dogma.targetId === entry.target && dogma.vectorId === entry.vector,
      ) &&
      getDogmaVectors(entry.target).includes(entry.vector) &&
      !getDogmaConflict([...faction.dogmas, ...city.dogmas], entry.target, entry.vector),
  );
  if (!choice) return;
  const dogma = {
    id: nextId(state, 'foreign-dogma'),
    targetId: choice.target,
    vectorId: choice.vector,
    age: 0,
    weight: 10,
    bornAt: state.time,
    vector: vectorFamily(choice.vector),
    ...previewDogma(choice.target, choice.vector),
  };
  faction.dogmas.push(dogma);
  city.dogmas.push({ ...dogma });
  state.eventTimes[`foreignDoctrine:${faction.id}`] = state.time;
  log(
    state,
    `${faction.name} incide «${dogma.name}» sulla propria Pietra Sacra. La nuova regola richiama ${choice.cause}.`,
    'info',
  );
}
