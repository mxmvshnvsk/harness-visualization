// На что опирается ответ записанной сессии: каждое утверждение сравнивается с тем, что
// модель прочитала (код — цитаты, сходство — ближайшая строка). Мнения судьи — если сессию
// проверяли через pnpm check-grounding --judge; сам вид модель не зовёт.

import type { GroundingClaim } from '@harness-visualization/server';
import type { ReactElement } from 'react';
import { useGrounding } from '../useRagData';
import { formatSimilarity } from './retrievalLabels';
import styles from './Retrieval.module.css';
import { LabLink } from '../../../app/labLinks';

const LEVEL_TEXT: Record<GroundingClaim['level'], string> = {
  quoted: 'цитата найдена',
  quoteNotFound: 'такой цитаты не было',
  close: 'похоже на прочитанное',
  far: 'ниже порога',
  unchecked: 'не проверялось',
};

const VERDICT_TEXT: Record<string, string> = {
  supported: 'судья: подтверждено',
  contradicted: 'судья: противоречит',
  notFound: 'судья: не нашёл',
  unclear: 'судья: неясно',
};

export function AnswerSupport({ file }: { file: string }): ReactElement {
  const report = useGrounding(file);
  return (
    <section className={styles.card} data-tour="grounding">
      <h2 className={styles.title}>На что опирается ответ</h2>
      {report.status === 'ready' ? (
        <>
          <p className={styles.sub}>
            Каждое утверждение ответа сравнивается с тем, что модель прочитала в этой сессии (порог{' '}
            {formatSimilarity(report.value.similarityThreshold)}).{' '}
            {report.value.judgeTrace === null
              ? 'Судью по этой сессии не звали: pnpm check-grounding --judge.'
              : `Мнения судьи — из ${report.value.judgeTrace}.`}
          </p>
          <ol className={styles.claims}>
            {report.value.claims.map((claim) => (
              <ClaimRow key={claim.number} claim={claim} />
            ))}
          </ol>
          <LabLink className={styles.link} lab="rag" step="check">
            Как устроена такая проверка — шаг 7 лаборатории RAG →
          </LabLink>
        </>
      ) : (
        <p className={styles.sub}>
          {report.status === 'loading' ? 'Проверяем ответ…' : report.message}
        </p>
      )}
    </section>
  );
}

function ClaimRow({ claim }: { claim: GroundingClaim }): ReactElement {
  return (
    <li data-disagree={claim.disagree ? 'true' : undefined}>
      <span className={styles.rank}>{claim.number}</span>
      <span>{claim.text}</span>
      <span className={styles.level} data-level={claim.level}>
        <b>{LEVEL_TEXT[claim.level]}</b>
        {claim.similarity !== null && (
          <span>
            {formatSimilarity(claim.similarity.score)}
            {claim.similarity.documentId !== null && ` · ${claim.similarity.documentId}`}
          </span>
        )}
        {claim.judge !== null && (
          <span>{VERDICT_TEXT[claim.judge.verdict] ?? claim.judge.verdict}</span>
        )}
      </span>
    </li>
  );
}
