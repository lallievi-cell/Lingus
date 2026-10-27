import { BUILDING_NAMES, WORDS } from '../game/content';
import { FIRE_HEAT } from '../game/thermal';
import { hasWord } from '../game/runtime';
import { CUSTODIAN_RISK_LABELS, getCustodianStatuses } from '../game/custodianStatus';
import { resolveUnitSex } from '../game/demography';
import { visibleUnitEquipment } from '../game/unitEquipment';
import type { GameState, MapEntity, WorldTarget } from '../game/types';
import { groundPileFor, resourceKnown, resourcePileLabel } from './mapResourceLayout';
import { getCityPresentation } from './cityPresentation';
import { deriveSiegePresentation, type SiegePresentation } from './mapSiegeArt';
import {
  lifeStageLabel,
  physicalWarnings,
  sexLabel,
  unitLifeHint,
  visibleUnitName,
  foreignUnitDisposition,
} from './unitReadability';

export interface TargetPresentation {
  label: string;
  stage: string;
  kind:
    | 'source'
    | 'ground'
    | 'carcass'
    | 'food'
    | 'stores'
    | 'landmark'
    | 'custodian'
    | 'heat'
    | 'person';
  description: string;
  hint?: string;
}

const animals: Record<string, string> = {
  deer: 'cervo',
  wolf: 'lupo',
  alpha: 'predatore alfa',
  mammoth: 'mammut',
};
const capitalized = (label: string) => label[0].toUpperCase() + label.slice(1);
const siegeDescription = (siege: SiegePresentation, numbered: boolean) =>
  siege.phase === 'occupation'
    ? numbered
      ? `Occupazione: ${siege.occupationSeconds}/30 secondi. L’esercito presidia la città prima dell’annessione.`
      : 'Occupazione in corso. L’esercito deve mantenere il controllo della città.'
    : siege.phase === 'walls'
      ? 'Le mura resistono all’assedio. La barra mostra le difese ancora presenti.'
      : siege.phase === 'garrison'
        ? 'Le mura non proteggono più la città. La guarnigione sta ancora combattendo.'
        : 'La città indifesa viene saccheggiata.';
const abundance = (entity: MapEntity) =>
  entity.amount <= 0
    ? 'esaurito'
    : entity.amount >= (entity.maxAmount ?? entity.amount) * 0.6
      ? 'abbondante'
      : 'scarso';
const remaining = (state: GameState, entity: MapEntity) =>
  hasWord(state, 'O_08') ? `${Math.floor(entity.amount)} disponibili` : abundance(entity);

