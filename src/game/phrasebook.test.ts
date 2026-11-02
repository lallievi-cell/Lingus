import { describe, expect, it } from 'vitest';
import { createGame, issueCommand, parseGame, serializeGame } from './engine';
import { BUILDING_ORDER, WORD_ORDER } from './content';
import { compileSentence, resolveConstruction } from './grammar';
import {
  buildingPurpose,
  getPhrasebook,
  PHRASEBOOK_LIMIT,
  phraseKey,
  rememberPhrase,
  togglePhraseFavorite,
  validPhrasebook,
} from './phrasebook';
import type { GameState, PhrasebookEntry } from './types';

const movement = ['S_01', 'V_01'];
const wood = ['S_01', 'V_04', 'O_03'];

function knownCamp(mode: 'guided' | 'classic' = 'guided') {
  const state = createGame(6842, mode);
  state.started = true;
  state.tier = 5;
  for (const id of WORD_ORDER) {
    state.words[id] = { retention: 100, custodians: state.units.map((unit) => unit.id), uses: 0 };
    for (const unit of state.units) if (!unit.knows.includes(id)) unit.knows.push(id);
  }
  return state;
}

function entry(tokens = movement, time = 0): PhrasebookEntry {
  return {
    id: phraseKey(tokens),
    tokens: [...tokens],
    favorite: false,
    firstUsedAt: time,
    lastUsedAt: time,
  };
}

/** Distinct grammatical references exercise capacity only, not execution of these orders. */
function references() {
  const destinations = [
    [],
    ['O_01'],
    ['M_01'],
    ['O_10'],
    ['S_05'],
    ['S_08'],
    ['O_01', 'M_01'],
    ['O_10', 'M_01'],
    ['O_01', 'O_10'],
    ['S_05', 'O_10'],
    ['O_01', 'S_08'],
  ];
  return ['S_01', 'S_02', 'S_03', 'S_04', 'S_06', 'S_07'].flatMap((subject) =>
    destinations.map((args) => [subject, 'V_01', ...args]),
  );
}

