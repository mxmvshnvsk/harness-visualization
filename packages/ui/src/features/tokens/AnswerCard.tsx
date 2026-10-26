// Ответ по токенам (этап 11): текст, раскрашенный по вероятности выбранного токена — один
// оттенок, гуще — сомнительнее (решение автора: низкая вероятность — не «плохо», светофор
// здесь врал бы), — и альтернативы токена, на который нажали.

import { useState, type CSSProperties, type ReactElement } from 'react';
import {
  FORK_THRESHOLD,
  tokenStats,
  type TokenLabAnswer,
  type TokenLabView,
  type TokenView,
} from '../../projections/projectTokenLab';
import labStyles from '../rag/RagLab.module.css';
import styles from './TokenLab.module.css';

export function formatProbability(probability: number): string {
  if (probability >= 0.995) {
    return '>99 %';
  }
  if (probability > 0 && probability < 0.001) {
    return '<0.1 %';
  }
  return `${(probability * 100).toFixed(probability < 0.1 ? 1 : 0)} %`;
}

// Пробел — часть токена; показываем его точкой, иначе токен « Т» не отличить от «Т».
export function showToken(text: string): string {
  return text.replace(/^ /u, '·').replaceAll('\n', '↵');
}

// Насколько густой фон: корень растягивает частые 70–95 %, иначе их не отличить от 100 %.
export function doubtOf(probability: number): number {
  return Math.round(Math.sqrt(Math.max(0, 1 - probability)) * 85);
}

export function AnswerCard(props: {
  view: TokenLabView;
  answer: TokenLabAnswer;
  onFork?: ForkHandler;
}): ReactElement {
  const { answer } = props;
  const stats = tokenStats(answer.tokens);
  return (
    <section className={labStyles.card}>
      <h2 className={styles.cardTitle}>«{props.view.question}»</h2>
      <p className={styles.muted}>
        Ответ при temperature {answer.temperature ?? 'по умолчанию'} — как посчитала модель.{' '}
        {props.view.model} ·{' '}
        {props.view.reasoningEffort === 'off' ? 'без рассуждений' : 'с рассуждениями'}
      </p>
      <TokenExplorer tokens={answer.tokens} onFork={props.onFork} />
      <div className={styles.stats}>
        <Stat label="токенов в ответе" value={String(stats.count)} />
        <Stat
          label={`развилок — меньше ${String(FORK_THRESHOLD * 100)} %`}
          value={String(stats.forks)}
        />
        <Stat
          label="средняя уверенность"
          value={formatProbability(stats.meanProbability)}
          note="геометрическое среднее"
        />
      </div>
      <p className={styles.note} data-teaching>
        Высокая уверенность — не доказательство правды: модель бывает уверена и в выдуманном. Опору
        ответа на источники проверяет другое — лаборатория RAG, «Опора ответа».
      </p>
    </section>
  );
}

export function ReasoningCard({ answer }: { answer: TokenLabAnswer }): ReactElement {
  const [open, setOpen] = useState(false);
  const stats = tokenStats(answer.reasoningTokens);
  return (
    <section className={labStyles.card}>
      <h2 className={styles.cardTitle}>Рассуждение по токенам</h2>
      <p className={styles.muted}>
        DeepSeek отдаёт вероятности и для рассуждения — {stats.count} токенов, развилок{' '}
        {stats.forks}, средняя уверенность {formatProbability(stats.meanProbability)}. Документация
        об этом молчит — это показала проба 26.10.2026.
      </p>
      {open ? (
        <TokenExplorer tokens={answer.reasoningTokens} />
      ) : (
        <button type="button" className={styles.link} onClick={() => setOpen(true)}>
          Показать рассуждение
        </button>
      )}
    </section>
  );
}

// onFork — развилка (11.3): продолжить ответ с другого токена на этом месте.
export type ForkHandler = (position: number, token: string) => void;

