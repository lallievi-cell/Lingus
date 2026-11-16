import { RESOURCE_ORDER, RESOURCE_SPECS } from './content';
import { issueCommand } from './engine';
import { compileSentence, getPredicate } from './grammar';
import { orderAcknowledged } from './commandAcknowledgement';
import { hasWord } from './runtime';
import {
  BOAT_BUILD_SECONDS,
  BOAT_CARGO_CAPACITY,
  BOAT_PASSENGER_CAPACITY,
  BOAT_SPEED,
} from './maritimeConfig';
import { guidedRepeatTransport, plainFoodCook, plainToolCraft } from './simulation';
import type { GameState, Resource, Target } from './types';

/** No clock ticks: asks the actual command handler, against its normal deep copy. */
export function getOrderPreview(
  state: GameState,
  tokens: string[],
  target?: Target,
  executorId?: string,
  groupAnchor?: Target,
) {
  const compilation = compileSentence(state, tokens, target);
  if (!compilation.valid || compilation.requiresTarget)
    return {
      accepted: false,
      message: compilation.requiresTarget
        ? 'Scegli il bersaglio sulla mappa.'
        : compilation.message,
      unitIds: [] as string[],
      destinations: [] as Target[],
      interruptions: [] as string[],
      abandonedConstructionIds: [] as string[],
      cargoDrops: [] as string[],
      costs: [] as { resource: Resource; amount: number }[],
      voice: 0,
      attention: 0,
      behaviour: '',
      institutional: false,
      sideEffects: false,
    };
  const trace = { assignedUnitIds: [] as string[] };
  const next = issueCommand(state, tokens, target, executorId, groupAnchor, trace);
  const accepted = orderAcknowledged(state, next);
  const affectedByInstitution =
    accepted && trace.assignedUnitIds.length === 0
      ? next.units
          .filter((unit) => {
            const previous = state.units.find((u) => u.id === unit.id);
            return (
              previous &&
              (unit.action !== previous.action ||
                unit.jobBuildingId !== previous.jobBuildingId ||
                unit.cityId !== previous.cityId ||
                unit.caste !== previous.caste ||
                unit.isKing !== previous.isKing)
            );
          })
          .map((u) => u.id)
      : [];
  const unitIds = [...new Set([...trace.assignedUnitIds, ...affectedByInstitution])];
  const destinations = [
    ...new Map(
      unitIds.flatMap((id) => {
        const unit = next.units.find((u) => u.id === id)!;
        const entity = next.entities.find((e) => e.id === unit.targetId);
        const building = next.buildings.find((b) => b.id === unit.jobBuildingId);
        const boat = next.boats?.find((entry) => entry.id === (unit.boatId ?? unit.targetBoatId));
        const harbor =
          unit.action === 'boatbuilding'
            ? next.buildings.find((entry) => entry.id === boat?.harborId)
            : undefined;
        const sailingDestination =
          unit.action === 'sailing' ? (boat?.landing ?? boat?.destination) : undefined;
        const destination: Target | undefined = sailingDestination
          ? { type: 'point', ...sailingDestination }
          : harbor
            ? { type: 'building', id: harbor.id, x: harbor.x, y: harbor.y }
            : boat
              ? { type: 'boat', id: boat.id, x: boat.x, y: boat.y }
              : entity
                ? { type: 'entity', id: entity.id, x: entity.x, y: entity.y }
                : building
                  ? { type: 'building', id: building.id, x: building.x, y: building.y }
                  : unit.tx !== undefined && unit.ty !== undefined
                    ? { type: 'point', x: unit.tx, y: unit.ty }
                    : undefined;
        return destination
          ? [
              [
                `${destination.type}:${destination.id ?? `${destination.x},${destination.y}`}`,
                destination,
              ] as const,
            ]
          : [];
      }),
    ).values(),
  ];
  const interruptions = unitIds.filter((id) => {
    const unit = state.units.find((u) => u.id === id)!;
    return !!(
      unit.command ||
      unit.jobBuildingId ||
      unit.suspendedJob ||
      unit.action === 'building'
    );
  });
  const abandonedConstructionIds = [...new Set(trace.assignedUnitIds)].filter((id) => {
    const previous = state.units.find((unit) => unit.id === id);
    return (
      previous?.action === 'building' &&
      Object.values(previous.paidConstruction ?? {}).some((amount) => amount > 0)
    );
  });
  const cargoDrops = state.units
    .filter((u) => (u.carry?.amount ?? 0) > 0 && !next.units.find((v) => v.id === u.id)?.carry)
    .map((u) => u.id);
  const accessibleTotal = (s: GameState, r: Resource) =>
    (s.resources[r] ?? 0) +
    s.units.reduce((n, u) => n + (u.carry?.resource === r ? u.carry.amount : 0), 0) +
    s.entities
      .filter((e) => e.kind === 'ground' && e.resource === r)
      .reduce((n, e) => n + Math.max(0, e.amount), 0) +
    s.cities
      .filter((c) => c.factionId === 'player' && !c.capital)
      .reduce((n, c) => n + (c.resources[r] ?? 0), 0) +
    (s.boats ?? [])
      .filter((boat) => boat.ownerId === 'player')
      .reduce((n, boat) => n + boat.resources[r], 0);
  const costs = RESOURCE_ORDER.map((resource) => ({
    resource,
    amount: accessibleTotal(state, resource) - accessibleTotal(next, resource),
  })).filter((entry) => entry.amount > 1e-7);
  const predicate = getPredicate(tokens);
  const institutional =
    ['law', 'dogma', 'tradition'].includes(compilation.kind ?? '') ||
    ['S_08', 'S_09'].includes(predicate.subject);
  let behaviour = '';
  const actions = unitIds.map((id) => next.units.find((unit) => unit.id === id)?.action);
  const numbered = hasWord(state, 'O_08');
  if (['S_08', 'S_09'].includes(predicate.subject)) behaviour = compilation.message;
  else if (compilation.kind === 'tradition')
    behaviour =
      'Stabilisce un incarico da ripetere. Gli addetti lo svolgono quando turno, bisogni e regole lo permettono e ci sono posti liberi. Con Notte, il lavoro si svolge nelle ore buie.';
  else if (compilation.kind === 'law')
    behaviour =
      'Incide una legge: controlla anche sanzione, costi e condizioni nel pannello delle leggi.';
  else if (compilation.kind === 'dogma')
    behaviour = 'Incide un dogma: influenza il comportamento della comunità e la sua libertà.';
  else if (actions.includes('boatbuilding'))
    behaviour = `Un artigiano raggiunge l’approdo e lavora allo scafo già pagato${numbered ? ` per ${BOAT_BUILD_SECONDS} secondi` : ''}. Uno scafo interrotto rimane all’ormeggio e può essere ripreso senza pagare di nuovo i materiali.`;
  else if (actions.includes('embarking'))
    behaviour = `Il gruppo raggiunge la riva a piedi, poi sale davvero sulla barca con i propri carichi.${numbered ? ` Ci sono ${BOAT_PASSENGER_CAPACITY} posti e ${BOAT_CARGO_CAPACITY} unità di carico, compresi i carichi personali.` : ' Il gruppo e i suoi carichi devono trovare posto insieme a chi è già a bordo.'} Le scorte del campo restano sulla terraferma.`;
  else if (actions.includes('sailing'))
    behaviour = `L’equipaggio segue una rotta interamente in mare${numbered ? ` a ${BOAT_SPEED} metri al secondo` : ''}. Persone e carichi viaggiano sulla barca. Una destinazione sulla riva osservata comprende lo sbarco fisico; in mare aperto l’equipaggio resta a bordo.`;
  else if (actions.includes('loadingBoat'))
    behaviour = `Gli addetti prelevano risorse realmente disponibili su questa terraferma e le trasportano fino alla barca.${numbered ? ` La stiva contiene al massimo ${BOAT_CARGO_CAPACITY} unità, compresi i carichi dei passeggeri.` : ' Il carico si ferma quando la stiva è piena o non ci sono altre scorte raggiungibili.'} Il trasferimento richiede lavoro e viaggi: nessuna scorta lontana viene assegnata alla barca.`;
  else if (actions.includes('unloadingBoat'))
    behaviour =
      'Gli addetti prelevano il carico reale dalla barca e lo portano al campo solo se raggiungibile a piedi. Su un’isola lasciano mucchi fisici sulla riva, da consumare o trasportare con altri ordini.';
  else if (unitIds.some((id) => next.units.find((u) => u.id === id)?.action === 'building'))
    behaviour =
      'Un costruttore usa i materiali prelevati subito dalle scorte. L’edificio funzionerà quando la costruzione sarà completata.';
  else if (predicate.verb === 'V_04') {
    const food =
      tokens.includes('O_04') ||
      tokens.includes('O_06') ||
      destinations.some((destination) => {
        const source = state.entities.find((entry) => entry.id === destination.id);
        return (
          source &&
          (source.kind === 'berries' ||
            source.kind === 'corpse' ||
            (['deer', 'wolf', 'alpha', 'mammoth'].includes(source.kind) && source.hp <= 0) ||
            (source.kind === 'ground' &&
              ['food', 'meat', 'cooked', 'fish', 'cookedFish'].includes(source.resource ?? '')))
        );
      });
    const repeated = guidedRepeatTransport(state, tokens);
    const fishing = destinations.some((destination) =>
      state.entities.some((entity) => entity.id === destination.id && entity.kind === 'fishery'),
    );
    behaviour = fishing
      ? `Raggiunge la riva asciutta e pesca. Ogni carico richiede lavoro e consuma soltanto il pescato realmente catturato dalla riserva finita. Le scorte aumentano alla consegna. ${repeated ? 'In Guidata ripete i viaggi durante il giorno finché ci sono pesce e spazio.' : 'Completa un viaggio; per ripetere serve un altro ordine o una tradizione.'}`
      : `${food ? 'Raccoglie cibo da fonti compatibili e carcasse; non abbatte animali vivi.' : 'Raccoglie dai cumuli a terra o estrae direttamente da alberi, rocce e giacimenti adatti.'} Trasporta poi il carico al campo. ${repeated ? 'In Guidata ripete i viaggi durante il giorno, finché ci sono risorse e spazio. Esaurita una fonte, cerca altre fonti compatibili entro venti metri dal punto iniziale, nelle terre già esplorate. Se scegli un cumulo, raccoglie solo materiali già a terra.' : 'Completa un viaggio; per ripetere servono altri ordini o una tradizione disponibile.'}`;
  } else if (predicate.verb === 'V_03')
    behaviour =
      'Su alberi e rocce lascia i materiali sul posto: non li consegna al campo. Contro animali vivi caccia e può subire ferite.';
  else if (plainToolCraft(tokens))
    behaviour =
      state.playMode === 'guided'
        ? 'Un artigiano ripete i manufatti durante il giorno finché trova pietra utilizzabile e spazio. Ogni utensile consuma la pietra necessaria.'
        : 'Un artigiano completa un manufatto, poi attende un nuovo ordine.';
  else if (unitIds.some((id) => next.units.find((u) => u.id === id)?.jobBuildingId))
    behaviour =
      'Assegna un incarico all’edificio. Riposo, fame e freddo possono sospenderlo; un nuovo ordine lo sostituisce.';
  else if (predicate.verb === 'V_07')
    behaviour =
      state.playMode === 'guided' && plainFoodCook(tokens)
        ? state.mapGeneration?.coastalRules === 1
          ? 'Un cuoco prepara pasti durante il giorno finché ci sono carne o pesce catturato, un Falò attivo e spazio. Ogni ciclo paga la propria porzione; fame, freddo o un nuovo ordine interrompono il lavoro.'
          : 'Un cuoco prepara pasti durante il giorno finché ci sono carne, un Falò attivo e spazio. Ogni porzione consuma una carne; fame, freddo o un nuovo ordine interrompono il lavoro.'
        : 'Un artigiano completa una cottura. Il compito diretto termina dopo questo ciclo.';
  else if (predicate.verb === 'V_02')
    behaviour =
      'Mangia dalle scorte raggiungibili o dalla fonte scelta, fino alla sazietà. La carne cruda può causare malattia.';
  else behaviour = compilation.message;
  if (
    predicate.verb === 'V_07' &&
    unitIds.some((id) => next.units.find((unit) => unit.id === id)?.cookInput === 'fish')
  )
    behaviour =
      'Un cuoco usa la porzione di pesce crudo realmente prelevata per produrre pesce cotto. Se il lavoro viene interrotto prima del completamento, la porzione viene lasciata sul terreno. ' +
      behaviour;
  const sideEffects =
    !accepted &&
    (costs.length > 0 ||
      next.cohesion !== state.cohesion ||
      next.units.some((u) => state.units.find((v) => v.id === u.id)?.hp !== u.hp));
  return {
    accepted,
    message:
      next.logs[0]?.id !== state.logs[0]?.id
        ? (next.logs[0]?.text ?? compilation.message)
        : compilation.message,
    unitIds,
    destinations,
    interruptions,
    abandonedConstructionIds,
    cargoDrops,
    costs,
    voice: Math.max(0, state.voice - next.voice),
    attention: Math.max(0, state.attention - next.attention),
    behaviour,
    institutional,
    sideEffects,
  };
}

export function previewResourceLabel(resource: Resource) {
  return resource === 'food' ? 'vegetali' : RESOURCE_SPECS[resource].label.toLocaleLowerCase('it');
}