describe('persistent player phrasebook', () => {
  it('shows useful innate actions without exposing unknown recipes or mutating the world', () => {
    const state = createGame(6842, 'guided'),
      before = structuredClone(state);
    const book = getPhrasebook(state);
    expect(book.map((item) => item.id)).toEqual(
      expect.arrayContaining([phraseKey(movement), 'S_01|V_02', 'S_01|V_03']),
    );
    expect(book.every((item) => !item.used && !item.favorite && item.available)).toBe(true);
    expect(book.some((item) => item.category === 'construction')).toBe(false);
    expect(book.some((item) => item.tokens.includes('O_03'))).toBe(false);
    expect(state).toEqual(before);
  });

  it('reveals the twenty known construction references with a grammatical fire order', () => {
    const state = knownCamp();
    const constructions = getPhrasebook(state).filter((item) => item.category === 'construction');
    expect(new Set(constructions.map((item) => item.buildingKind))).toEqual(
      new Set(BUILDING_ORDER),
    );
    const fire = constructions.find((item) => item.buildingKind === 'campfire')!;
    expect(fire.tokens).toEqual(['S_01', 'V_05', 'O_05']);
    expect(compileSentence(state, fire.tokens)).toMatchObject({ valid: true, action: 'guarding' });
    expect(fire.description).toContain('Accende il primo Falò');
    expect(
      constructions.every(
        (item) => item.firstUsedAt === undefined && item.lastUsedAt === undefined,
      ),
    ).toBe(true);
  });

  it('keeps known long recipes visible while explaining the current thought-space limit', () => {
    const state = knownCamp();
    state.tier = 1;
    const house = getPhrasebook(state).find((item) => item.buildingKind === 'house')!;
    expect(house.available).toBe(false);
    expect(house.issue).toContain('spazi di pensiero');
    expect(house.tokens).toHaveLength(4);
  });

  it('records the actual accepted command without changing voice, RNG, work, resources or time', () => {
    const initial = createGame(6842, 'guided');
    initial.started = true;
    const actual = issueCommand(initial, movement, { type: 'point', x: 260, y: 250 });
    expect(actual.stats.commands).toBe(1);
    const before = structuredClone(actual);
    const recorded = rememberPhrase(actual, movement);
    expect(recorded.phrasebook).toEqual([entry()]);
    const { phrasebook: _book, ...world } = recorded;
    expect(world).toEqual(before);
    expect(actual).toEqual(before);
    expect(getPhrasebook(recorded).find((item) => item.id === phraseKey(movement))).toMatchObject({
      used: true,
      lastUsedAt: 0,
    });
  });

  it('updates a repeated sentence without losing its first use at the beginning of time', () => {
    const state = rememberPhrase(knownCamp(), wood);
    const previous = structuredClone(state);
    const later = rememberPhrase({ ...state, time: 12 }, wood);
    expect(later.phrasebook).toEqual([{ ...entry(wood), lastUsedAt: 12 }]);
    expect(state).toEqual(previous);
  });

  it('does not reorder accepted uses at the same paused time when an older phrase is starred', () => {
    const home = ['S_01', 'V_01', 'O_01'];
    const initial = knownCamp();
    initial.paused = true;
    let state = rememberPhrase(
      issueCommand(initial, movement, { type: 'point', x: 260, y: 250 }),
      movement,
    );
    state = rememberPhrase(issueCommand(state, home), home);
    expect(state.stats.commands).toBe(2);
    expect(state.phrasebook?.map((item) => item.id)).toEqual([
      phraseKey(home),
      phraseKey(movement),
    ]);
    expect(state.phrasebook?.every((item) => item.lastUsedAt === 0)).toBe(true);
    const starred = togglePhraseFavorite(state, movement);
    expect(starred.phrasebook?.map((item) => item.id)).toEqual([
      phraseKey(home),
      phraseKey(movement),
    ]);
    expect(starred.phrasebook?.[1].favorite).toBe(true);
    expect(starred.stats.commands).toBe(2);
    expect(starred.time).toBe(0);
    expect(starred.paused).toBe(true);
  });

  it('saves a favorite recipe without inventing an accepted use or spending anything', () => {
    const state = knownCamp(),
      before = structuredClone(state);
    const favored = togglePhraseFavorite(state, wood);
    expect(favored.phrasebook).toEqual([{ id: phraseKey(wood), tokens: wood, favorite: true }]);
    expect(getPhrasebook(favored).find((item) => item.id === phraseKey(wood))).toMatchObject({
      used: false,
      favorite: true,
    });
    expect(state).toEqual(before);
    const unstarred = togglePhraseFavorite(favored, wood);
    expect(unstarred.phrasebook?.[0]).toMatchObject({ favorite: false });
    expect(unstarred.phrasebook?.[0].firstUsedAt).toBeUndefined();
    expect(unstarred.resources).toEqual(state.resources);
    expect(unstarred.seed).toBe(state.seed);
    expect(unstarred.voice).toBe(state.voice);
  });

  it('keeps a lost word’s past sentence readable but prevents reuse until it is rediscovered', () => {
    let state = togglePhraseFavorite(rememberPhrase(knownCamp(), wood), wood);
    state.words.O_03.retention = 0;
    const lost = getPhrasebook(state).find((item) => item.id === phraseKey(wood))!;
    expect(lost).toMatchObject({
      title: 'Raccogli e porta legna',
      favorite: true,
      used: true,
      available: false,
    });
    expect(lost.issue).toBe('Da riscoprire: Legno.');
    expect(validPhrasebook(state.phrasebook, state)).toBe(true);
    state.words.O_03.retention = 50;
    expect(getPhrasebook(state).find((item) => item.id === lost.id)?.available).toBe(true);
    state = togglePhraseFavorite(state, wood);
    expect(state.phrasebook?.[0].favorite).toBe(false);
  });

  it('round-trips the journal with the world and accepts older stories without a journal', () => {
    const state = togglePhraseFavorite(rememberPhrase(knownCamp(), wood), wood);
    state.words.O_03.retention = 0;
    const restored = parseGame(serializeGame(state));
    expect(restored).not.toBeNull();
    expect(restored?.phrasebook).toEqual(state.phrasebook);
    expect(getPhrasebook(restored!).find((item) => item.id === phraseKey(wood))?.available).toBe(
      false,
    );
    const legacy = createGame();
    expect(parseGame(serializeGame(legacy))?.phrasebook).toBeUndefined();
  });

  it('does not add unknown or incomplete words to either use history or favorites', () => {
    const state = createGame();
    for (const tokens of [wood, ['S_01'], ['S_01', 'V_99']]) {
      expect(rememberPhrase(state, tokens)).toBe(state);
      expect(togglePhraseFavorite(state, tokens)).toBe(state);
    }
  });

  it('bounds ordinary history while preserving the oldest favorite and the latest use', () => {
    let state = knownCamp();
    const options = references();
    state = togglePhraseFavorite(rememberPhrase(state, options[0]), options[0]);
    options.slice(1).forEach((tokens, index) => {
      state = rememberPhrase({ ...state, time: index + 1 }, tokens);
    });
    expect(state.phrasebook).toHaveLength(PHRASEBOOK_LIMIT);
    expect(state.phrasebook?.find((item) => item.id === phraseKey(options[0]))?.favorite).toBe(
      true,
    );
    expect(state.phrasebook?.some((item) => item.id === phraseKey(options.at(-1)!))).toBe(true);
    expect(state.phrasebook?.some((item) => item.id === phraseKey(options[1]))).toBe(false);
    expect(validPhrasebook(state.phrasebook, state)).toBe(true);
  });

  it('never evicts a favorite when every journal slot is starred', () => {
    let state = knownCamp();
    const options = references();
    for (const tokens of options.slice(0, PHRASEBOOK_LIMIT))
      state = togglePhraseFavorite(state, tokens);
    const before = structuredClone(state),
      overflow = options[PHRASEBOOK_LIMIT];
    expect(togglePhraseFavorite(state, overflow)).toBe(state);
    expect(rememberPhrase(state, overflow).phrasebook).toEqual(state.phrasebook);
    expect(state).toEqual(before);
  });
});