/** Names and explanations obey the same learned concepts as the map sprites. */
export function entityTargetPresentation(
  state: GameState,
  entity: MapEntity,
): TargetPresentation | null {
  const carries = hasWord(state, 'V_04');
  if (entity.kind === 'ground') {
    const pile = groundPileFor(state, entity.id);
    return {
      label: pile ? resourcePileLabel(state, pile) : 'Cumulo esaurito',
      stage: pile ? 'A terra' : 'Esaurito',
      kind: 'ground',
      description: pile
        ? 'Materiale estratto. Le scorte dell’accampamento aumentano solo quando viene consegnato.'
        : 'Non rimane materiale da prelevare qui.',
      hint: pile
        ? carries
          ? 'Usa Portare per raccoglierlo e riportarlo all’accampamento.'
          : 'La tribù non sa ancora riportare queste risorse all’accampamento. Continua a risolvere le Scintille.'
        : undefined,
    };
  }
  if (entity.kind === 'ore' && !hasWord(state, 'O_07')) return null;
  if (entity.kind === 'tree' || entity.kind === 'stone' || entity.kind === 'ore') {
    const known = hasWord(
      state,
      entity.kind === 'tree' ? 'O_03' : entity.kind === 'stone' ? 'O_02' : 'O_07',
    );
    const name =
      entity.kind === 'tree'
        ? 'Albero'
        : entity.kind === 'stone'
          ? 'Affioramento di selce'
          : 'Vena mineraria';
    if (entity.amount <= 0)
      return {
        label: known ? `${name} · esaurito` : 'Un ostacolo senza nome',
        stage: 'Esaurito',
        kind: 'source',
        description:
          'Qui non rimane materiale da estrarre. Gli eventuali cumuli vicini sono già sul terreno.',
        hint: carries ? 'Puoi usare Portare sui cumuli ancora presenti.' : undefined,
      };
    return {
      label: known ? `${name} · ${remaining(state, entity)}` : 'Un ostacolo senza nome',
      stage: entity.amount <= 0 ? 'Esaurito' : known ? 'Da estrarre' : 'Da conoscere',
      kind: 'source',
      description: known
        ? 'Colpire stacca materiale e lo lascia sul terreno. Le scorte non aumentano durante l’estrazione.'
        : 'Puoi colpire questo elemento. Ciò che ne ricavi rimane sul terreno.',
      hint:
        known && carries
          ? 'Portare può anche prelevare direttamente da questa risorsa.'
          : 'L’esperienza può far nascere una Scintilla e una nuova parola.',
    };
  }
  if (animals[entity.kind]) {
    if (entity.hp <= 0)
      return {
        label: hasWord(state, 'O_04')
          ? `Carcassa di ${animals[entity.kind]} · ${remaining(state, entity)}`
          : 'Animale abbattuto',
        stage: hasWord(state, 'O_04') ? 'Nutrimento sul posto' : 'Sul posto',
        kind: 'carcass',
        description:
          'La carcassa rimane nel luogo dell’abbattimento. Mangiare qui sazia le persone senza creare scorte.',
        hint: carries
          ? 'Usa Portare se vuoi raccoglierne la carne e consegnarla all’accampamento.'
          : 'Puoi indicare questa carcassa con un ordine di Mangiare.',
      };
    return {
      label: `${capitalized(animals[entity.kind])}${hasWord(state, 'O_08') ? ` · ${Math.ceil(entity.hp)} salute` : ''}`,
      stage: 'Animale vivo',
      kind: 'source',
      description:
        'Colpire avvia una caccia. La preda va abbattuta prima di poter essere mangiata o raccolta.',
      hint: ['wolf', 'alpha', 'mammoth'].includes(entity.kind)
        ? 'Può difendersi e ferire i cacciatori.'
        : undefined,
    };
  }
  if (entity.kind === 'berries') {
    const frozen = state.seasonIndex % 4 === 3;
    return {
      label: `Bacche selvatiche · ${frozen ? 'gelate' : remaining(state, entity)}`,
      stage: frozen ? 'Gelate' : 'Cibo sul posto',
      kind: 'food',
      description: frozen
        ? 'In inverno queste bacche non possono essere mangiate o raccolte.'
        : 'Mangiare sazia sul posto. Le bacche rimangono qui finché non vengono consumate o trasportate.',
      hint: !frozen && carries ? 'Con Portare puoi consegnarle all’accampamento.' : undefined,
    };
  }
  if (entity.kind === 'corpse')
    return {
      label: 'Resti di un compagno',
      stage: 'Resti',
      kind: 'landmark',
      description: 'I resti rimangono nel luogo della morte.',
    };
  if (entity.kind === 'seedling')
    return {
      label: 'Germoglio',
      stage: 'In crescita',
      kind: 'landmark',
      description: 'Una nuova pianta sta nascendo qui.',
    };
  return null;
}

