import { BUILDING_SPECS, WORD_ORDER, WORDS } from './content';
import { getDogmaVectors, SACRED_TARGETS } from './dogmas';
import { cognitiveSlots, compileSentence, getPredicate, SANCTIONS } from './grammar';
import { hasWord } from './runtime';
import type { Compilation, GameState, Target } from './types';

export const RECENT_PHRASE_LIMIT = 8;
export const STARTER_PHRASES = [
  ['S_01', 'V_02'],
  ['S_01', 'V_04', 'O_03'],
];

export interface SyntaxSuggestions {
  tokenIds: string[];
  nextLabel: string;
  explanation: string;
  /** Grammar is complete even if a target, materials or an institution is still missing. */
  isComplete: boolean;
  hasContinuations: boolean;
  /** These tokens can continue only through the six-slot law grammar. */
  lawOnlyTokenIds: string[];
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
function knownConstructionNext(state: GameState, tokens: string[]) {
  const predicate = getPredicate(tokens);
  const sequence = [predicate.verb, ...predicate.args];
  const leading = predicate.condition ? 2 : 1;
  const recipes = Object.values(BUILDING_SPECS).map((spec) => spec.recipe);
  if (predicate.verb === 'V_08') recipes.push(['V_08', 'O_01', 'O_10'], ['V_08', 'O_13', 'S_08']);
  return recipes
    .filter(
      (recipe) =>
        recipe.length + leading <= cognitiveSlots(state) &&
        recipe.every((id) => hasWord(state, id)) &&
        sequence.every((id, index) => recipe[index] === id) &&
        sequence.length < recipe.length,
    )
    .map((recipe) => recipe[sequence.length]);
}

// These paths are grammar, including object-first and verb-first sacred rules.
// Removing Sacro must leave the target before its vector, just as the compiler does.
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

/** Grammar must not disappear just because the fire is out or the palace is unpaid.
 * A shallow view adds only the three institutional grammar gates. It never grants
 * a word/resource/building to the live state and is never passed to issueCommand.
 */
function syntaxState(state: GameState): GameState {
  return {
    ...state,
    gameOver: null,
    dogmas: [],
    buildings: [
      ...state.buildings,
      ...(['campfire', 'palace', 'school'] as const).map((kind) => ({
        id: `syntax-only-${kind}`,
        kind,
        x: state.home.x,
        y: state.home.y,
        hp: 1,
        active: true,
        completed: true,
      })),
    ],
  };
}
const syntaxTarget: Target = { type: 'entity', id: 'syntax-only-target', x: 0, y: 0 };
const isPrefix = (prefix: string[], phrase: string[]) => prefix.every((id, i) => phrase[i] === id);
const known = (state: GameState, ids: string[]) => ids.filter((id) => hasWord(state, id));

function sacredPhrases(state: GameState) {
  if (state.tier < 2 || !hasWord(state, 'M_03')) return [];
  return SACRED_PHRASES.filter(
    (phrase) =>
      phrase.length <= cognitiveSlots(state) &&
      phrase.every((id) => hasWord(state, id)) &&
      compileSentence(state, phrase).kind === 'dogma',
  );
}

/** Ordinary orders avoid duplicate arguments and terminal decorations. To change
 * a recipe's product, remove its existing ingredient instead of appending junk.
 */
function ordinaryNext(state: GameState, tokens: string[], compiled: Compilation) {
  if (tokens.length >= cognitiveSlots(state) || tokens.includes('C_03')) return [];
  const p = getPredicate(tokens),
    conditionLength = p.condition ? 1 : 0;
  if (p.condition && (p.condition === 'C_02' ? state.tier < 3 : state.tier < 1)) return [];
  if (!tokens.length)
    return known(state, [
      ...WORD_ORDER.filter((id) => WORDS[id].kind === 'S'),
      ...(state.tier >= 1 ? ['C_01'] : []),
      ...(state.tier >= 3 ? ['C_02'] : []),
    ]);
  if (tokens.length === conditionLength)
    return known(
      state,
      WORD_ORDER.filter((id) => WORDS[id].kind === 'S'),
    );
  if (WORDS[p.subject]?.kind !== 'S') return [];
  if (!p.verb)
    return known(state, [
      ...WORD_ORDER.filter(
        (id) =>
          WORDS[id].kind === 'V' &&
          (id !== 'V_13' || p.subject === 'S_08') &&
          (id !== 'V_14' || p.subject === 'S_04'),
      ),
      ...(tokens.join('|') === 'C_02|S_01' ? ['M_05'] : []),
    ]);
  if (WORDS[p.verb]?.kind !== 'V') return [];
  if ((p.verb === 'V_13' && p.subject !== 'S_08') || (p.verb === 'V_14' && p.subject !== 'S_04'))
    return [];
  if (new Set(p.args).size !== p.args.length) return [];
  if (
    compiled.valid &&
    (['building', 'cooking', 'planting', 'reforming', 'emancipating'].includes(
      compiled.action ?? '',
    ) ||
      (p.verb === 'V_06' && p.args.includes('O_03')) ||
      (p.verb === 'V_05' && ['guarding', 'saving'].includes(compiled.action ?? '')))
  )
    return [];
  if (p.verb === 'V_08') return knownConstructionNext(state, tokens);
  if (p.verb === 'V_05' && compiled.valid && compiled.action === 'copying')
    return hasWord(state, 'M_02') && !p.args.includes('M_02') ? ['M_02'] : [];
  if (p.verb === 'V_09' && p.args.includes('O_03')) return [];
  return known(state, [
    ...new Set([
      ...(ARGUMENTS[p.verb] ?? []).filter((id) => !p.args.includes(id)),
      ...knownConstructionNext(state, tokens),
    ]),
  ]);
}

function legalNext(state: GameState, tokens: string[]) {
  if (
    state.tier < 4 ||
    cognitiveSlots(state) < 6 ||
    !hasWord(state, 'C_03') ||
    !SANCTIONS.some((id) => hasWord(state, id)) ||
    tokens.length >= 6
  )
    return [];
  if (tokens.some((id) => !hasWord(state, id))) return [];
  if (tokens.length >= 1 && WORDS[tokens[0]]?.kind !== 'S') return [];
  if (tokens.length >= 2 && WORDS[tokens[1]]?.kind !== 'V') return [];
  if (tokens.slice(0, 4).includes('C_03')) return [];
  if (tokens.length >= 5 && tokens[4] !== 'C_03') return [];
  switch (tokens.length) {
    case 0:
      return known(
        state,
        WORD_ORDER.filter((id) => WORDS[id].kind === 'S'),
      );
    case 1:
      return known(
        state,
        WORD_ORDER.filter((id) => WORDS[id].kind === 'V'),
      );
    // The law compiler permits every known concept in these two positions,
    // including action tokens (for example Colpire when regulating forged arms).
    // Ordinary orders retain their narrower verb-specific argument families.
    case 2:
    case 3:
      return known(
        state,
        WORD_ORDER.filter((id) => id !== 'C_03'),
      );
    case 4:
      return ['C_03'];
    case 5:
      return known(state, SANCTIONS);
    default:
      return [];
  }
}

function buildSyntaxSuggestions(state: GameState, tokens: string[]): SyntaxSuggestions {
  const capacity = cognitiveSlots(state);
  const available = tokens.every((id) => !!WORDS[id] && hasWord(state, id));
  const syntax = syntaxState(state);
  const phrases = sacredPhrases(state);
  const compile = (phrase: string[]) => compileSentence(syntax, phrase, syntaxTarget);
  const current = available ? compile(tokens) : undefined;
  const isSacred = phrases.some(
    (phrase) => phrase.length === tokens.length && isPrefix(tokens, phrase),
  );
  // Sacred conflicts are real grammar choices. Direct taboo enforcement belongs
  // to the order preview and must not erase the player's vocabulary here.
  const isComplete =
    available &&
    tokens.length <= capacity &&
    (isSacred || (!!current?.valid && current.kind !== 'dogma'));
  const memo = new Map<string, boolean>();
  const canFinishOrdinary = (prefix: string[]): boolean => {
    const key = prefix.join('|');
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const p = getPredicate(prefix);
    if (
      prefix.length > capacity ||
      prefix.includes('C_03') ||
      new Set(p.args).size !== p.args.length
    )
      return false;
    const compiled = compile(prefix);
    if (compiled.valid && compiled.kind !== 'dogma') {
      memo.set(key, true);
      return true;
    }
    if (prefix.length >= capacity) {
      memo.set(key, false);
      return false;
    }
    // All branches strictly add one token; finite slot capacity bounds the search.
    const valid = ordinaryNext(state, prefix, compiled).some((id) =>
      canFinishOrdinary([...prefix, id]),
    );
    memo.set(key, valid);
    return valid;
  };
  const ordinary =
    available && tokens.length < capacity
      ? ordinaryNext(state, tokens, current ?? compile(tokens)).filter((id) =>
          canFinishOrdinary([...tokens, id]),
        )
      : [];
  const sacred =
    available && tokens.length < capacity
      ? phrases
          .filter((phrase) => phrase.length > tokens.length && isPrefix(tokens, phrase))
          .map((phrase) => phrase[tokens.length])
      : [];
  const legal = available && tokens.length < capacity ? legalNext(state, tokens) : [];
  const choices = new Set([...ordinary, ...sacred, ...legal]);
  // Once a sacred rule is complete it remains a three-token institution. The
  // historical Saggio/Sempre/Mio exception must not grow into a malformed order.
  const tokenIds = isSacred ? [] : WORD_ORDER.filter((id) => choices.has(id) && hasWord(state, id));
  const lawOnlyTokenIds = tokenIds.filter(
    (id) => legal.includes(id) && !ordinary.includes(id) && !sacred.includes(id),
  );
  let nextLabel = 'Con cosa o come?';
  let explanation =
    'Scegli come continuare la frase. L’anteprima verifica bersaglio, materiali e regole della comunità.';
  if (!available || tokens.length > capacity) {
    nextLabel = 'Rivedi la frase';
    explanation = 'Rimuovi una parola perduta o fuori dagli spazi disponibili.';
  } else if (isSacred) {
    nextLabel = 'Regola sacra pronta';
    explanation = 'La frase sacra è completa. Verifica l’anteprima prima di pronunciarla.';
  } else if (isComplete && !tokenIds.length) {
    nextLabel = 'Frase pronta';
    explanation = 'Non serve riempire tutti gli spazi: verifica bersaglio e costi, poi pronuncia.';
  } else if (isComplete) {
    nextLabel = 'Frase pronta · puoi aggiungere dettagli';
    explanation =
      'Puoi già pronunciare questa frase dopo aver verificato il bersaglio. Le altre parole permettono varianti o una legge.';
  } else if (!tokenIds.length) {
    nextLabel = 'Frase da correggere';
    explanation =
      'Le parole conosciute non completano questa frase negli spazi disponibili. Modifica una parola o cerca nel catalogo.';
  } else if (!tokens.length) {
    nextLabel = sacred.length ? 'Chi, quando o che cosa è sacro?' : 'Chi?';
    explanation =
      'Scegli chi agisce. Le condizioni e le regole sacre compaiono quando sono conosciute.';
  } else if (tokens.at(-1) === 'C_03') {
    nextLabel = 'Quale sanzione?';
    explanation = 'Completa la legge con una conseguenza conosciuta.';
  } else {
    const p = getPredicate(tokens);
    if (tokens.length === (p.condition ? 1 : 0)) nextLabel = 'Chi?';
    else if (WORDS[p.subject]?.kind === 'S' && !p.verb) nextLabel = 'Cosa fa?';
    else if (ordinary.length === 0 && legal.length > 0) {
      nextLabel = tokens.length === 3 ? 'Quale misura o condizione?' : 'Completa la legge';
      explanation =
        'Stai continuando una legge a sei spazi. Specifica il dovere e la condizione, poi aggiungi Altrimenti e la conseguenza.';
    } else if (p.verb === 'V_08') nextLabel = 'Con quali materiali?';
    else if (tokens.includes('M_03')) nextLabel = 'Completa la regola sacra';
  }
  return {
    tokenIds,
    nextLabel,
    explanation,
    isComplete,
    hasContinuations: tokenIds.length > 0,
    lawOnlyTokenIds,
  };
}

// Grammar depends on known concepts, capacity and sacred conflicts, not on each
// walking frame. Bound the cache and return fresh arrays so callers cannot alter it.
const guidanceCache = new Map<string, SyntaxSuggestions>();
export function getSyntaxSuggestions(state: GameState, tokens: string[]): SyntaxSuggestions {
  const key = [
    state.tier,
    Number(!!state.lockedSlot),
    Number(!!state.gameOver),
    WORD_ORDER.filter((id) => hasWord(state, id)).join(','),
    state.dogmas.map((dogma) => `${dogma.targetId}:${dogma.vectorId}`).join(','),
    tokens.join('|'),
  ].join('/');
  let result = guidanceCache.get(key);
  if (!result) {
    result = buildSyntaxSuggestions(state, tokens);
    guidanceCache.set(key, result);
    if (guidanceCache.size > 128) guidanceCache.delete(guidanceCache.keys().next().value!);
  }
  return {
    ...result,
    tokenIds: [...result.tokenIds],
    lawOnlyTokenIds: [...result.lawOnlyTokenIds],
  };
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