describe('action descriptions follow the actual grammar and dispatcher', () => {
  it('distinguishes extraction drops, transport delivery, animal hunting and cooking modes', () => {
    const guided = knownCamp(),
      classic = knownCamp('classic');
    const describe = (state: GameState, tokens: string[]) =>
      getPhrasebook(rememberPhrase(state, tokens)).find((item) => item.id === phraseKey(tokens))!;
    expect(describe(guided, ['S_01', 'V_03']).description).toContain('li lascia sul posto');
    expect(describe(guided, wood).description).toContain('trasporta il carico al campo');
    expect(describe(guided, ['S_01', 'V_04', 'O_04']).description).toContain(
      'Non abbatte animali vivi',
    );
    expect(describe(guided, ['S_01', 'V_03', 'O_04', 'M_01']).description).toContain(
      'predatori alfa e mammut',
    );
    const cook = ['S_01', 'V_07', 'O_04', 'O_05'];
    expect(describe(guided, cook).description).toContain('durante il giorno');
    expect(describe(classic, cook).description).toContain(
      'per un’altra porzione occorre un nuovo ordine',
    );
  });

  it('describes multi-house city construction as a district with the real multiplied cost', () => {
    const state = knownCamp(),
      tokens = ['S_09', 'V_08', 'O_02', 'O_01'];
    const item = getPhrasebook(rememberPhrase(state, tokens)).find(
      (row) => row.id === phraseKey(tokens),
    )!;
    expect(item.title).toBe('Quartiere di case in muratura');
    expect(item.description).toContain('più case insieme');
    expect(resolveConstruction(tokens)).toMatchObject({
      kind: 'house',
      quantity: 4,
      cost: { stone: 80, wood: 40 },
    });
    expect(compileSentence(state, tokens)).toMatchObject({
      valid: true,
      cost: { stone: 80, wood: 40 },
    });
    expect(state.resources.stone).toBe(0);
  });

  it.each([
    [['S_09', 'V_12', 'O_07', 'S_08'], 'Recluta un battaglione'],
    [['S_09', 'V_04', 'O_03'], 'Invia un convoglio fra città'],
    [['S_01', 'V_04', 'O_03', 'S_05'], 'Invia un dono diplomatico'],
    [['S_04', 'V_04', 'O_09', 'S_09'], 'Invia una delegazione di saggi'],
    [['S_08', 'V_03', 'S_05'], 'Attacca un insediamento'],
    [['S_08', 'V_10', 'O_04', 'M_01'], 'Organizza la cavalleria'],
  ] as const)(
    'does not label the imperial phrase %s as ordinary resource work',
    (tokens, title) => {
      const state = rememberPhrase(knownCamp(), tokens);
      expect(getPhrasebook(state).find((item) => item.id === phraseKey(tokens))?.title).toBe(title);
    },
  );

  it('keeps building benefits concrete and qualitative before Numero', () => {
    const state = knownCamp();
    state.words.O_08.retention = 0;
    for (const kind of BUILDING_ORDER) {
      expect(buildingPurpose(kind)).not.toMatch(/\d|%/);
      expect(buildingPurpose(kind)).not.toContain('prende forma dalle parole');
    }
    expect(buildingPurpose('depot')).toContain('più spazio');
    expect(buildingPurpose('house')).toContain('Ospita famiglie');
  });

  it('keeps repeated traditions separate from a direct construction reference', () => {
    const state = rememberPhrase(knownCamp(), ['C_02', 'S_01', 'V_07', 'O_04', 'O_05']);
    const tradition = getPhrasebook(state).find((item) => item.category === 'tradition')!;
    expect(tradition.description).toContain('incarico permanente');
    expect(tradition.title).toContain('Cuoci la carne');
  });

  it('describes purchasing a servant rather than inventing a goods caravan', () => {
    const tokens = ['S_01', 'V_11', 'O_12', 'S_06'];
    const state = rememberPhrase(knownCamp(), tokens);
    const item = getPhrasebook(state).find((row) => row.id === phraseKey(tokens))!;
    expect(item.title).toBe('Acquista un servo');
    expect(item.description).toContain('Scambia monete');
    expect(item.description).not.toContain('carovana');
  });

  it('describes the actual siege performed by an army even with Confine in the sentence', () => {
    const tokens = ['S_08', 'V_13', 'O_10'];
    const state = rememberPhrase(knownCamp(), tokens);
    const item = getPhrasebook(state).find((row) => row.id === phraseKey(tokens))!;
    expect(item.title).toBe('Assedia e conquista');
    expect(item.description).toContain('occupazione effettivi');
    expect(item.description).not.toContain('avamposto');
  });

  it('recognises a verbal sacred vector as a dogma, as the real compiler does', () => {
    const state = knownCamp(),
      tokens = ['O_06', 'V_02', 'M_03'];
    expect(compileSentence(state, tokens)).toMatchObject({ valid: true, kind: 'dogma' });
    const recorded = rememberPhrase(state, tokens);
    expect(getPhrasebook(recorded).find((item) => item.id === phraseKey(tokens))).toMatchObject({
      category: 'dogma',
      title: expect.stringContaining('Dogma:'),
    });
  });
});

