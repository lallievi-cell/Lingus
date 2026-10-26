import { Baby, ChevronDown, Users } from 'lucide-react';
import {
  getGrowthReadiness,
  GROWTH_BLOCKER_TEXT,
  individualGrowthHint,
} from '../game/growthReadiness';
import { hasBuilding, hasWord } from '../game/runtime';
import { guidedGrowthMilestones, guidedBirthMultiplier } from '../game/guidedProgression';
import type { GameState, Unit } from '../game/types';
import './GrowthReadiness.css';

export function GrowthReadiness({ state }: { state: GameState }) {
  if (state.urbanized) return null;
  const growth = getGrowthReadiness(state);
  const possible = growth.readyPairs > 0 && growth.freePlaces > 0;
  const numbered = hasWord(state, 'O_08');
  const guidedMilestones = guidedGrowthMilestones(state);
  const partnerText =
    growth.missingSex === 'M'
      ? 'Manca un uomo che sia in età fertile al prossimo cambio.'
      : growth.missingSex === 'F'
        ? 'Manca una donna che sia in età fertile al prossimo cambio.'
        : 'Mancano adulti che possano formare una coppia fertile al prossimo cambio.';
  const explanation = growth.blockers.length
    ? growth.blockers
        .map((blocker) => (blocker === 'partner' ? partnerText : GROWTH_BLOCKER_TEXT[blocker]))
        .join(' ')
    : 'Le condizioni presenti permettono una nascita al prossimo cambio di stagione.';
  return (
    <section
      className={`growth-readiness ${possible ? 'growth-possible' : ''}`}
      aria-label="Crescita della tribù"
    >
      <div className="growth-heading">
        <Baby size={16} />
        <strong>La prossima generazione</strong>
        <span>{possible ? 'Possibile' : 'Da preparare'}</span>
      </div>
      <p>{explanation}</p>
      <details>
        <summary>
          Cosa serve alla crescita <ChevronDown size={12} />
        </summary>
        {numbered && (
          <div className="growth-counts">
            <Users size={13} />
            <span>
              Per il prossimo cambio, nelle condizioni presenti: {growth.readyMales}{' '}
              {growth.readyMales === 1 ? 'uomo' : 'uomini'} e {growth.readyFemales}{' '}
              {growth.readyFemales === 1 ? 'donna' : 'donne'} · {growth.readyPairs}{' '}
              {growth.readyPairs === 1 ? 'coppia' : 'coppie'} · {growth.freePlaces}{' '}
              {growth.freePlaces === 1 ? 'posto libero' : 'posti liberi'}
            </span>
          </div>
        )}
        <ul>
          <li>Un uomo e una donna ancora in età fertile al prossimo cambio.</li>
          <li>Cibo, riposo nella stagione in corso e ritorno al giaciglio.</li>
          <li>Un posto libero negli alloggi; solo i ripari completati aggiungono spazio.</li>
        </ul>
        {state.playMode === 'guided' && (
          <p>
            La Guidata sostiene la crescita attraverso cibo preparato, coltivazioni o allevamenti e
            case in pietra. Dopo Conservare, Portare Preda ripete i viaggi alimentari durante la
            giornata.
            {Object.values(guidedMilestones).some(Boolean) &&
              (numbered
                ? ` Bonus attuale alle probabilità: ×${guidedBirthMultiplier(state).toLocaleString('it-IT')}.`
                : ' I progressi della comunità rendono più favorevoli le nascite.')}
          </p>
        )}
        {growth.population >= 10 &&
          !hasBuilding(state, 'storage') &&
          ['V_05', 'O_04', 'M_02'].every((id) => hasWord(state, id)) && (
            <p>
              La comunità ha bisogno di scorte più grandi: Conservare · Preda · Domani costruisce un
              Pozzo scorte con legna o pietra consegnata. Senza spazio, parte del raccolto non può
              essere conservata per la notte e la stagione successiva.
            </p>
          )}
        <small>
          È una previsione condizionata: età, fame, riposo e posizione si verificano a fine
          stagione. Anche con tutto pronto, la nascita non è garantita.
        </small>
      </details>
    </section>
  );
}

export function IndividualGrowthReadiness({ state, unit }: { state: GameState; unit: Unit }) {
  const hint = individualGrowthHint(state, unit);
  if (!hint) return null;
  return (
    <p className="growth-person-hint" aria-label="Condizioni per la crescita">
      {hint}
    </p>
  );
}
