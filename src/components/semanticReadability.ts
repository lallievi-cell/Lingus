import type { Resource } from '../game/types';

/** Presentation only. The tribe's knowledge of Numero still decides whether
 * exact values are shown; none of these labels changes a simulation value. */
const italianNumber = new Intl.NumberFormat('it-IT', {
  maximumFractionDigits: 1,
  useGrouping: true,
});

export function formatVisibleNumber(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value > 0 && value < 0.1 ? '<0,1' : italianNumber.format(value);
}

/** Standalone value for a resource explicitly labelled Attenzione. */
export function describeAttention(value: number, numbered: boolean, maximum = 100) {
  if (!Number.isFinite(value)) return 'Non disponibile';
  if (numbered) return formatVisibleNumber(value);
  if (value <= 0) return 'Nessuna';
  if (value < 5) return 'Pochissima';
  if (value < 20) return 'Poca';
  return value >= maximum ? 'Al massimo' : 'Disponibile';
}

/** Full phrases: these are physical conditions, not amounts of a material. */
export function describeHealth(value: number, numbered: boolean) {
  if (!Number.isFinite(value)) return 'Salute non disponibile';
  if (numbered) return `Salute ${formatVisibleNumber(value)}`;
  if (value <= 0) return 'Vita conclusa';
  if (value <= 30) return 'Salute critica';
  return value < 70 ? 'Salute fragile' : 'In buona salute';
}

export function describeHunger(value: number, numbered: boolean, sex: 'M' | 'F' = 'M') {
  if (!Number.isFinite(value)) return 'Fame non disponibile';
  const condition =
    value < 20
      ? sex === 'F'
        ? 'Sazia'
        : 'Sazio'
      : value < 75
        ? 'Ha fame'
        : value < 95
          ? sex === 'F'
            ? 'Affamata'
            : 'Affamato'
          : 'Fame estrema';
  return numbered ? `${condition} · Fame ${formatVisibleNumber(value)}/100` : condition;
}

/** Forza and Intelligenza share a feminine noun and a real one-to-ten scale. */
export function describeAbility(value: number, numbered: boolean) {
  if (!Number.isFinite(value)) return 'non disponibile';
  if (numbered) return formatVisibleNumber(value);
  if (value <= 0) return 'assente';
  if (value < 5) return 'modesta';
  if (value < 7) return 'nella media';
  return value < 10 ? 'elevata' : 'eccezionale';
}

export function describeCohesion(value: number, numbered: boolean) {
  if (!Number.isFinite(value)) return 'Non disponibile';
  if (numbered) return `${formatVisibleNumber(value)}%`;
  if (value <= 0) return 'Dissolta';
  if (value < 25) return 'In crisi';
  if (value < 50) return 'Fragile';
  if (value < 75) return 'Unita';
  return 'Salda';
}

type PeopleGroup = 'population' | 'people' | 'workers' | 'warriors' | 'sages' | 'slaves';
const peopleForms: Record<
  PeopleGroup,
  { one: string; many: string; none: string; female?: boolean }
> = {
  population: { one: 'abitante', many: 'abitanti', none: 'Nessun abitante' },
  people: { one: 'persona', many: 'persone', none: 'Nessuna persona', female: true },
  workers: { one: 'lavoratore', many: 'lavoratori', none: 'Nessun lavoratore' },
  warriors: { one: 'guerriero', many: 'guerrieri', none: 'Nessun guerriero' },
  sages: { one: 'saggio', many: 'saggi', none: 'Nessun saggio' },
  slaves: { one: 'schiavo', many: 'schiavi', none: 'Nessuno schiavo' },
};

/** Full noun phrase, including agreement. Do not append another unit label. */
export function describePeople(value: number, numbered: boolean, group: PeopleGroup = 'people') {
  const forms = peopleForms[group];
  if (!Number.isFinite(value)) return 'Presenza non disponibile';
  if (numbered) return `${formatVisibleNumber(value)} ${value === 1 ? forms.one : forms.many}`;
  if (value <= 0) return forms.none;
  if (value < 5) return `${forms.female ? 'Poche' : 'Pochi'} ${forms.many}`;
  if (value < 20) return `Un piccolo gruppo di ${forms.many}`;
  if (value >= 100) return `${forms.female ? 'Moltissime' : 'Moltissimi'} ${forms.many}`;
  return `${forms.female ? 'Molte' : 'Molti'} ${forms.many}`;
}

