import { RESOURCE_ORDER, RESOURCE_SPECS } from './content';
import { issueCommand } from './engine';
import { compileSentence, getPredicate } from './grammar';
import { orderAcknowledged } from './commandAcknowledgement';
import { guidedRepeatTransport, plainToolCraft } from './simulation';
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
        const destination: Target | undefined = entity
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
  const cargoDrops = state.units
    .filter((u) => (u.carry?.amount ?? 0) > 0 && !next.units.find((v) => v.id === u.id)?.carry)
    .map((u) => u.id);
  const accessibleTotal = (s: GameState, r: Resource) =>
    s.resources[r] +
    s.units.reduce((n, u) => n + (u.carry?.resource === r ? u.carry.amount : 0), 0) +
    s.entities
      .filter((e) => e.kind === 'ground' && e.resource === r)
      .reduce((n, e) => n + Math.max(0, e.amount), 0) +
    s.cities
      .filter((c) => c.factionId === 'player' && !c.capital)
      .reduce((n, c) => n + c.resources[r], 0);
  const costs = RESOURCE_ORDER.map((resource) => ({
    resource,
    amount: accessibleTotal(state, resource) - accessibleTotal(next, resource),
  })).filter((entry) => entry.amount > 1e-7);
  const predicate = getPredicate(tokens);
  const institutional =
    ['law', 'dogma', 'tradition'].includes(compilation.kind ?? '') ||
    ['S_08', 'S_09'].includes(predicate.subject);
  let behaviour = '';
  if (['S_08', 'S_09'].includes(predicate.subject)) behaviour = compilation.message;
  else if (compilation.kind === 'tradition')
    behaviour =
      'Stabilisce un incarico da ripetere. Gli addetti lo svolgono quando turno, bisogni e regole lo permettono e ci sono posti liberi. Con Notte, il lavoro si svolge nelle ore buie.';
  else if (compilation.kind === 'law')
    behaviour =
      'Incide una legge: controlla anche sanzione, costi e condizioni nel pannello delle leggi.';
  else if (compilation.kind === 'dogma')
    behaviour = 'Incide un dogma: influenza il comportamento della comunità e la sua libertà.';
  else if (unitIds.some((id) => next.units.find((u) => u.id === id)?.action === 'building'))
    behaviour =
      'Un costruttore usa i materiali prelevati subito dalle scorte. L’edificio funzionerà quando la costruzione sarà completata.';
  else if (predicate.verb === 'V_04') {
    const food = tokens.includes('O_04') || tokens.includes('O_06');
    const repeated = guidedRepeatTransport(state, tokens);
    behaviour = `${food ? 'Raccoglie cibo da fonti compatibili e carcasse; non abbatte animali vivi.' : 'Raccoglie dai cumuli a terra o estrae direttamente da alberi, rocce e giacimenti adatti.'} Trasporta poi il carico al campo. ${repeated ? 'In Guidata ripete i viaggi sulla stessa fonte durante il giorno, finché ci sono risorse e spazio.' : 'Completa un viaggio; per ripetere servono altri ordini o una tradizione disponibile.'}`;
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
    behaviour = 'Un artigiano completa una cottura. Il compito diretto termina dopo questo ciclo.';
  else if (predicate.verb === 'V_02')
    behaviour =
      'Mangia dalle scorte raggiungibili o dalla fonte scelta, fino alla sazietà. La carne cruda può causare malattia.';
  else behaviour = compilation.message;
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
