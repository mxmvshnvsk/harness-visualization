// Развилка (этап 11.3): ответ прогона при T = 1 до выбранного места, вместо токена модели —
// другой вариант, и модель продолжает (prefix completion DeepSeek, бета). Видно, куда уводит
// одна замена: к другому правилу, к другой форме или никуда.

import { useMemo, type ReactElement } from 'react';
import type { TokenLabRunResponse } from '@harness-visualization/server';
import { projectTokenLab, type TokenLabAnswer } from '../../projections/projectTokenLab';
import labStyles from '../rag/RagLab.module.css';
import { showToken, TokenExplorer } from './AnswerCard';
import styles from './TokenLab.module.css';

export interface ForkState {
  key: string;
  position: number;
  token: string;
  status: 'running' | 'ready' | 'error';
  run: TokenLabRunResponse | null;
  error: string | null;
}

export function ForkCard(props: { fork: ForkState; original: TokenLabAnswer }): ReactElement {
  const { fork, original } = props;
  const view = useMemo(
    () => (fork.run === null ? null : projectTokenLab(fork.run.events)),
    [fork.run],
  );
  const parts = splitAt(original, fork.position);
  const answer = view?.answers[0];
  return (
    <section className={labStyles.card}>
      <h2 className={styles.cardTitle}>
        Развилка на токене {fork.position + 1}: <code>{showToken(parts.replaced)}</code> →{' '}
        <code>{showToken(fork.token)}</code>
      </h2>
      <div className={styles.columns2}>
        <div className={styles.column}>
          <b>как ответила модель</b>
          <p>
            <span className={styles.muted}>{parts.before}</span>
            <mark className={styles.replaced}>{parts.replaced}</mark>
            {parts.after}
          </p>
        </div>
        <ForkColumn
          fork={fork}
          before={parts.before}
          answer={answer}
          error={fork.error ?? view?.error ?? null}
        />
      </div>
      {answer !== undefined && answer.tokens.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Продолжение по токенам</h3>
          <TokenExplorer tokens={answer.tokens} />
        </>
      )}
      {fork.run !== null && <p className={styles.muted}>Трейс развилки: {fork.run.file}</p>}
    </section>
  );
}

function ForkColumn(props: {
  fork: ForkState;
  before: string;
  answer: TokenLabAnswer | undefined;
  error: string | null;
}): ReactElement {
  return (
    <div className={styles.column}>
      <b>развилка</b>
      {props.fork.status === 'running' && <p className={styles.muted}>Модель продолжает…</p>}
      {props.error !== null && <p className={styles.error}>{props.error}</p>}
      {props.answer !== undefined && (
        <p>
          <span className={styles.muted}>{props.before}</span>
          <mark className={styles.forked}>{props.fork.token}</mark>
          {props.answer.text}
        </p>
      )}
    </div>
  );
}

// Ответ модели: до развилки, заменённый токен, после.
function splitAt(
  answer: TokenLabAnswer,
  position: number,
): { before: string; replaced: string; after: string } {
  const text = (from: number, to?: number): string =>
    answer.tokens
      .slice(from, to)
      .map((token) => token.text)
      .join('');
  return {
    before: text(0, position),
    replaced: answer.tokens[position]?.text ?? '',
    after: text(position + 1),
  };
}
