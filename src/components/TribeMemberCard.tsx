import { MessageCircle, Snowflake, Sparkles, TriangleAlert } from 'lucide-react';
import { ADULT_AGE, WORDS } from '../game/content';
import type { CustodianStatus } from '../game/custodianStatus';
import { getLifeStage, resolveUnitSex } from '../game/demography';
import { hasWord } from '../game/runtime';
import type { GameState, Unit } from '../game/types';
import {
  lastCustodianLabel,
  lifeStageLabel,
  physicalWarnings,
  sexLabel,
  unitLifeHint,
  visibleUnitName,
} from './unitReadability';
import './TribeReadability.css';
import { UnitWorkStatus } from './WorkStatus';

interface Props {
  state: GameState;
  unit: Unit;
  index: number;
  selected: boolean;
  custodian?: CustodianStatus;
  onActivate: () => void;
}

export function TribeMemberCard({ state, unit, index, selected, custodian, onActivate }: Props) {
  const named = hasWord(state, 'S_02');
  const numbered = hasWord(state, 'O_08');
  const sex = resolveUnitSex(unit);
  const stage = getLifeStage(unit);
  const young = stage === 'newborn' || stage === 'child';
  const warnings = physicalWarnings(unit);
  const spark = state.sparks.some((s) => s.unitId === unit.id);
  const metadataId = `unit-metadata-${unit.id}`;
  return (
    <button
      className={`unit-card readable-person ${selected ? 'selected' : ''} ${warnings.length ? 'person-at-risk' : ''}`}
      onClick={onActivate}
      aria-label={
        spark
          ? `Scintilla di ${named ? unit.name : 'un compagno'}`
          : named
            ? `Seleziona ${unit.name}`
            : 'Seleziona un compagno'
      }
      aria-describedby={metadataId}
      title={`${lifeStageLabel(unit)} · ${sexLabel(unit)}. ${unitLifeHint(unit)}${warnings.length ? ` ${warnings.map((w) => w.label).join(' · ')}.` : ''}`}
    >
      <span
        className={`unit-portrait portrait-${index % 7} person-${sex.toLowerCase()} life-${stage}`}
        aria-hidden="true"
      >
        <span className="portrait-head" />
        <span className="portrait-body" />
        {stage === 'elder' && <span className="elder-hair" />}
        {stage === 'newborn' && <span className="newborn-wrap" />}
      </span>
      <span className="unit-info">
        <strong>{visibleUnitName(state, unit)}</strong>
        <span className="person-metadata" id={metadataId}>
          <span className={`person-sex person-sex-${sex.toLowerCase()}`}>
            <span aria-hidden="true">{sex === 'F' ? '♀' : '♂'}</span> {sexLabel(unit)}
          </span>
          <span className={`person-stage stage-${stage}`}>{lifeStageLabel(unit)}</span>
        </span>
        <UnitWorkStatus state={state} unit={unit} compact />
        {young && (
          <span
            className="child-growth"
            title={
              numbered
                ? `${Math.floor(unit.age)} di ${ADULT_AGE} stagioni prima dell'età adulta`
                : 'Cresce verso l’età adulta'
            }
            aria-label={
              numbered
                ? `Crescita: ${Math.floor(unit.age)} di ${ADULT_AGE} stagioni`
                : 'Crescita verso l’età adulta'
            }
          >
            <span style={{ width: `${Math.min(1, unit.age / ADULT_AGE) * 100}%` }} />
          </span>
        )}
        {warnings.length > 0 && (
          <span className="person-warning">
            {warnings[0].kind === 'cold' ? <Snowflake size={11} /> : <TriangleAlert size={11} />}
            {warnings.map((w) => w.label).join(' · ')}
          </span>
        )}
      </span>
      {custodian && (
        <MessageCircle
          size={14}
          className={`custodian-indicator ${custodian.risk}`}
          aria-label={lastCustodianLabel(unit)}
        >
          <title>
            {lastCustodianLabel(unit)}: {custodian.wordIds.map((id) => WORDS[id].label).join(', ')}
          </title>
        </MessageCircle>
      )}
      {spark ? (
        <Sparkles size={16} className="spark-indicator" />
      ) : (
        <span
          className="unit-health"
          title={
            numbered
              ? `Salute ${Math.round(unit.hp)}`
              : unit.hp <= 30
                ? 'Salute in pericolo'
                : unit.hp < 70
                  ? 'Salute fragile'
                  : 'In salute'
          }
          style={{ '--health': `${unit.hp}%` } as React.CSSProperties}
        />
      )}
    </button>
  );
}