interface ResourceLanguage {
  noun: string;
  singular?: string;
  none: string;
  little: string;
  enough: string;
  much: string;
  abundant: string;
}
const materialForms: Record<Resource, ResourceLanguage> = {
  food: {
    noun: 'cibo vegetale',
    none: 'Nessun cibo vegetale',
    little: 'Poco',
    enough: 'Un po’ di',
    much: 'Molto',
    abundant: 'Cibo vegetale in abbondanza',
  },
  meat: {
    noun: 'carne',
    none: 'Nessuna carne',
    little: 'Poca',
    enough: 'Un po’ di',
    much: 'Molta',
    abundant: 'Carne in abbondanza',
  },
  cooked: {
    noun: 'cibo cotto',
    none: 'Nessun cibo cotto',
    little: 'Poco',
    enough: 'Un po’ di',
    much: 'Molto',
    abundant: 'Cibo cotto in abbondanza',
  },
  wood: {
    noun: 'legno',
    none: 'Niente legno',
    little: 'Poco',
    enough: 'Un po’ di',
    much: 'Molto',
    abundant: 'Legno in abbondanza',
  },
  stone: {
    noun: 'pietra',
    none: 'Nessuna pietra',
    little: 'Poca',
    enough: 'Un po’ di',
    much: 'Molta',
    abundant: 'Pietra in abbondanza',
  },
  pelt: {
    noun: 'pelli',
    singular: 'pelle',
    none: 'Nessuna pelle',
    little: 'Poche',
    enough: 'Alcune',
    much: 'Molte',
    abundant: 'Pelli in abbondanza',
  },
  seed: {
    noun: 'semi',
    singular: 'seme',
    none: 'Nessun seme',
    little: 'Pochi',
    enough: 'Alcuni',
    much: 'Molti',
    abundant: 'Semi in abbondanza',
  },
  ore: {
    noun: 'minerale',
    none: 'Nessun minerale',
    little: 'Poco',
    enough: 'Un po’ di',
    much: 'Molto',
    abundant: 'Minerale in abbondanza',
  },
  ingot: {
    noun: 'lingotti',
    singular: 'lingotto',
    none: 'Nessun lingotto',
    little: 'Pochi',
    enough: 'Alcuni',
    much: 'Molti',
    abundant: 'Lingotti in abbondanza',
  },
  tool: {
    noun: 'utensili',
    singular: 'utensile',
    none: 'Nessun utensile',
    little: 'Pochi',
    enough: 'Alcuni',
    much: 'Molti',
    abundant: 'Utensili in abbondanza',
  },
  spear: {
    noun: 'lance',
    singular: 'lancia',
    none: 'Nessuna lancia',
    little: 'Poche',
    enough: 'Alcune',
    much: 'Molte',
    abundant: 'Lance in abbondanza',
  },
  pottery: {
    noun: 'ceramica',
    none: 'Nessuna ceramica',
    little: 'Poca',
    enough: 'Un po’ di',
    much: 'Molta',
    abundant: 'Ceramica in abbondanza',
  },
  metalArms: {
    noun: 'armi di metallo',
    singular: 'arma di metallo',
    none: 'Nessun’arma di metallo',
    little: 'Poche',
    enough: 'Alcune',
    much: 'Molte',
    abundant: 'Armi di metallo in abbondanza',
  },
  coin: {
    noun: 'monete',
    singular: 'moneta',
    none: 'Nessuna moneta',
    little: 'Poche',
    enough: 'Alcune',
    much: 'Molte',
    abundant: 'Monete in abbondanza',
  },
};

/** Keeps the existing material bands, while agreeing with each actual noun. */
export function describeResourceAmount(resource: Resource, value: number, numbered: boolean) {
  const forms = materialForms[resource];
  if (!Number.isFinite(value)) return `${forms.noun}: quantità non disponibile`;
  if (numbered)
    return `${formatVisibleNumber(value)} ${value === 1 ? (forms.singular ?? forms.noun) : forms.noun}`;
  if (value <= 0) return forms.none;
  if (value >= 100) return forms.abundant;
  return `${value < 5 ? forms.little : value < 20 ? forms.enough : forms.much} ${forms.noun}`;
}