export function TokenExplorer({
  tokens,
  onFork,
  stacked = false,
}: {
  tokens: readonly TokenView[];
  onFork?: ForkHandler;
  // В узкой колонке (инспектор, экран шагов): текст, под ним альтернативы.
  stacked?: boolean;
}): ReactElement {
  const firstFork = tokens.findIndex((token) => token.probability < FORK_THRESHOLD);
  const [picked, setPicked] = useState(Math.max(0, firstFork));
  const [colored, setColored] = useState(true);
  const token = tokens[picked];
  return (
    <div className={stacked ? styles.explorerStacked : styles.explorer}>
      <div className={styles.stack}>
        <div className={styles.answer} data-colored={colored}>
          {tokens.map((item, index) => (
            <button
              key={index}
              type="button"
              className={styles.token}
              style={{ '--doubt': String(doubtOf(item.probability)) } as CSSProperties}
              aria-pressed={picked === index}
              title={formatProbability(item.probability)}
              onClick={() => setPicked(index)}
            >
              {item.text}
            </button>
          ))}
        </div>
        <label className={styles.muted}>
          <input type="checkbox" checked={colored} onChange={() => setColored(!colored)} />{' '}
          раскраска по уверенности: гуще — модель сомневалась
        </label>
      </div>
      {token !== undefined && (
        <TokenOptions token={token} index={picked} count={tokens.length} onFork={onFork} />
      )}
    </div>
  );
}

function TokenOptions(props: {
  token: TokenView;
  index: number;
  count: number;
  onFork: ForkHandler | undefined;
}): ReactElement {
  const { token } = props;
  const shown = token.options.slice(0, 8);
  const rest = 1 - shown.reduce((sum, option) => sum + option.probability, 0);
  return (
    <div className={styles.stack}>
      <h3 className={styles.subTitle}>
        Токен {props.index + 1} из {props.count}: <code>{showToken(token.text)}</code>
      </h3>
      <OptionBars options={shown} chosen={token.text} />
      {rest > 0.001 && (
        <p className={styles.muted}>остальные из топ-20 и хвост — {formatProbability(rest)}</p>
      )}
      <p className={styles.mono}>
        logprob {token.logprob.toFixed(3)} → e^{token.logprob.toFixed(3)} ={' '}
        {formatProbability(token.probability)}
      </p>
      {props.onFork !== undefined && (
        <ForkButtons token={token} index={props.index} onFork={props.onFork} />
      )}
    </div>
  );
}

// Развилка: самые вероятные из невыбранных вариантов — модель продолжит ответ с них.
function ForkButtons(props: {
  token: TokenView;
  index: number;
  onFork: ForkHandler;
}): ReactElement {
  const options = props.token.options
    .filter((option) => option.text !== props.token.text && option.probability >= 0.001)
    .slice(0, 4);
  if (options.length === 0) {
    return <p className={styles.muted}>Других заметных вариантов на этом месте нет.</p>;
  }
  return (
    <div className={styles.presets}>
      {options.map((option) => (
        <button
          key={option.text}
          type="button"
          className={styles.preset}
          onClick={() => props.onFork(props.index, option.text)}
        >
          ⑂ продолжить с <code>{showToken(option.text)}</code> ·{' '}
          {formatProbability(option.probability)}
        </button>
      ))}
    </div>
  );
}

export function OptionBars(props: {
  options: readonly { text: string; probability: number }[];
  chosen: string | null;
  // Что писать у нулевой вероятности: «отрезан» — у top_p, «0 %» — у ответа модели.
  zeroLabel?: string;
}): ReactElement {
  return (
    <ul className={styles.bars}>
      {props.options.map((option) => (
        <li key={option.text} data-chosen={option.text === props.chosen}>
          <code>{showToken(option.text)}</code>
          <span className={styles.bar}>
            <i style={{ width: `${(option.probability * 100).toFixed(1)}%` }} />
          </span>
          <span className={styles.mono}>
            {option.probability === 0
              ? (props.zeroLabel ?? '0 %')
              : formatProbability(option.probability)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat(props: { label: string; value: string; note?: string }): ReactElement {
  return (
    <div className={styles.stat}>
      <small>{props.label}</small>
      <b>{props.value}</b>
      {props.note !== undefined && <small>{props.note}</small>}
    </div>
  );
}
