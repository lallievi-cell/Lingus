import { BUILDING_SPECS, WORDS } from './content';
import { getDogmaEffects } from './dogmas';
import { getGrowthReadiness, villageHousing } from './growthReadiness';
import { learningDecayGamma } from './learningBalance';
import { activeUnits, hasBuilding, hasWord, isPlayerBuilding } from './runtime';
import type { GameState, Objective } from './types';

const objective = (
  title: string,
  description: string,
  current: number,
  total: number,
): Objective => ({
  title,
  description,
  current,
  total,
  progress: Math.max(0, Math.min(1, current / Math.max(1, total))),
});

/** Read actual settlement needs; acquiring unrelated words cannot complete these goals. */
export function settlementObjective(state: GameState): Objective | undefined {
  if (state.tier < 2 || !hasWord(state, 'O_05')) return;
  const people = activeUnits(state),
    buildings = state.buildings.filter(
      (b) => isPlayerBuilding(state, b) && b.hp > 0 && b.completed !== false,
    );
  const population = state.urbanized
    ? state.cities
        .filter((c) => c.factionId === 'player')
        .reduce((n, c) => n + Object.values(c.cohorts).reduce((a, b) => a + b, 0), 0)
    : people.length;
  const bodies = state.entities.filter(
    (e) =>
      e.kind === 'corpse' &&
      e.amount > 0 &&
      Math.hypot(e.x - state.home.x, e.y - state.home.y) <= 100,
  );
  if (!state.urbanized && bodies.length && hasWord(state, 'O_06'))
    return objective(
      'Dare riposo ai morti',
      hasBuilding(state, 'grave')
        ? 'Assegna un adulto al Tumulo. I funerali proteggono la salute della comunità e restituiscono Coesione.'
        : 'Prepara un Tumulo e affidagli un adulto: i defunti insepolti consumano la Coesione.',
      0,
      bodies.length,
    );
  if (buildings.some((b) => b.kind === 'campfire') && !hasBuilding(state, 'campfire'))
    return objective(
      'Ritrovare il calore',
      'Consegna legna e affida Conservare · Fuoco a un adulto per ravvivare il Falò.',
      Math.min(1, state.resources.wood),
      1,
    );
  // These are village targets; provincial capacities and food remain local.
  if (
    !state.urbanized &&
    hasWord(state, 'V_08') &&
    hasWord(state, 'O_01') &&
    hasWord(state, 'O_02')
  ) {
    const housing = villageHousing(state),
      target = Math.ceil(population * 1.5);
    if (housing < Math.ceil(population * 1.2))
      return objective(
        'Spazio per nuove generazioni',
        'Prepara un altro riparo prima che gli alloggi si riempiano. Le case inattive non offrono posti: conserva la pietra per mantenerle.',
        housing,
        target,
      );
    const stoneNeed =
      buildings.reduce((sum, b) => sum + (BUILDING_SPECS[b.kind].upkeep.stone ?? 0), 0) * 2;
    if (stoneNeed > 0 && state.resources.stone < stoneNeed)
      return objective(
        'La pietra sostiene il villaggio',
        'Porta pietra al campo per la manutenzione delle case. Aggiungere alloggi senza rifornimenti può far perdere quelli già costruiti.',
        state.resources.stone,
        stoneNeed,
      );
  }
  if (
    !state.urbanized &&
    hasWord(state, 'V_07') &&
    state.resources.meat >= Math.max(2, population / 3) &&
    state.resources.cooked < Math.ceil(population / 2)
  )
    return objective(
      'Cuocere per la comunità',
      state.tier >= 3 && hasWord(state, 'C_02')
        ? 'Organizza Sempre · Gruppo · Cuocere · Preda · Fuoco: gli adulti liberi preparano pasti durante il giorno, usando carne realmente disponibile.'
        : 'Cuoci la carne vicino al Falò. I pasti cotti nutrono di più e riducono le malattie della carne cruda.',
      state.resources.cooked,
      Math.ceil(population / 2),
    );
  if (state.tier >= 3 && !state.urbanized) {
    const food =
      state.resources.food * 25 + state.resources.meat * 40 + state.resources.cooked * 60;
    if (food < population * 36)
      return objective(
        'Rifornimenti per un villaggio più grande',
        'Rafforza allevamento e raccolta, assegna gli addetti e prepara scorte consegnate. La crescita richiede pasti continui, anche dopo il raccolto.',
        food,
        population * 72,
      );
    const effects = getDogmaEffects(state);
    const erosion = Object.entries(state.words)
      .filter(([, w]) => w.retention > 0)
      .reduce(
        (n, [id]) =>
          n +
          learningDecayGamma(state, effects.gamma * effects.decay, false) * WORDS[id].complexity,
        0,
      );
    if (hasWord(state, 'O_09') && !hasBuilding(state, 'archive'))
      return objective(
        'Una casa per la memoria',
        'Costruisci un Archivio e assegnagli scribi: conoscere Scrittura non basta a proteggere le parole.',
        0,
        1,
      );
    const archive = buildings.find((b) => b.kind === 'archive' && b.active);
    if (archive && (archive.lastEfficiency ?? (archive.workerIds?.length ?? 0) / 4) < 1)
      return objective(
        'Dare mani alla Scrittura',
        'Affida l’Archivio a saggi disponibili. Senza scribi effettivi il suo sostegno alla memoria rimane incompleto.',
        Math.round((archive.lastEfficiency ?? (archive.workerIds?.length ?? 0) / 4) * 4),
        4,
      );
    if (!hasWord(state, 'O_09') && erosion > effects.attentionCap)
      return objective(
        'La memoria chiede un sostegno',
        hasWord(state, 'O_08')
          ? 'L’oblio supera ciò che un consiglio può recuperare. Cerca la Scintilla di Scrittura: Numero, Pietra e Domani possono darle forma.'
          : 'La memoria orale è sotto pressione. Organizza le scorte per comprendere Numero, poi cerca un modo per affidare le parole alla pietra.',
        0,
        1,
      );
    if (population >= 150 && hasWord(state, 'O_09') && hasWord(state, 'O_10'))
      return objective(
        'Il villaggio diventa una città',
        'La comunità condivide Scrittura e un Confine. Comprendi la Scintilla di Città per governare i suoi gruppi sociali.',
        0,
        1,
      );
    if (population >= 35 && !hasWord(state, 'O_10'))
      return objective(
        'Conoscere il proprio confine',
        'Incontra un altro popolo, comprendi Straniero e Mio e osserva il limite tra i due insediamenti.',
        0,
        1,
      );
    return objective(
      'Un villaggio capace di diventare città',
      'Sostieni alloggi, alimentazione e ricambio generazionale. Città richiede centocinquanta abitanti, Scrittura e Confine.',
      population,
      150,
    );
  }
  if (state.urbanized) {
    if (state.cohesion < 60 || state.revoltTension >= 30)
      return objective(
        'Tenere unita la civiltà',
        'Riduci le tensioni, sostieni i bisogni delle città e controlla l’effetto delle tue leggi prima di espanderti.',
        Math.max(0, state.cohesion),
        90,
      );
    if (state.philosophy) {
      const targets = state.dogmaReformTargets ?? [];
      const reformed = targets.filter((id) => state.eventTimes[`reformed:${id}`] === 1).length;
      return objective(
        'Verso il Grande Risveglio',
        'Completa la riforma dei dogmi, libera i servi e porta la Coesione almeno a novanta. La filosofia deve cambiare la vita della comunità.',
        reformed,
        Math.max(1, targets.length),
      );
    }
    if (state.victoryProgress.imperialSeasons > 0)
      return objective(
        'Custodire la pace dell’impero',
        'Mantieni il controllo delle città, un Palazzo, cinque leggi e tensioni inferiori a trenta per sedici stagioni consecutive.',
        state.victoryProgress.imperialSeasons,
        16,
      );
    return objective(
      'Scegliere un’eredità',
      'Prepara dominio e pace interna, una lingua condivisa con memoria completa, oppure libertà e riforma dei dogmi. Controlla le condizioni delle tre vittorie.',
      0,
      3,
    );
  }
  const stable = Object.values(state.words).filter((w) => w.retention >= 50).length;
  if (stable >= 16) {
    const readiness = getGrowthReadiness(state);
    return objective(
      'Nuove generazioni per il villaggio',
      readiness.blockers.includes('food')
        ? 'Prepara pasti e fai mangiare i futuri genitori al campo. Servono anche riposo, un partner fertile e posti liberi.'
        : 'Mantieni sazi e riposati i futuri genitori al campo. Servono trentacinque abitanti e la parola Sempre per entrare nel Neolitico.',
      population,
      35,
    );
  }
}
