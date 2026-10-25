// Шаг 4. По словам или по смыслу: угадайте, какой способ найдёт нужный документ в первой тройке.

import type { LabBase, LabSearch } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import styles from '../RagLab.module.css';
import { useSearch, type Loaded } from '../useRagData';
import { GOOD_PLACE, METHOD_PICKS } from './courseContent';
import { CourseTerm, Lab, StepShell } from './StepShell';

type Outcome = 'words' | 'meaning' | 'both' | 'none';

const OUTCOMES: readonly { value: Outcome; label: string }[] = [
  { value: 'words', label: 'по словам' },
  { value: 'meaning', label: 'по смыслу' },
  { value: 'both', label: 'оба' },
  { value: 'none', label: 'никто' },
];

const LISTS = [
  { key: 'words', title: 'По словам' },
  { key: 'meaning', title: 'По смыслу' },
  { key: 'hybrid', title: 'Гибрид' },
] as const;

interface StepProps {
  base: LabBase;
  onStep: (index: number) => void;
}

export function StepMethods({ base, onStep }: StepProps): ReactElement {
  return (
    <StepShell
      index={3}
      onStep={onStep}
      question="Искать по словам или по смыслу?"
      prose={<MethodsProse />}
      lab={<MethodsLab base={base} />}
      notice="Пройдите все четыре вопроса. Поиск по смыслу выигрывает, когда спрашивают своими словами; по словам — на коротких терминах и именах. Гибрид чаще держит нужное в тройке, но не всегда лучше лучшего из двух. А на трудном вопросе не помогает никто."
      takeaway="Ни один способ не находит всё. Поэтому в харнессе бывают оба, а иногда модель сама переформулирует вопрос перед поиском."
    />
  );
}

function MethodsProse(): ReactElement {
  return (
    <>
      <p>
        Искать можно двумя способами. <b>По словам</b> — как Ctrl+F: у каких документов больше
        совпадений со словами вопроса — в тексте, заголовке, тегах. <b>По смыслу</b> — то, что мы
        видели на прошлом шаге: вектор вопроса сравнивается с векторами кусков, ближайшие — наверх.
      </p>
      <p>
        У каждого способа свои слепые пятна. Поэтому часто делают{' '}
        <CourseTerm tip="Гибридный поиск — объединение двух выдач. Здесь — Reciprocal Rank Fusion: документ получает 1 / (60 + место) из каждой выдачи, баллы складываются.">
          гибрид
        </CourseTerm>
        : берут обе выдачи и складывают <i>места</i>, а не баллы — баллы у способов несравнимы, как
        оценки двух судей по разным шкалам.
      </p>
    </>
  );
}

function MethodsLab({ base }: { base: LabBase }): ReactElement {
  const [pickIndex, setPickIndex] = useState(0);
  const [guess, setGuess] = useState<Outcome | null>(null);
  const pick = METHOD_PICKS[pickIndex] ?? METHOD_PICKS[0];
  const search = useSearch(pick.query);
  const title = base.documents.find((document) => document.id === pick.focus)?.title ?? '';
  return (
    <Lab
      title="Опыт: кто найдёт нужный документ в первой тройке?"
      hint={
        <>
          Вопрос «{pick.query}», ответ — в <span className={styles.mono}>{pick.focus}</span> (
          {title}). Как думаете?
        </>
      }
    >
      <div className={styles.choices} role="group" aria-label="Вопрос">
        {METHOD_PICKS.map((item, index) => (
          <button
            key={item.query}
            type="button"
            className={styles.choice}
            aria-pressed={index === pickIndex}
            onClick={() => {
              setPickIndex(index);
              setGuess(null);
            }}
          >
            «{item.query}»
          </button>
        ))}
      </div>
      <GuessButtons options={OUTCOMES} value={guess} onChange={setGuess} />
      {guess === null ? (
        <p className={styles.hint}>Выберите ответ — покажем три выдачи.</p>
      ) : (
        <SearchOutcome search={search} focus={pick.focus} why={pick.why} guess={guess} />
      )}
    </Lab>
  );
}

export function GuessButtons<Value extends string>(props: {
  options: readonly { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
}): ReactElement {
  return (
    <div className={styles.choices} role="group" aria-label="Ваш ответ">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.choice}
          aria-pressed={props.value === option.value}
          onClick={() => {
            props.onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Место документа в выдаче, с единицы; null — не попал в выдачу.
function placeOf(list: LabSearch['words'], documentId: string): number | null {
  const index = list.findIndex((item) => item.documentId === documentId);
  return index < 0 ? null : index + 1;
}

const isGood = (place: number | null): boolean => place !== null && place <= GOOD_PLACE;

function outcomeOf(search: LabSearch, focus: string): Outcome {
  const words = isGood(placeOf(search.words, focus));
  const meaning = isGood(placeOf(search.meaning, focus));
  if (words && meaning) {
    return 'both';
  }
  if (words) {
    return 'words';
  }
  return meaning ? 'meaning' : 'none';
}

function SearchOutcome(
  props: Omit<ResultProps, 'search'> & { search: Loaded<LabSearch> },
): ReactElement {
  const { search } = props;
  if (search.status === 'loading') {
    return <p className={styles.hint}>Ищем…</p>;
  }
  if (search.status === 'error') {
    return <p className={styles.bad}>{search.message}</p>;
  }
  return <MethodsResult {...props} search={search.value} />;
}

interface ResultProps {
  search: LabSearch;
  focus: string;
  why: string;
  guess: Outcome;
}

function MethodsResult({ search, focus, why, guess }: ResultProps): ReactElement {
  const truth = outcomeOf(search, focus);
  const label = OUTCOMES.find((outcome) => outcome.value === truth)?.label ?? '';
  return (
    <>
      <p className={guess === truth ? styles.good : styles.bad}>
        {guess === truth ? 'Верно.' : `На самом деле — ${label}.`}
      </p>
      <p className={styles.reading}>{why}</p>
      <div className={styles.columns}>
        {LISTS.map((list) => (
          <RankColumn key={list.key} title={list.title} items={search[list.key]} focus={focus} />
        ))}
      </div>
    </>
  );
}

function RankColumn(props: {
  title: string;
  items: LabSearch['words'];
  focus: string;
}): ReactElement {
  const place = placeOf(props.items, props.focus);
  return (
    <div className={styles.stack}>
      <h4 className={styles.columnTitle}>{props.title}</h4>
      <p className={isGood(place) ? styles.good : styles.bad}>
        {props.focus} — {place === null ? 'не найден' : `${String(place)}-е место`}
      </p>
      <ol className={styles.rank}>
        {props.items.slice(0, 5).map((item, index) => (
          <li key={item.documentId} data-hit={item.documentId === props.focus ? 'true' : undefined}>
            <span className={styles.number}>{index + 1}</span>
            <span className={styles.mono}>{item.documentId}</span>
          </li>
        ))}
      </ol>
      {props.items.length < 5 && (
        <p className={styles.hint}>
          У остальных документов ни одного слова из вопроса — в выдачу они не попали.
        </p>
      )}
    </div>
  );
}