describe('imported phrase references are bounded and belong to the actual story', () => {
  it.each([
    (item: Record<string, unknown>) => {
      item.id = 'forged';
    },
    (item: Record<string, unknown>) => {
      item.favorite = 'yes';
    },
    (item: Record<string, unknown>) => {
      item.tokens = ['S_01', 'V_99'];
    },
    (item: Record<string, unknown>) => {
      item.tokens = ['S_01'];
      item.id = 'S_01';
    },
    (item: Record<string, unknown>) => {
      item.lastUsedAt = 1;
    },
    (item: Record<string, unknown>) => {
      item.firstUsedAt = -1;
    },
    (item: Record<string, unknown>) => {
      item.firstUsedAt = undefined;
    },
    (item: Record<string, unknown>) => {
      item.target = { x: 250, y: 250 };
    },
  ])('rejects malformed metadata without accepting the rest of its save', (mutate) => {
    const state = knownCamp(),
      item = entry() as unknown as Record<string, unknown>;
    mutate(item);
    expect(validPhrasebook([item], state)).toBe(false);
    expect(parseGame(JSON.stringify({ ...state, phrasebook: [item] }))).toBeNull();
  });

  it('rejects duplicate IDs, future vocabulary and oversized journals', () => {
    const state = knownCamp();
    expect(validPhrasebook([entry(), entry()], state)).toBe(false);
    expect(
      validPhrasebook(
        references().map((tokens) => entry(tokens)),
        state,
      ),
    ).toBe(false);
    const early = createGame();
    expect(validPhrasebook([entry(wood)], early)).toBe(false);
    expect(validPhrasebook(undefined, early)).toBe(true);
    expect(validPhrasebook([], early)).toBe(true);
  });
});
