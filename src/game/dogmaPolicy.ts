import type { Dogma, DogmaVector } from './types';

export const DOGMA_TARGETS = [
  'S_01',
  'S_02',
  'S_03',
  'S_04',
  'S_05',
  'S_06',
  'S_07',
  'S_08',
  'O_02',
  'O_03',
  'O_04',
  'O_05',
  'O_07',
  'O_12',
  'O_01',
  'O_06',
  'O_09',
  'O_10',
  'O_13',
  'O_14',
  'C_01',
  'M_05',
  'V_03',
  'V_09',
  'V_11',
  'V_13',
] as const;
export const DOGMA_FAMILIES: DogmaVector[] = [
  'prohibition',
  'veneration',
  'monopoly',
  'sacrifice',
  'protection',
  'sanctuary',
  'property',
  'martyr',
];
export const DOGMA_VECTOR_TOKENS = [
  'M_01',
  'C_02',
  'S_01',
  'S_02',
  'S_03',
  'S_04',
  'S_05',
  'S_06',
  'S_07',
  'S_08',
  'S_09',
  'V_02',
  'O_05',
  'V_05',
  'O_01',
  'M_04',
  'O_06',
];
export function dogmaFamily(vector: string): DogmaVector | null {
  if (vector === 'M_01') return 'prohibition';
  if (vector === 'C_02') return 'veneration';
  if (vector === 'M_04' || vector === 'S_01') return 'property';
  if (/^S_0[2-9]$/.test(vector)) return 'monopoly';
  if (vector === 'V_02' || vector === 'O_05') return 'sacrifice';
  if (vector === 'V_05') return 'protection';
  if (vector === 'O_01') return 'sanctuary';
  if (vector === 'O_06') return 'martyr';
  return null;
}

const physicalTargets = new Set([
  ...DOGMA_TARGETS.filter((t) => t.startsWith('S_')),
  'O_02',
  'O_03',
  'O_04',
  'O_05',
  'O_07',
  'O_12',
  'O_01',
  'O_06',
  'O_09',
  'O_10',
  'O_13',
]);
const consumableTargets = new Set([
  ...DOGMA_TARGETS.filter((t) => t.startsWith('S_')),
  'O_02',
  'O_03',
  'O_04',
  'O_05',
  'O_07',
  'O_12',
  'O_06',
]);
const renewableTargets = new Set([
  ...DOGMA_TARGETS.filter((t) => t.startsWith('S_')),
  'O_02',
  'O_03',
  'O_04',
  'O_07',
  'O_10',
]);

export interface DogmaPolicyCell {
  targetId: string;
  family: DogmaVector;
  allowed: boolean;
  reason: string;
}
/** Every cell has an explicit result; abstract quantities never become invented inventory. */
export function getDogmaPolicyCell(target: string, family: DogmaVector): DogmaPolicyCell {
  let reason = '';
  if (!(DOGMA_TARGETS as readonly string[]).includes(target))
    reason = 'Il concetto non è sacralizzabile.';
  else if (family === 'sacrifice' && !consumableTargets.has(target))
    reason = 'Questo concetto non è una quantità materiale o una persona da offrire.';
  else if (family === 'protection' && !renewableTargets.has(target))
    reason = 'La tutela richiede una casta, un nodo naturale o il Confine.';
  else if (family === 'sanctuary' && !physicalTargets.has(target))
    reason = 'Un santuario protegge persone o beni fisici, non concetti astratti.';
  else if (family === 'property' && !physicalTargets.has(target))
    reason = 'La proprietà richiede persone, beni o un luogo fisico.';
  return { targetId: target, family, allowed: !reason, reason };
}
export const DOGMA_POLICY_MATRIX = DOGMA_TARGETS.flatMap((target) =>
  DOGMA_FAMILIES.map((family) => getDogmaPolicyCell(target, family)),
);
export function getDogmaPolicy(target: string, vector: string): DogmaPolicyCell | null {
  const family = dogmaFamily(vector);
  return family ? getDogmaPolicyCell(target, family) : null;
}

