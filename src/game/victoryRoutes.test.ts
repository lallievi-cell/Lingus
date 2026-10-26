import { describe, expect, it } from 'vitest';
import { advanceUrbanRoute, preparedUrbanRoute } from '../../tests/scenarios/urbanVictoryRoutes';
import { compileSentence, issueCommand, removeDogma, tick } from './engine';
import { cityPopulation, removeLaw } from './imperial';

const imperialLaws = [
  ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06'],
  ['S_02', 'V_03', 'S_02', 'M_01', 'C_03', 'V_03'],
  ['S_08', 'V_01', 'O_01', 'M_01', 'C_03', 'O_06'],
  ['S_02', 'V_11', 'S_05', 'M_01', 'C_03', 'O_11'],
  ['S_02', 'V_03', 'S_06', 'M_01', 'C_03', 'O_12'],
];

describe('continuous late-game routes from explicitly prepared urban cohorts', () => {
  it('pays real upkeep and holds a controlled empire for sixteen actual seasons after five public laws', () => {
    const scene = preparedUrbanRoute();
    scene.state.words.O_14.retention = 99; // Keep this route distinct from cultural victory.
    scene.addBuilding(scene.capital, 'palace');
    let state = scene.state;
    for (const tokens of imperialLaws) state = issueCommand(state, tokens);
    expect(state.laws).toHaveLength(5);
    const first = advanceUrbanRoute(state, 1350);
    expect(first.state.victory).toBeNull();
    expect(first.state.victoryProgress.imperialSeasons).toBe(15);
    const final = advanceUrbanRoute(first.state, 1440);
    expect(final.state.gameOver).toBeNull();
    expect(final.state.time).toBe(1440);
    expect(final.state.victory).toBe('imperial');
    expect(final.state.victoryProgress.imperialSeasons).toBe(16);
    expect(final.state.resources.coin).toBe(1440); // Sixteen real25+10 upkeeps.
    expect(final.state.resources.seed).toBeGreaterThan(0);
    expect(final.state.resources.seed).toBeLessThan(16); // Real seed spoilage and spring upkeep.
    expect(final.state.resources.wood).toBeLessThan(140);
    expect(final.state.cohesion).toBe(100);
    expect(cityPopulation(final.state.cities[0])).toBe(20);
    expect(
      final.state.buildings.find((building) => building.kind === 'archive')!.lastEfficiency,
    ).toBe(1);
  }, 30_000);

  it('wins culturally through an actual paid travelling sage and continuing peaceful teaching', () => {
    const scene = preparedUrbanRoute();
    const host = scene.addCity('host', 'neighbours', 350);
    scene.state.factions.push({
      id: 'neighbours',
      name: 'I Vicini',
      words: [...host.words],
      dogmas: [],
      relation: 50,
      hostile: false,
      cityId: host.id,
    });
    for (const kind of ['campfire', 'storage', 'pen', 'pen', 'farm'] as const)
      scene.addBuilding(host, kind);
    const state = issueCommand(scene.state, ['S_04', 'V_04', 'O_09', 'S_09'], {
      type: 'city',
      id: host.id,
      x: host.x,
      y: host.y,
    });
    expect(state.cities.find((city) => city.id === scene.capital.id)!.cohorts.sages).toBe(7);
    expect(state.caravans).toHaveLength(1);
    expect(state.caravans[0].arrived).not.toBe(true);
    const transit = advanceUrbanRoute(state, 10);
    expect(transit.state.cities.find((city) => city.id === host.id)!.cohorts.sages).toBe(1);
    const arrived = advanceUrbanRoute(transit.state, 20);
    expect(arrived.state.caravans[0].arrived).toBe(true);
    expect(arrived.state.cities.find((city) => city.id === host.id)!.cohorts.sages).toBe(2);
    const final = advanceUrbanRoute(arrived.state, 1440);
    expect(final.state.gameOver).toBeNull();
    expect(final.state.victory).toBe('cultural');
    expect(final.state.time).toBeGreaterThanOrEqual(1260);
    expect(final.state.time).toBeLessThanOrEqual(1440);
    expect(final.state.factions[0].words.length).toBeGreaterThanOrEqual(36);
    expect(Object.values(final.state.words).every((memory) => memory.retention === 100)).toBe(true);
    expect(final.state.cities.find((city) => city.id === host.id)!.factionId).toBe('neighbours');
    expect(final.state.battalions).toEqual([]);
  }, 30_000);

  it('finishes real school reforms before freeing the servile cohort and earning philosophical victory', () => {
    const scene = preparedUrbanRoute();
    scene.state.words.O_14.retention = 99;
    scene.capital.cohorts.slaves = 2;
    scene.capital.housing = 22;
    scene.addBuilding(scene.capital, 'school');
    scene.state.dogmas = [
      {
        id: 'sacred-slavery',
        name: 'Schiavitù Sacra',
        description: 'Preparata per il replay di riforma.',
        targetId: 'S_06',
        vectorId: 'C_02',
        age: 10,
        weight: 30,
      },
      {
        id: 'fear-wood',
        name: 'Tabù del Legno',
        description: 'Preparato per il replay di riforma.',
        targetId: 'O_03',
        vectorId: 'M_01',
        age: 10,
        weight: 45,
      },
    ];
    let state = issueCommand(scene.state, ['S_04', 'V_14', 'M_03', 'S_06']);
    state = issueCommand(state, ['S_04', 'V_14', 'M_03', 'O_03']);
    expect(state.dogmas.every((dogma) => dogma.reforming)).toBe(true);
    expect(issueCommand(state, ['C_02', 'S_01', 'M_05']).emancipated).toBe(false);
    const first = advanceUrbanRoute(state, 180);
    expect(first.state.victory).toBeNull();
    expect(first.state.dogmas.find((dogma) => dogma.id === 'fear-wood')!.weight).toBe(15);
    const final = advanceUrbanRoute(first.state, 270);
    expect(final.state.dogmas.every((dogma) => dogma.weight === 0)).toBe(true);
    state = final.state;
    for (const dogma of [...state.dogmas]) state = removeDogma(state, dogma.id);
    expect(state.victory).toBeNull();
    state = issueCommand(state, ['C_02', 'S_01', 'M_05']);
    expect(state.emancipated).toBe(true);
    expect(state.cities[0].cohorts.slaves).toBe(0);
    state = tick(state, 0.25);
    expect(state.gameOver).toBeNull();
    expect(state.victory).toBe('philosophical');
    expect(state.cohesion).toBe(100);
    expect(state.eventTimes['reformed:sacred-slavery']).toBe(1);
    expect(state.eventTimes['reformed:fear-wood']).toBe(1);
    expect(state.resources.coin).toBe(1910);
  }, 30_000);

  it('retains the ordinary extraction taboo while allowing the exact philosophical question', () => {
    const scene = preparedUrbanRoute();
    scene.addBuilding(scene.capital, 'school');
    scene.state.dogmas = [
      {
        id: 'fear-wood',
        name: 'Tabù del Legno',
        description: 'Preparato per il replay di riforma.',
        targetId: 'O_03',
        vectorId: 'M_01',
        age: 0,
        weight: 30,
      },
    ];
    expect(compileSentence(scene.state, ['S_01', 'V_04', 'O_03']).valid).toBe(false);
    expect(compileSentence(scene.state, ['S_04', 'V_14', 'M_03', 'O_03']).valid).toBe(true);
    const next = issueCommand(scene.state, ['S_04', 'V_14', 'M_03', 'O_03']);
    expect(next.dogmas[0].reforming).toBe(true);
    expect(compileSentence(next, ['S_01', 'V_04', 'O_03']).valid).toBe(false);
  });

  it('requires repeal of an explicit anti-doubt law before the otherwise valid reform', () => {
    const scene = preparedUrbanRoute();
    scene.addBuilding(scene.capital, 'school');
    scene.addBuilding(scene.capital, 'palace');
    scene.state.dogmas = [
      {
        id: 'fear-wood',
        name: 'Tabù del Legno',
        description: 'Preparato per il replay di riforma.',
        targetId: 'O_03',
        vectorId: 'M_01',
        age: 0,
        weight: 30,
      },
    ];
    const law = issueCommand(scene.state, ['S_04', 'V_14', 'O_03', 'M_01', 'C_03', 'O_10']);
    expect(law.laws).toHaveLength(1);
    const next = issueCommand(law, ['S_04', 'V_14', 'M_03', 'O_03']);
    expect(next.dogmas[0].reforming).not.toBe(true);
    expect(next.voice).toBe(law.voice);
    expect(next.stats.commands).toBe(law.stats.commands);
    expect(next.logs[0].text).toContain('Il codice penale vieta il dubbio');
    const repealed = removeLaw(next, next.laws[0].id);
    const reform = issueCommand(repealed, ['S_04', 'V_14', 'M_03', 'O_03']);
    expect(reform.dogmas[0].reforming).toBe(true);
    expect(reform.stats.commands).toBe(law.stats.commands + 1);
  });

  it('does not count a Pax season when actual upkeep closes the palace', () => {
    const scene = preparedUrbanRoute();
    scene.state.words.O_14.retention = 99;
    scene.state.resources.coin = 0;
    scene.addBuilding(scene.capital, 'palace');
    let state = scene.state;
    for (const tokens of imperialLaws) state = issueCommand(state, tokens);
    const result = advanceUrbanRoute(state, 90);
    expect(result.state.victory).toBeNull();
    expect(result.state.victoryProgress.imperialSeasons).toBe(0);
    expect(result.state.buildings.find((building) => building.kind === 'palace')!.active).toBe(
      false,
    );
    expect(result.state.buildings.find((building) => building.kind === 'palace')!.hp).toBe(960);
    expect(result.state.resources.coin).toBe(0);
  });

  it('does not invent a replacement scribe after a paid delegation leaves only three', () => {
    const scene = preparedUrbanRoute();
    scene.capital.cohorts.sages = 4;
    scene.capital.housing = 16;
    scene.state.buildings.find((building) => building.kind === 'archive')!.lastEfficiency = 0;
    const host = scene.addCity('host', 'neighbours', 350);
    host.words = Object.keys(scene.state.words);
    scene.state.factions.push({
      id: 'neighbours',
      name: 'I Vicini',
      words: [...host.words],
      dogmas: [],
      relation: 50,
      hostile: false,
      cityId: host.id,
    });
    const ordered = issueCommand(scene.state, ['S_04', 'V_04', 'O_09', 'S_09'], {
      type: 'city',
      id: host.id,
      x: host.x,
      y: host.y,
    });
    const result = advanceUrbanRoute(ordered, 90);
    expect(result.state.cities[0].cohorts.sages).toBe(3);
    expect(
      result.state.buildings.find((building) => building.kind === 'archive')!.lastEfficiency,
    ).toBe(0.75);
    expect(result.state.victory).toBeNull();
    expect(result.state.words.O_09.retention).toBeLessThan(100);
  });
});
