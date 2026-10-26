import { BUILDING_SPECS, WORD_ORDER, WORDS } from './content';
import { getDogmaVectors, SACRED_TARGETS } from './dogmas';
import { cognitiveSlots, compileSentence, getPredicate, SANCTIONS } from './grammar';
import { hasWord } from './runtime';
import type { GameState } from './types';

export const RECENT_PHRASE_LIMIT = 8;
export const STARTER_PHRASES = [
  ['S_01', 'V_02'],
  ['S_01', 'V_04', 'O_03'],
];

export interface SyntaxSuggestions {
  tokenIds: string[];
  nextLabel: string;
  explanation: string;
}

// These are the argument families accepted by the sentence compiler. Advice is
// about a grammatical continuation, not a promise that the order is executable:
// stocks, a target, institutions and dogmas are checked when it is pronounced.
const ARGUMENTS: Record<string, string[]> = {
  V_01: ['O_01', 'M_01', 'O_10', 'S_05', 'S_08'],
  V_02: ['O_04', 'O_06', 'M_04'],
  V_03: [
    'O_02',
    'O_03',
    'O_04',
    'O_07',
    'M_01',
    'M_02',
    'S_01',
    'S_02',
    'S_05',
    'S_06',
    'V_05',
    'S_08',
  ],
  V_04: [
    'O_02',
    'O_03',
    'O_04',
    'O_07',
    'O_12',
    'O_01',
    'O_05',
    'O_06',
    'O_09',
    'O_10',
    'O_11',
    'M_04',
    'S_05',
    'S_07',
    'S_09',
    'M_02',
  ],
  V_05: ['O_02', 'O_03', 'O_04', 'O_07', 'O_12', 'M_02', 'O_05', 'O_09', 'O_01'],
  V_06: ['O_02', 'O_03', 'M_03', 'O_09'],
  V_07: ['O_05', 'O_04', 'O_02'],
  V_09: ['O_04', 'O_01', 'O_03'],
  V_10: ['O_04', 'O_01', 'M_01', 'S_08'],
  V_11: ['O_02', 'O_03', 'O_04', 'O_07', 'O_12', 'S_05', 'S_06', 'S_08'],
  V_12: ['O_07', 'O_05', 'V_03', 'S_08', 'O_08'],
  V_13: ['S_09', 'S_05', 'O_10', 'M_02'],
  V_14: ['S_07', 'M_05', 'M_03', ...SACRED_TARGETS],
};

/** Only complete known recipes are consulted; undiscovered blueprints stay hidden. */
function knownConstructionNext(
  state: GameState,
  verb: string,
  args: string[],
  leadingSlots: number,
) {
  const sequence = [verb, ...args];
  const recipes = Object.values(BUILDING_SPECS).map((spec) => spec.recipe);
  if (verb === 'V_08') recipes.push(['V_08', 'O_01', 'O_10'], ['V_08', 'O_13', 'S_08']);
  return recipes
    .filter(
      (recipe) =>
        recipe.length + leadingSlots <= cognitiveSlots(state) &&
        recipe.every((id) => hasWord(state, id)) &&
        sequence.every((id, index) => recipe[index] === id) &&
        sequence.length < recipe.length,
    )
    .map((recipe) => recipe[sequence.length]);
}

// The sacred token can occur in any position, while the target must precede its
// vector after Sacro is removed. Some orders coincide with ordinary subject/verb
// grammar, so ask the real compiler before offering a sacred continuation.
const SACRED_PHRASES = [
  ...SACRED_TARGETS.flatMap((target) =>
    getDogmaVectors(target).flatMap((vector) => [
      [target, 'M_03', vector],
      ['M_03', target, vector],
      [target, vector, 'M_03'],
    ]),
  ),
  ['S_04', 'C_02', 'M_04'],
];

function knownSacredNext(state: GameState, prefix: string[]) {
  if (state.tier < 2 || !hasWord(state, 'M_03') || cognitiveSlots(state) < 3) return [];
  const next = new Set<string>();
  for (const phrase of SACRED_PHRASES) {
    if (
      phrase.length <= prefix.length ||
      next.has(phrase[prefix.length]) ||
      !prefix.every((id, index) => phrase[index] === id) ||
      !phrase.every((id) => hasWord(state, id))
    )
      continue;
    const compiled = compileSentence(state, phrase);
    if (compiled.valid && compiled.kind === 'dogma') next.add(phrase[prefix.length]);
  }
  return [...next];
}

