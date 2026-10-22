import { BUILDING_NAMES } from '../game/content';
import { hasWord } from '../game/runtime';
import type { GameState, MapEntity, WorldTarget } from '../game/types';
import { groundPileFor, resourcePileLabel } from './mapResourceLayout';

export interface TargetPresentation {
  label: string;
  stage: string;
  kind: 'source' | 'ground' | 'carcass' | 'food' | 'stores' | 'landmark';
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
  if (target.type === 'entity') {
    const entity = state.entities.find((e) => e.id === target.id);
    return entity ? entityTargetPresentation(state, entity) : null;
  }
  if (target.type === 'building') {
    const building = state.buildings.find((b) => b.id === target.id);
    if (building && ['storage', 'depot'].includes(building.kind))
      return {
        label: BUILDING_NAMES[building.kind],
        stage: 'Scorte consegnate',
        kind: 'stores',
        description: 'Aumenta lo spazio per conservare le risorse riportate all’accampamento.',
        hint: 'I materiali lasciati vicino agli alberi o alle rocce devono ancora essere trasportati.',
      };
  }
  return null;
}