type Pair = Pick<Dogma, 'targetId' | 'vectorId'>;
const key = (d: Pair) => `${d.targetId}|${d.vectorId}`;
const historicOpposites = [
  ['S_06|C_02', 'M_05|C_02'],
  ['S_05|M_01', 'S_05|O_01'],
  ['V_03|M_01', 'V_03|O_06'],
  ['S_03|S_07', 'S_04|S_07'],
];
function opposite(a: Pair, b: Pair) {
  if (key(a) === key(b)) return false;
  if (historicOpposites.some((pair) => pair.includes(key(a)) && pair.includes(key(b)))) return true;
  if (a.targetId !== b.targetId) return false;
  const left = dogmaFamily(a.vectorId),
    right = dogmaFamily(b.vectorId);
  if (left === 'prohibition' || right === 'prohibition') return true;
  if (left === 'property' && right === 'property') return a.vectorId !== b.vectorId;
  if (left === 'monopoly' && right === 'monopoly') return a.vectorId !== b.vectorId;
  return (
    (left === 'sacrifice' && ['protection', 'sanctuary'].includes(right ?? '')) ||
    (right === 'sacrifice' && ['protection', 'sanctuary'].includes(left ?? ''))
  );
}
export function getDogmaConflict(existing: readonly Pair[], target: string, vector: string) {
  const next = { targetId: target, vectorId: vector };
  const conflict = existing.find((d) => opposite(d, next));
  return conflict
    ? 'La nuova dottrina contraddice un dogma attivo: abolisci prima quello incompatibile.'
    : null;
}
/** A diplomatic relation pays the documented penalty once, not once per pair. */
export function dogmaDiplomaticPenalty(left: readonly Pair[], right: readonly Pair[]): 0 | -50 {
  return left.some((a) => right.some((b) => opposite(a, b))) ? -50 : 0;
}

/** These concrete opposites resolve the GDD's otherwise unspecified +25% mapping. */
export const DOGMA_OPPOSITES: Record<string, { tokens: string[]; description: string }> = {
  S_01: { tokens: ['S_02'], description: 'iniziativa individuale' },
  S_02: { tokens: ['S_01'], description: 'lavoro collettivo' },
  S_03: { tokens: ['S_04'], description: 'lavoro dei saggi' },
  S_04: { tokens: ['S_03'], description: 'lavoro dei forti' },
  S_05: { tokens: ['S_01'], description: 'produzione interna' },
  S_06: { tokens: ['M_05'], description: 'lavoro dei cittadini liberi' },
  S_07: { tokens: ['M_05'], description: 'lavoro senza sovrano' },
  S_08: { tokens: ['V_11'], description: 'commercio pacifico' },
  O_02: { tokens: ['O_03'], description: 'lavorazione del legno' },
  O_03: { tokens: ['O_02'], description: 'lavorazione della pietra' },
  O_04: { tokens: ['V_09'], description: 'agricoltura vegetariana; archetipo +40%' },
  O_05: { tokens: ['V_06'], description: 'lavorazione litica senza fuoco' },
  O_07: { tokens: ['V_06', 'O_02'], description: 'lavorazione litica senza metallo' },
  O_12: { tokens: ['V_11'], description: 'baratto senza moneta' },
  O_01: { tokens: ['V_01'], description: 'movimento fuori dalla tana' },
  O_06: { tokens: [], description: 'nascite anziché culto funerario' },
  O_09: { tokens: [], description: 'trasmissione orale; archetipo Attenzione250' },
  O_10: { tokens: ['V_01'], description: 'movimento oltre il perimetro' },
  O_13: { tokens: [], description: 'lavoro manuale; archetipo +25%' },
  O_14: { tokens: [], description: 'lavoro autonomo senza codice scritto' },
  C_01: { tokens: [], description: 'lavoro diurno' },
  M_05: { tokens: ['S_06'], description: 'lavoro servile' },
  V_03: { tokens: [], description: 'nascite pacifiche; archetipo +40%' },
  V_09: { tokens: ['V_10'], description: 'allevamento; archetipo +50%' },
  V_11: { tokens: ['V_09'], description: 'produzione agricola locale' },
  V_13: { tokens: ['V_05'], description: 'difesa del proprio territorio' },
};