export function getSyntaxSuggestions(state: GameState, tokens: string[]): SyntaxSuggestions {
  const sacredNext = knownSacredNext(state, tokens);
  const result = (ids: string[], nextLabel: string, explanation: string): SyntaxSuggestions => ({
    tokenIds: WORD_ORDER.filter(
      (id) => (ids.includes(id) || sacredNext.includes(id)) && hasWord(state, id),
    ),
    nextLabel,
    explanation,
  });
  if (tokens.length >= cognitiveSlots(state))
    return result(
      [],
      'Frase completa',
      'Puoi rivedere la frase e scegliere il bersaglio prima di pronunciarla.',
    );
  if (tokens.some((id) => !WORDS[id] || !hasWord(state, id)))
    return result([], 'Rivedi la frase', 'Una parola della frase non è più disponibile.');
  const complete = tokens.length >= 3 ? compileSentence(state, tokens) : undefined;
  if (complete?.valid && complete.kind === 'dogma')
    return result([], 'Regola sacra completa', 'Puoi rivedere il dogma prima di pronunciarlo.');
  if (!tokens.length)
    return result(
      WORD_ORDER.filter(
        (id) =>
          WORDS[id].kind === 'S' ||
          (id === 'C_01' && state.tier >= 1) ||
          (id === 'C_02' && state.tier >= 3),
      ),
      sacredNext.length ? 'Chi, quando o che cosa è sacro?' : 'Chi o quando?',
      sacredNext.length
        ? 'Inizia da un soggetto, una condizione oppure un concetto da legare a una regola sacra.'
        : 'Inizia da un soggetto oppure da una condizione. Le altre parole restano disponibili.',
    );
  const predicate = getPredicate(tokens);
  const conditionLength = predicate.condition ? 1 : 0;
  if (tokens.length === conditionLength)
    return result(
      WORD_ORDER.filter((id) => WORDS[id].kind === 'S'),
      'Chi?',
      'La condizione precede il soggetto della frase.',
    );
  if (tokens.length === 5 && tokens[4] === 'C_03' && state.tier >= 4 && cognitiveSlots(state) >= 6)
    return result(SANCTIONS, 'Quale sanzione?', 'Completa la legge con una sanzione conosciuta.');
  if (tokens.includes('C_03'))
    return result(
      [],
      'Rivedi la legge',
      'Altrimenti occupa il quinto spazio; la sanzione lo segue.',
    );

  // Sacred sentences use their existing target/vector grammar, including when
  // the chosen target is an object rather than an ordinary subject.
  if (tokens.includes('M_03') && WORDS[predicate.verb]?.kind !== 'V') {
    const target = tokens.find((id) => id !== 'M_03');
    return result(
      [],
      target ? 'Quale regola sacra?' : 'Che cosa è sacro?',
      'La Pietra Sacra lega un concetto a un vettore dogmatico conosciuto.',
    );
  }
  if (WORDS[predicate.subject]?.kind !== 'S')
    return result(
      [],
      sacredNext.length ? 'Completa la regola sacra' : 'Rivedi il soggetto',
      'Gli ordini iniziano con un soggetto; i dogmi seguono la grammatica della Pietra Sacra.',
    );
  if (!predicate.verb)
    return result(
      [
        ...WORD_ORDER.filter(
          (id) =>
            WORDS[id].kind === 'V' &&
            (id !== 'V_13' || predicate.subject === 'S_08') &&
            (id !== 'V_14' || predicate.subject === 'S_04'),
        ),
        ...(tokens.join('|') === 'C_02|S_01' && state.tier >= 3 ? ['M_05'] : []),
      ],
      sacredNext.length ? 'Azione o regola sacra?' : 'Cosa fa?',
      sacredNext.length
        ? 'Scegli un’azione oppure lega questo soggetto a una regola sacra.'
        : 'Scegli un’azione per il soggetto.',
    );
  if (tokens.join('|') === 'S_04|C_02' && state.tier >= 2 && hasWord(state, 'M_03'))
    return result(
      ['M_04'],
      'Quale regola sacra?',
      'La gerontocrazia storica lega gli anziani alla proprietà del sapere.',
    );
  if (WORDS[predicate.verb]?.kind !== 'V')
    return result(
      [],
      sacredNext.length ? 'Completa la regola sacra' : 'Rivedi l’azione',
      sacredNext.length
        ? 'Aggiungi Sacro per completare il dogma.'
        : 'Dopo il soggetto serve un verbo.',
    );

  // At four unconditioned slots the law grammar permits Altrimenti. The usual
  // direct-order arguments remain suggestions as well; this never forces a law.
  const lawNext =
    state.tier >= 4 && cognitiveSlots(state) >= 6 && tokens.length === 4 && conditionLength === 0
      ? ['C_03']
      : [];
  const construction = knownConstructionNext(
    state,
    predicate.verb,
    predicate.args,
    conditionLength + 1,
  );
  if (predicate.verb === 'V_08')
    return result(
      [...construction, ...lawNext],
      'Con quali materiali?',
      'Sono evidenziate le continuazioni delle ricette edilizie interamente conosciute.',
    );

  let args = (ARGUMENTS[predicate.verb] ?? []).filter((id) => !predicate.args.includes(id));
  if (predicate.verb === 'V_14') {
    args = args.filter(
      (id) =>
        id === 'S_07' ||
        id === 'M_05' ||
        id === 'M_03' ||
        state.dogmas.some((dogma) => dogma.targetId === id),
    );
  }
  if (predicate.verb === 'V_09')
    args = args.filter(
      (id) => !predicate.args.includes('O_03') && (id !== 'O_03' || !predicate.args.length),
    );
  const remaining = cognitiveSlots(state) - tokens.length - 1;
  args = args.filter((candidate) => {
    const after = [...predicate.args, candidate];
    const canSupply = (required: string[]) =>
      required.every((id) => hasWord(state, id)) &&
      required.filter((id) => !after.includes(id)).length <= remaining;
    if (predicate.verb === 'V_07')
      return canSupply(['O_05', 'O_04']) || canSupply(['O_05', 'O_02']);
    if (predicate.verb === 'V_05' && after.includes('O_04')) return canSupply(['M_02']);
    return true;
  });
  // Put the required ingredient first in the visual recommendations without
  // removing alternative known arguments or introducing an unknown word.
  if (['V_06', 'V_07', 'V_09', 'V_10', 'V_12'].includes(predicate.verb)) {
    const required = { V_06: 'O_02', V_07: 'O_05', V_09: 'O_04', V_10: 'O_04', V_12: 'O_07' }[
      predicate.verb
    ];
    if (
      required &&
      !predicate.args.includes(required) &&
      tokens.length + 1 >= cognitiveSlots(state)
    )
      args = args.filter((id) => id === required);
  }
  const lawMeasure =
    state.tier >= 4 &&
    cognitiveSlots(state) >= 6 &&
    conditionLength === 0 &&
    tokens.length === 3 &&
    hasWord(state, 'C_03')
      ? WORD_ORDER.filter((id) => ['O', 'M'].includes(WORDS[id].kind))
      : [];
  return result(
    [...args, ...construction, ...lawMeasure, ...lawNext],
    lawNext.length ? 'Come, oppure una legge?' : 'Con cosa o come?',
    lawNext.length
      ? 'Puoi completare l’ordine oppure aggiungere Altrimenti e una sanzione. La frase verrà ricontrollata alla pronuncia.'
      : 'Le parole segnate proseguono la sintassi dell’azione. Bersaglio, scorte e vincoli restano da verificare.',
  );
}

/** Recall never truncates a sentence or silently discards a forgotten concept. */
export function phraseRecallIssue(state: GameState, tokens: string[]): string | undefined {
  if (tokens.length > cognitiveSlots(state))
    return 'La frase supera gli spazi di pensiero attualmente disponibili.';
  if (tokens.some((id) => !WORDS[id] || !hasWord(state, id)))
    return 'La frase contiene una parola perduta o non più disponibile.';
  return undefined;
}

export function rememberRecentPhrase(history: string[][], tokens: string[]) {
  const key = tokens.join('|');
  return [[...tokens], ...history.filter((phrase) => phrase.join('|') !== key)].slice(
    0,
    RECENT_PHRASE_LIMIT,
  );
}
