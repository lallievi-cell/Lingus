import {
  Apple,
  ChevronDown,
  Heart,
  MessageCircle,
  Snowflake,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
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
import { describeHealth, describeHunger } from './semanticReadability';

interface Props {
  state: GameState;
  unit: Unit;
  index: number;
  selected: boolean;
  custodian?: CustodianStatus;
  onActivate: () => void;
  children?: ReactNode;
}

export function TribeMemberCard({
  state,
  unit,
  index,
  selected,
  custodian,
  onActivate,
  children,
}: Props) {
  const named = hasWord(state, 'S_02');
  const numbered = hasWord(state, 'O_08');
  const sex = resolveUnitSex(unit);
  const stage = getLifeStage(unit);
  const young = stage === 'newborn' || stage === 'child';
  const allWarnings = physicalWarnings(unit);
  const warnings = allWarnings.filter((warning) => warning.kind === 'cold');
  const spark = state.sparks.some((s) => !s.deferred && s.unitId === unit.id);
  const metadataId = `unit-metadata-${unit.id}`;
  return (
    <div className="tribe-member" data-expanded={selected}>
      <button
        className={`unit-card readable-person ${selected ? 'selected' : ''} ${allWarnings.length ? 'person-at-risk' : ''}`}
        onClick={onActivate}
        aria-expanded={spark ? undefined : selected}
        aria-controls={selected ? `person-details-${unit.id}` : undefined}
        aria-label={
          spark
            ? `Scintilla di ${named ? unit.name : 'un compagno'}`
            : named
              ? `Seleziona ${unit.name}`
              : 'Seleziona un compagno'
        }
        aria-describedby={`${metadataId} unit-vitals-${unit.id}`}
        title={`${lifeStageLabel(unit)} · ${sexLabel(unit)}. ${unitLifeHint(unit)}${allWarnings.length ? ` ${allWarnings.map((w) => w.label).join(' · ')}.` : ''}`}
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
          <span className="member-vitals" id={`unit-vitals-${unit.id}`}>
            <span className={unit.hp <= 30 ? 'is-urgent' : ''}>
              <Heart size={13} aria-hidden="true" /> {describeHealth(unit.hp, numbered)}
            </span>
            <span
              className={unit.hunger >= 75 ? 'is-urgent' : ''}
              title="La fame aumenta senza cibo e diminuisce dopo un pasto."
            >
              <Apple size={13} aria-hidden="true" /> {describeHunger(unit.hunger, numbered, sex)}
            </span>
          </span>
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
              {lastCustodianLabel(unit)}:{' '}
              {custodian.wordIds.map((id) => WORDS[id].label).join(', ')}
            </title>
          </MessageCircle>
        )}
        {spark ? (
          <Sparkles size={16} className="spark-indicator" />
        ) : (
          <span
            className="unit-health"
            title={describeHealth(unit.hp, numbered)}
            style={{ '--health': `${unit.hp}%` } as React.CSSProperties}
          />
        )}
        {!spark && <ChevronDown size={16} aria-hidden="true" className="member-expand-icon" />}
      </button>
      {selected && children}
    </div>
  );
}