export function targetPresentation(
  state: GameState,
  target: WorldTarget | null,
): TargetPresentation | null {
  if (!target) return null;
  if (state.tier >= 4 && target.type === 'city') {
    const city = state.cities.find(
      (candidate) => candidate.id === target.id && candidate.factionId !== 'ruins',
    );
    if (!city) return null;
    const profile = getCityPresentation(state, city);
    const siege = state.battalions
      .map((army) => deriveSiegePresentation(state, army))
      .filter((entry): entry is SiegePresentation => entry?.cityId === city.id)
      .sort((a, b) => b.occupationSeconds - a.occupationSeconds)[0];
    const production = profile.foundries.length
      ? profile.productiveFoundries.length
        ? 'Le fonderie sono al lavoro.'
        : 'Le fonderie sono ferme.'
      : '';
    return {
      label: city.name,
      stage: siege ? 'Città sotto assedio' : city.capital ? 'Capitale' : 'Città',
      kind: 'landmark',
      description: `${profile.vocationLabels.length ? profile.vocationLabels.join(' · ') : 'Comunità senza vocazione specializzata.'}${production ? ` ${production}` : ''}`,
      hint: siege
        ? siegeDescription(siege, hasWord(state, 'O_08'))
        : 'Le rotte dei convogli lasciano sentieri che si consolidano con i passaggi.',
    };
  }
  if (state.tier >= 4 && target.type === 'battalion') {
    const army = state.battalions.find(
      (candidate) => candidate.id === target.id && candidate.hp > 0,
    );
    if (!army) return null;
    const siege = deriveSiegePresentation(state, army);
    return {
      label: army.name,
      stage: siege ? 'Assedio' : army.action === 'moving' ? 'In marcia' : 'Battaglione',
      kind: 'landmark',
      description: siege
        ? siegeDescription(siege, hasWord(state, 'O_08'))
        : 'Una formazione militare della regione.',
      hint: army.catapult
        ? 'La catapulta accompagna il battaglione e colpisce le mura durante l’assedio.'
        : undefined,
    };
  }
  if (target.type === 'unit') {
    const unit = state.units.find((person) => person.id === target.id);
    if (!unit) return null;
    const physicalStage = `${sexLabel(unit)} · ${lifeStageLabel(unit)}${hasWord(state, 'O_08') ? ` · ${Math.floor(unit.age)} stagioni` : ''}`;
    const warnings = physicalWarnings(unit).map((warning) => warning.label);
    const equipment = visibleUnitEquipment(state, unit);
    const equipmentNames: string[] = [];
    if (equipment.held === 'flint')
      equipmentNames.push(resourceKnown(state, 'tool') ? 'amigdala di selce' : 'utensile');
    if (equipment.held === 'spear')
      equipmentNames.push(
        resourceKnown(state, 'spear') ? 'lancia con punta di pietra' : 'arma lunga',
      );
    if (equipment.held === 'metal-blade')
      equipmentNames.push(resourceKnown(state, 'metalArms') ? 'lama metallica' : 'arma');
    if (equipment.held === 'workpiece')
      equipmentNames.push(
        hasWord(state, 'O_02') ? 'selce in lavorazione' : 'materiale in lavorazione',
      );
    if (equipment.armor === 'metal')
      equipmentNames.push(
        resourceKnown(state, 'metalArms') ? 'protezione metallica' : 'protezione',
      );
    if (equipment.armor === 'pelt')
      equipmentNames.push(resourceKnown(state, 'pelt') ? 'protezione di pelle' : 'protezione');
    const equipmentDescription = equipmentNames.length
      ? ` Equipaggiamento in uso: ${equipmentNames.join(', ')}.`
      : '';
    if (unit.hp <= 0)
      return {
        label: visibleUnitName(state, unit),
        stage: `${physicalStage} · ${resolveUnitSex(unit) === 'F' ? 'Deceduta' : 'Deceduto'}`,
        kind: 'person',
        description: unitLifeHint(unit),
        hint: 'La Cronaca e il riepilogo della tribù conservano il ricordo di questa perdita.',
      };
    const foreign = foreignUnitDisposition(state, unit);
    if (foreign)
      return {
        label: visibleUnitName(state, unit),
        stage: `${physicalStage} · ${foreign === 'hostile' ? 'Straniero ostile' : 'Visitatore straniero'}`,
        kind: 'person',
        description: `${foreign === 'hostile' ? 'Appartiene a una comunità in conflitto con la tribù.' : 'Appartiene a un’altra comunità.'}${warnings.length ? ` ${warnings.join(' · ')}.` : ''}${equipmentDescription}`,
        hint:
          foreign === 'hostile'
            ? 'Il segno rosso incrociato distingue i combattenti ostili. Proteggi il villaggio e osserva il loro percorso.'
            : 'Il segno azzurro distingue i visitatori dalle persone della tribù.',
      };
    const custodian = getCustodianStatuses(state).find((status) => status.unitId === target.id);
    if (custodian)
      return {
        label: custodian.displayName,
        stage: `${physicalStage} · Ultimo custode`,
        kind: 'custodian',
        description: `Custodisce da solo: ${custodian.wordIds.map((id) => WORDS[id].label).join(', ')}.${
          custodian.reasons.length
            ? ` ${custodian.reasons.map((reason) => CUSTODIAN_RISK_LABELS[reason]).join(' · ')}.`
            : ''
        }${equipmentDescription}`,
        hint: hasWord(state, 'O_06')
          ? 'Se muore prima di trasmetterle, queste parole andranno perdute. Insegnale al Falò a un altro compagno.'
          : 'Queste parole vivono nella sua memoria. Insegnale al Falò a un altro compagno per proteggerle.',
      };
    return {
      label: visibleUnitName(state, unit),
      stage: physicalStage,
      kind: 'person',
      description:
        (warnings.length ? `${warnings.join(' · ')}. ${unitLifeHint(unit)}` : unitLifeHint(unit)) +
        equipmentDescription,
      hint:
        unit.age < 4
          ? 'I piccoli possono apprendere le parole; gli ordini di lavoro richiedono un adulto.'
          : 'Seleziona questa persona per osservarne il compito e lo stato fisico.',
    };
  }
  if (target.type === 'entity') {
    const entity = state.entities.find((e) => e.id === target.id);
    return entity ? entityTargetPresentation(state, entity) : null;
  }
  if (target.type === 'building') {
    const building = state.buildings.find((b) => b.id === target.id);
    if (building?.kind === 'campfire') {
      const lit = building.active && building.hp > 0 && building.completed !== false;
      const coversRest = Math.hypot(building.x - state.home.x, building.y - state.home.y) + 8 <= 15;
      return {
        label: `${BUILDING_NAMES.campfire} · ${lit ? 'Acceso' : 'Spento'}`,
        stage: lit
          ? state.playMode === 'guided'
            ? 'Nucleo caldo e protezione esterna'
            : 'Calore nelle vicinanze'
          : 'Senza calore',
        kind: 'heat',
        description: lit
          ? state.playMode === 'guided'
            ? hasWord(state, 'O_08')
              ? `Entro ${FIRE_HEAT.guidedCoreRadius} metri il nucleo caldo aiuta a recuperare calore nelle normali notti invernali. Fino a ${FIRE_HEAT.radius} metri offre una protezione progressivamente minore.`
              : 'Il cerchio interno è il nucleo caldo. Il cerchio esterno offre protezione parziale: stare sul bordo può non bastare durante il gelo.'
            : hasWord(state, 'O_08')
              ? 'Riscalda le persone entro 15 metri, dentro il cerchio dorato. In Classica il calore è uniforme; il gelo può richiedere anche ripari e pelli.'
              : 'Riscalda le persone dentro il cerchio dorato. In Classica il calore è uniforme; durante il gelo aiutano anche ripari e pelli.'
          : 'Il focolare spento non riscalda le persone.',
        hint: !lit
          ? hasWord(state, 'O_08')
            ? 'Serve 1 legna per riaccenderlo.'
            : 'Serve legna per riaccenderlo.'
          : coversRest
            ? 'Il calore raggiunge tutta la zona in cui la tribù si addormenta. Controlla se la temperatura sta risalendo: una tormenta può richiedere anche ripari e pelli.'
            : 'Una parte del giaciglio della tribù è fuori dal calore. Durante il gelo servono anche ripari o vestiti.',
      };
    }
    if (building && ['storage', 'depot'].includes(building.kind))
      return {
        label: BUILDING_NAMES[building.kind],
        stage: 'Scorte consegnate',
        kind: 'stores',
        description: 'Aumenta lo spazio per conservare le risorse riportate all’accampamento.',
        hint: 'I materiali lasciati vicino agli alberi o alle rocce devono ancora essere trasportati.',
      };
    if (
      building?.kind === 'pen' &&
      state.playMode === 'guided' &&
      !building.cityId &&
      building.hp > 0 &&
      building.completed !== false &&
      !building.active
    )
      return {
        label: BUILDING_NAMES.pen,
        stage: 'In attesa di mangime',
        kind: 'stores',
        description: 'Il recinto ha interrotto la produzione perché mancava il mangime.',
        hint: hasWord(state, 'O_08')
          ? 'Consegna 5 vegetali, poi assegna di nuovo Addomesticare · Preda · Qui su questo recinto per riavviarlo.'
          : 'Consegna vegetali, poi assegna di nuovo Addomesticare · Preda · Qui su questo recinto per riavviarlo.',
      };
  }
  return null;
}
