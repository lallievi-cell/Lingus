import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Flag,
  Globe2,
  ScrollText,
  Shield,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  BUILDING_ORDER,
  BUILDING_SPECS,
  RESOURCE_ORDER,
  RESOURCE_SPECS,
  WORDS,
} from '../game/content';
import { getIntelligibility, playerPopulation, removeLaw, removeTradition } from '../game/imperial';
import { hasWord } from '../game/runtime';
import { isVisibleAt } from './mapDrawing';
import { Glyph } from './Glyph';
import type { City, GameState, Resource, Target } from '../game/types';

export type CivilizationMode =
  | 'traditions'
  | 'laws'
  | 'world'
  | 'victory'
  | 'settlement'
  | 'recipes';
export function describeQuantity(value: number, numbered: boolean) {
  return numbered
    ? `${Math.round(value * 10) / 10}`
    : value <= 0
      ? 'Nulla'
      : value < 5
        ? 'Poco'
        : value < 20
          ? 'Quanto basta'
          : value < 100
            ? 'Molto'
            : 'Abbondante';
}
export function CivilizationPanel({
  state: s,
  mode,
  target,
  onChange,
  onCompose,
  onClose,
}: {
  state: GameState;
  mode: CivilizationMode;
  target: Target | null;
  onChange: (s: GameState) => void;
  onCompose: (tokens: string[], target?: Target) => void;
  onClose: () => void;
}) {
  const numbered = hasWord(s, 'O_08'),
    own = s.cities.filter((c) => c.factionId === 'player');
  const selected =
    target?.type === 'city' ? s.cities.find((c) => c.id === target.id) : own.find((c) => c.capital);
  const known = (tokens: string[]) => tokens.every((t) => hasWord(s, t));
  const prepare = (tokens: string[], destination?: Target) => {
    onCompose(tokens, destination);
    onClose();
  };
  const cityTarget = (c: City): Target => ({ type: 'city', id: c.id, x: c.x, y: c.y });
  const sentence = (tokens: string[]) =>
    tokens.map((id) => (
      <span key={`${id}-${tokens.indexOf(id)}`}>
        <Glyph id={id} size={13} />
        {WORDS[id]?.label}
      </span>
    ));
  const inventory = (r: GameState['resources']) => (
    <div className="inventory-grid">
      {RESOURCE_ORDER.filter(
        (key) => !RESOURCE_SPECS[key].wordId || hasWord(s, RESOURCE_SPECS[key].wordId!),
      ).map((key) => (
        <div key={key}>
          <Glyph id={RESOURCE_SPECS[key].wordId ?? 'V_02'} size={17} />
          <span>{RESOURCE_SPECS[key].label}</span>
          <b>{describeQuantity(r[key], numbered)}</b>
        </div>
      ))}
    </div>
  );
  return (
    <div className="civilization-panel">
      <span className="eyebrow">
        {mode === 'world'
          ? 'OLTRE IL NOSTRO ORIZZONTE'
          : mode === 'victory'
            ? 'TRE MODI DI LASCIARE UNA TRACCIA'
            : 'LE PAROLE DIVENTANO ISTITUZIONI'}
      </span>
      <h2>
        {
          {
            traditions: 'Frasi che durano.',
            laws: 'Il codice delle leggi.',
            world: 'Le molte voci del mondo.',
            victory: 'Il destino della civiltà.',
            settlement: selected?.name ?? 'La nostra comunità.',
            recipes: 'La materia delle parole.',
          }[mode]
        }
      </h2>
      {mode === 'traditions' && (
        <>
          <p className="modal-intro">
            Una frase preceduta da Sempre diventa un lavoro permanente. La Notte limita un mestiere
            alle ore buie. Ogni città può conservare due vocazioni.
          </p>
          <div className="institution-count">
            <BookOpen size={17} />
            {s.traditions.length}/{s.tier === 5 ? 8 : s.tier === 4 ? 5 : s.tier === 3 ? 3 : 0}{' '}
            tradizioni
          </div>
          <div className="institution-list">
            {s.traditions.map((t) => (
              <article key={t.id}>
                <div className="token-sentence">{sentence(t.tokens)}</div>
                <button
                  className="icon-button"
                  aria-label={`Rimuovi tradizione ${t.name}`}
                  onClick={() => onChange(removeTradition(s, t.id))}
                >
                  <X size={15} />
                </button>
              </article>
            ))}
            {s.traditions.length === 0 && (
              <p>
                Non ci sono frasi permanenti. Componi una condizione, un soggetto e un lavoro nella
                barra del linguaggio.
              </p>
            )}
          </div>
          {own.map((c) => (
            <div className="city-vocations" key={c.id}>
              <h3>
                {c.name} <small>{c.vocations.length}/2 vocazioni</small>
              </h3>
              {c.vocations.map((t) => (
                <article key={t.id}>
                  <span>{t.name}</span>
                  <button
                    className="text-button"
                    onClick={() => onChange(removeTradition(s, t.id))}
                  >
                    Rimuovi
                  </button>
                </article>
              ))}
            </div>
          ))}
          <div className="recipe-prompts">
            {[
              ['C_02', 'S_03', 'V_03', 'O_04', 'M_02'],
              ['C_02', 'S_04', 'V_05', 'O_09'],
              ['C_01', 'S_03', 'V_05', 'O_01'],
            ]
              .filter(known)
              .map((t) => (
                <button key={t.join()} onClick={() => prepare(t)}>
                  <span className="token-sentence">{sentence(t)}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        </>
      )}
      {mode === 'laws' && (
        <>
          <p className="modal-intro">
            Sei parole legano un dovere o un reato alla sua conseguenza. Pericolo nel quarto spazio
            crea un divieto; gli altri casi prescrivono un dovere stagionale.
          </p>
          <div className="institution-count">
            <ScrollText size={17} />
            {s.laws.length}/{s.tier >= 5 ? 6 : s.tier >= 4 ? 3 : 0} leggi ·{' '}
            {s.government === 'republic'
              ? 'Repubblica'
              : s.government === 'monarchy'
                ? 'Monarchia'
                : 'Tribù'}
          </div>
          <div className="institution-list">
            {s.laws.map((l) => (
              <article key={l.id}>
                <div>
                  <div className="token-sentence">{sentence(l.tokens)}</div>
                  <p>{l.description}</p>
                  <small>
                    {l.prohibitive ? 'Codice penale' : 'Dovere e incentivo'} · {l.age} stagioni
                  </small>
                </div>
                <button
                  className="text-button text-danger"
                  onClick={() => onChange(removeLaw(s, l.id))}
                >
                  Abroga
                </button>
              </article>
            ))}
          </div>
          <div className="recipe-prompts">
            {[
              ['S_09', 'V_04', 'O_11', 'O_07', 'C_03', 'S_06'],
              ['S_02', 'V_03', 'S_01', 'M_01', 'C_03', 'O_06'],
              ['S_06', 'V_08', 'O_02', 'C_02', 'C_03', 'M_05'],
            ]
              .filter(known)
              .map((t) => (
                <button key={t.join()} onClick={() => prepare(t)}>
                  <span className="token-sentence">{sentence(t)}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
          <div className="guide-note">
            <Shield size={18} />
            <p>
              La Pietra Sacra ha priorità sul codice dello Stato. Una legge che punisce ciò che un
              dogma santifica alimenta lo scisma; una legge che lo difende rafforza il potere
              religioso.
            </p>
          </div>
        </>
      )}
      {mode === 'world' && (
        <>
          <p className="modal-intro">
            La comprensione reciproca dipende dalle parole condivise. Il commercio e il contatto
            fanno incontrare le lingue; le conquiste conservano la cultura dei popoli annessi.
          </p>
          <div className="faction-list">
            {s.factions
              .filter((f) => {
                const c = s.cities.find((c) => c.id === f.cityId);
                return c && isVisibleAt(s, c.x, c.y);
              })
              .map((f) => {
                const c = s.cities.find((c) => c.id === f.cityId)!,
                  understanding = getIntelligibility(s, f.words);
                return (
                  <article key={f.id}>
                    <div className="faction-symbol">
                      <Globe2 size={25} />
                    </div>
                    <div>
                      <h3>{f.name}</h3>
                      <p className="faction-speech">
                        {understanding < 30
                          ? '◇ ϟ ⋔ ⊙ ⋈ ⌁'
                          : understanding < 80
                            ? '« Il nostro luogo · i vostri beni · insieme »'
                            : '« Comprendiamo la vostra lingua. »'}
                      </p>
                      <span>
                        Intelligibilità:{' '}
                        {numbered
                          ? `${understanding.toFixed(1)}%`
                          : understanding < 30
                            ? 'incomprensibile'
                            : understanding < 80
                              ? 'parziale'
                              : 'condivisa'}{' '}
                        · {f.hostile ? 'Ostile' : f.subjugated ? 'Annessa' : 'In pace'}
                      </span>
                      <div className="meter">
                        <span style={{ width: `${understanding}%` }} />
                      </div>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        onCompose([], cityTarget(c));
                        onClose();
                      }}
                    >
                      Indica sulla mappa <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })}
          </div>
          <div className="recipe-prompts">
            {[
              ['S_01', 'V_11', 'O_03', 'S_05'],
              ['S_04', 'V_04', 'O_09', 'S_09'],
              ['S_08', 'V_13', 'S_09', 'S_05'],
            ]
              .filter(known)
              .map((t) => (
                <button key={t.join()} onClick={() => prepare(t, target ?? undefined)}>
                  <span className="token-sentence">{sentence(t)}</span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        </>
      )}
      {mode === 'settlement' && (
        <>
          {selected ? (
            <>
              <p className="modal-intro">
                Il governo della città passa per le frasi. Le informazioni qui descrivono gli
                effetti delle tue parole.
              </p>
              <div className="city-cohorts">
                {(['workers', 'warriors', 'sages', 'slaves'] as const).map((cohort, index) => (
                  <div key={cohort}>
                    <Glyph id={['S_01', 'S_03', 'S_04', 'S_06'][index]} size={23} />
                    <span>{['Popolo', 'Guerrieri', 'Saggi', 'Servi'][index]}</span>
                    <strong>{describeQuantity(selected.cohorts[cohort], numbered)}</strong>
                  </div>
                ))}
              </div>
              {inventory(selected.capital ? s.resources : selected.resources)}
              <div className="settlement-buildings">
                {s.buildings
                  .filter((b) => b.cityId === selected.id && b.hp > 0)
                  .map((b) => (
                    <div key={b.id}>
                      <Building2 size={16} />
                      <span>{BUILDING_SPECS[b.kind].label}</span>
                      <small>
                        {b.active
                          ? numbered
                            ? `${Math.round((b.lastEfficiency ?? 1) * 100)}% efficienza`
                            : 'Attivo'
                          : 'Manutenzione mancante'}
                      </small>
                    </div>
                  ))}
              </div>
              <div className="city-vocations">
                <h3>
                  Vocazioni scolpite <small>{selected.vocations.length}/2</small>
                </h3>
                {selected.vocations.map((v) => (
                  <div className="token-sentence" key={v.id}>
                    {sentence(v.tokens)}
                  </div>
                ))}
              </div>
              <div className="recipe-prompts">
                {[
                  ['C_02', 'S_09', 'V_09', 'O_04'],
                  ['C_02', 'S_09', 'V_12', 'O_07'],
                  ['C_02', 'S_09', 'V_11', 'O_12'],
                  ['C_02', 'S_09', 'V_05', 'O_09'],
                  ['S_09', 'V_08', 'O_02', 'O_01'],
                  ['S_09', 'V_12', 'O_07', 'S_08'],
                ]
                  .filter(known)
                  .map((t) => (
                    <button key={t.join()} onClick={() => prepare(t, cityTarget(selected))}>
                      <span className="token-sentence">{sentence(t)}</span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <p className="modal-intro">
                La comunità vive ancora di individui. A centocinquanta abitanti e con la parola
                Città, gli insediamenti diventano nodi urbani.
              </p>
              {inventory(s.resources)}
            </>
          )}
        </>
      )}
      {mode === 'victory' && (
        <>
          <p className="modal-intro">
            Le condizioni finali richiedono l’Età del Ferro. Il tipo di civiltà che hai costruito
            determina il percorso possibile.
          </p>
          <div className="victory-paths">
            <article>
              <Flag size={28} />
              <div>
                <h3>Pax Universalis</h3>
                <p>
                  Controlla tutte le città, mantieni almeno cinque leggi e una tensione inferiore a
                  trenta per sedici stagioni consecutive.
                </p>
                <div className="meter">
                  <span style={{ width: `${(s.victoryProgress.imperialSeasons / 16) * 100}%` }} />
                </div>
                <small>
                  {s.victoryProgress.imperialSeasons}/16 stagioni · {own.length}/
                  {s.cities.filter((c) => c.factionId !== 'ruins').length} città · {s.laws.length}/5
                  leggi
                </small>
              </div>
              {s.victory === 'imperial' && <Check />}
            </article>
            <article>
              <BookOpen size={28} />
              <div>
                <h3>Biblioteca Universale</h3>
                <p>
                  Tutte le quarantacinque parole a memoria piena in un archivio attivo; comprensione
                  reciproca almeno all’ottanta per cento con ogni popolo.
                </p>
                <div className="meter">
                  <span
                    style={{
                      width: `${(Object.values(s.words).filter((w) => w.retention >= 100).length / 45) * 100}%`,
                    }}
                  />
                </div>
                <small>
                  {Object.values(s.words).filter((w) => w.retention >= 100).length}/45 parole a
                  memoria piena
                </small>
              </div>
              {s.victory === 'cultural' && <Check />}
            </article>
            <article>
              <Sparkles size={28} />
              <div>
                <h3>Il Grande Risveglio</h3>
                <p>
                  Erodi con il dubbio tutti i dogmi, abolisci la schiavitù e conserva almeno novanta
                  coesione senza regole sacre attive.
                </p>
                <small>
                  {s.philosophy ? 'Filosofia praticata' : 'La filosofia attende'} ·{' '}
                  {s.emancipated ? 'Schiavitù abolita' : 'Libertà da conquistare'} ·{' '}
                  {s.dogmas.length} dogmi attivi
                </small>
              </div>
              {s.victory === 'philosophical' && <Check />}
            </article>
          </div>
          <div className="institution-count">
            <Users size={16} />
            {describeQuantity(playerPopulation(s), numbered)} abitanti · Era {s.tier + 1}/6
          </div>
        </>
      )}
      {mode === 'recipes' && (
        <>
          <p className="modal-intro">
            Gli edifici nascono da combinazioni di parole. Questo registro spiega le ricette; ogni
            costruzione viene ordinata attraverso la barra del linguaggio.
          </p>
          <div className="building-codex">
            {BUILDING_ORDER.map((kind) => {
              const b = BUILDING_SPECS[kind],
                tokens = ['S_01', ...b.recipe];
              return (
                <article key={kind} className={known(tokens) ? '' : 'unlearned'}>
                  <div className="building-codex-name">
                    <Building2 size={20} />
                    <h3>{b.label}</h3>
                    <span>{b.id}</span>
                  </div>
                  <div className="token-sentence">{sentence(tokens)}</div>
                  <p>{b.description}</p>
                  <small>
                    {Object.entries(b.cost)
                      .map(([r, n]) => `${n} ${RESOURCE_SPECS[r as Resource].label}`)
                      .join(' · ')}{' '}
                    · {b.workers} lavoratori
                  </small>
                  {kind !== 'campfire' && (
                    <button
                      className="text-button"
                      disabled={!known(tokens)}
                      onClick={() => prepare(tokens)}
                    >
                      Componi la ricetta <ArrowRight size={13} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
