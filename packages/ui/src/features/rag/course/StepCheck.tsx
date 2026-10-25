// Шаг 6. Проверка ответа: код, сходство и судья на ответе с подложенными ошибками.
// Ответ и мнения судьи — учебные трейсы из репозитория (examples/traces), сходство считает
// сервер заново той же моделью эмбеддингов.

import type { GroundingClaim, GroundingReportResponse } from '@harness-visualization/server';
import { useState, type ReactElement } from 'react';
import styles from '../RagLab.module.css';
import { useCourseGrounding } from '../useRagData';
import { CHECK_CLAIMS } from './courseContent';
import { GuessButtons } from './StepMethods';
import { formatSimilarity } from './StepClose';
import { Message } from './StepWhy';
import { Lab, StepShell } from './StepShell';

const LEVEL_TEXT: Record<GroundingClaim['level'], string> = {
  quoted: 'цитата найдена дословно',
  quoteNotFound: 'такой цитаты агент не получал',
  close: 'похоже на прочитанное',
  far: 'на прочитанное не похоже',
  unchecked: 'не проверялось',
};

const VERDICT_TEXT: Record<string, string> = {
  supported: 'подтверждено',
  contradicted: 'противоречит',
  notFound: 'не нашёл',
  unclear: 'неясно',
};

const ANSWERS = [
  { value: 'ok', label: 'верно' },
  { value: 'bad', label: 'ошибка' },
] as const;

export function StepCheck({ onStep }: { onStep: (index: number) => void }): ReactElement {
  const report = useCourseGrounding();
  return (
    <StepShell
      index={6}
      onStep={onStep}
      question="Как проверить, что агент ответил правду?"
      prose={
        <>
          <p>
            Агент ответил — но мог ошибиться: перепутать цифру, приписать документу то, чего там
            нет, или выдумать. Харнесс проверяет ответ по записи сессии: каждое утверждение — тремя
            способами.
          </p>
          <p>
            <b>Код</b> ищет цитаты в кавычках дословно в том, что агент прочитал. <b>Сходство</b>{' '}
            находит самую близкую прочитанную строку (как на шаге 6). <b>Судья</b> — другая модель:
            ей показывают утверждение и ближайшие строки и спрашивают, подтверждают ли они его. Код
            и сходство — проверка, судья — мнение.
          </p>
        </>
      }
      lab={
        report.status === 'ready' ? (
          <CheckLab report={report.value} />
        ) : (
          <p className={report.status === 'error' ? styles.bad : styles.hint}>
            {report.status === 'loading' ? 'Проверяем ответ…' : report.message}
          </p>
        )
      }
      notice="Пройдите все пять. Выдуманную цитату (5) ловит только код. Выдуманный факт про обеды (4) — сходство: на прочитанное не похоже. «До 2 дней» вместо трёх (3) код и сходство пропускают — тема та же, — а судья замечает. Ни один способ не ловит всё, а судья — тоже модель и может ошибиться."
      takeaway="Найти — половина дела. Хороший харнесс ещё и проверяет, на что опирается ответ, — несколькими способами, потому что каждый видит своё."
    />
  );
}

function CheckLab({ report }: { report: GroundingReportResponse }): ReactElement {
  const [current, setCurrent] = useState(0);
  const [guess, setGuess] = useState<'ok' | 'bad' | null>(null);
  const claims = CHECK_CLAIMS.map((number) =>
    report.claims.find((claim) => claim.number === number),
  );
  const claim = claims[current];
  return (
    <Lab
      title="Опыт: найдите ошибку"
      hint="Ответ агента про удалёнку, в который специально подложили четыре ошибки. Выберите утверждение и решите: верно или нет?"
    >
      <div className={styles.choices} role="group" aria-label="Утверждение">
        {claims.map((item, index) => (
          <button
            key={item?.number ?? index}
            type="button"
            className={styles.choice}
            aria-pressed={index === current}
            onClick={() => {
              setCurrent(index);
              setGuess(null);
            }}
          >
            утверждение {index + 1}
          </button>
        ))}
      </div>
      {claim === undefined ? (
        <p className={styles.bad}>В учебном трейсе нет этого утверждения.</p>
      ) : (
        <ClaimQuiz
          claim={claim}
          guess={guess}
          onGuess={setGuess}
          threshold={report.similarityThreshold}
        />
      )}
    </Lab>
  );
}

interface ClaimQuizProps {
  claim: GroundingClaim;
  guess: 'ok' | 'bad' | null;
  onGuess: (guess: 'ok' | 'bad') => void;
  threshold: number;
}

function ClaimQuiz({ claim, guess, onGuess, threshold }: ClaimQuizProps): ReactElement {
  const wrong = claim.judge?.verdict !== 'supported';
  const right = (guess === 'bad') === wrong;
  return (
    <>
      <Message role="в ответе агента">{claim.text}</Message>
      <Message role={closestRole(claim)} tone="found">
        {claim.similarity?.passage ?? '—'}
      </Message>
      <GuessButtons options={ANSWERS} value={guess} onChange={onGuess} />
      {guess !== null && (
        <>
          <p className={right ? styles.good : styles.bad}>
            {right ? 'Верно.' : 'Не совсем.'} {wrong ? 'Это ошибка.' : 'Утверждение верное.'}
          </p>
          <CheckTable claim={claim} threshold={threshold} />
        </>
      )}
    </>
  );
}

function closestRole(claim: GroundingClaim): string {
  const source = claim.similarity?.documentId ?? null;
  return `ближайшее, что агент прочитал${source === null ? '' : ` · ${source}`}`;
}

function CheckTable(props: { claim: GroundingClaim; threshold: number }): ReactElement {
  const { claim, threshold } = props;
  const score = claim.similarity?.score;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Кто проверял</th>
            <th>Что увидел</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>код</td>
            <td>
              {claim.quotes.length > 0 ? LEVEL_TEXT[claim.level] : 'цитат нет — проверять нечего'}
            </td>
          </tr>
          <tr>
            <td>сходство</td>
            <td>
              {score === undefined ? (
                'не считалось'
              ) : (
                <>
                  <span className={styles.number}>{formatSimilarity(score)}</span> —{' '}
                  {score >= threshold
                    ? 'выше порога: «про то же»'
                    : 'ниже порога: повод присмотреться'}
                </>
              )}
            </td>
          </tr>
          <tr>
            <td>судья</td>
            <td>
              {claim.judge === null ? (
                'не звали'
              ) : (
                <>
                  <b>{VERDICT_TEXT[claim.judge.verdict] ?? claim.judge.verdict}</b>:{' '}
                  {claim.judge.explanation}
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
