// Температура (этап 11): сначала настоящие ответы при T = 0, 1 и 1.5 — DeepSeek отдаёт
// вероятности уже после температуры, поэтому распределения видны как есть, — потом пересчёт
// в браузере по топ-20 одной позиции ответа при T = 1, с top_p и «вытянуть 20 раз».

import { useState, type ReactElement } from 'react';
import {
  applyTemperature,
  applyTopP,
  drawToken,
  tokenStats,
  type TokenLabAnswer,
  type TokenLabView,
  type TokenView,
} from '../../projections/projectTokenLab';
import labStyles from '../rag/RagLab.module.css';
import { OptionBars, showToken } from './AnswerCard';
import styles from './TokenLab.module.css';

export function TemperatureCard({ view }: { view: TokenLabView }): ReactElement {
  const answers = [...view.answers].sort(
    (left, right) => (left.temperature ?? 1) - (right.temperature ?? 1),
  );
  const base = view.answers.find((answer) => answer.temperature === 1);
  return (
    <section className={labStyles.card}>
      <h2 className={styles.cardTitle}>Температура</h2>
      <p className={styles.muted}>
        Модель отдаёт вероятности, а токен выбирает сэмплер — код после модели. Температура меняет
        форму распределения: при 0 всегда берётся самый вероятный токен, при 1 — как посчитала
        модель, выше 1 — редкие варианты получают больше шансов. Тот же вопрос, три запроса:
      </p>
      <div className={styles.columns}>
        {answers.map((answer, index) => (
          <AnswerColumn key={index} answer={answer} />
        ))}
      </div>
      {view.reasoningEffort !== 'off' && (
        <p className={styles.note} data-teaching>
          С рассуждениями DeepSeek temperature не применяет: «не вызывает ошибки, но и не действует»
          (документация). Сравните первый токен в трёх столбцах — распределения должны совпадать.
        </p>
      )}
      {base !== undefined && base.tokens.length > 0 && <Resampler tokens={base.tokens} />}
    </section>
  );
}

function AnswerColumn({ answer }: { answer: TokenLabAnswer }): ReactElement {
  const first = answer.tokens[0];
  const stats = tokenStats(answer.tokens);
  return (
    <div className={styles.column}>
      <b>temperature {answer.temperature ?? '—'}</b>
      <p>{answer.text ?? '—'}</p>
      {first !== undefined && (
        <>
          <span className={styles.muted}>первый токен:</span>
          <OptionBars options={first.options.slice(0, 5)} chosen={first.text} />
        </>
      )}
      <span className={styles.muted}>
        {stats.count} токенов · развилок {stats.forks}
      </span>
    </div>
  );
}

// Позиции, где модель колебалась сильнее всего, — с них интереснее начать.
function doubtfulPositions(tokens: readonly TokenView[]): number[] {
  return tokens
    .map((token, index) => ({ index, probability: token.probability }))
    .sort((left, right) => left.probability - right.probability)
    .slice(0, 6)
    .map((item) => item.index)
    .sort((left, right) => left - right);
}

function Resampler({ tokens }: { tokens: readonly TokenView[] }): ReactElement {
  const positions = doubtfulPositions(tokens);
  const [position, setPosition] = useState(positions[0] ?? 0);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [draws, setDraws] = useState<string[]>([]);
  const token = tokens[position];
  const options = applyTopP(applyTemperature(token?.options ?? [], temperature), topP);
  const reset = (apply: () => void) => () => {
    apply();
    setDraws([]);
  };
  return (
    <div className={styles.stack}>
      <h3 className={styles.subTitle}>Пересчёт в браузере: ответ при T = 1, одна позиция</h3>
      <PositionChips
        tokens={tokens}
        positions={positions}
        position={position}
        onPick={(index) => reset(() => setPosition(index))()}
      />
      <Prefix tokens={tokens} position={position} />
      <Slider
        label="temperature"
        min={0}
        max={2}
        step={0.1}
        value={temperature}
        onChange={(value) => reset(() => setTemperature(value))()}
      />
      <Slider
        label="top_p"
        min={0.5}
        max={1}
        step={0.05}
        value={topP}
        onChange={(value) => reset(() => setTopP(value))()}
      />
      <OptionBars options={options.slice(0, 8)} chosen={token?.text ?? null} zeroLabel="отрезан" />
      <Draws
        draws={draws}
        chosen={token?.text ?? null}
        onDraw={() => setDraws(Array.from({ length: 20 }, () => drawToken(options, Math.random())))}
      />
      <p className={styles.note} data-teaching>
        Честно о пересчёте: API отдаёт 20 самых вероятных токенов на позицию — хвост из остальных мы
        не видим и пересчитываем только эти 20. Для формы распределения этого хватает: на хвост
        обычно приходятся доли процента.
      </p>
    </div>
  );
}

function PositionChips(props: {
  tokens: readonly TokenView[];
  positions: readonly number[];
  position: number;
  onPick: (index: number) => void;
}): ReactElement {
  return (
    <div className={styles.presets}>
      {props.positions.map((index) => (
        <button
          key={index}
          type="button"
          className={styles.preset}
          aria-pressed={props.position === index}
          onClick={() => props.onPick(index)}
        >
          {showToken(props.tokens[index]?.text ?? '')}
        </button>
      ))}
    </div>
  );
}

// Восемь токенов перед позицией — чтобы было видно, что модель продолжает.
function Prefix(props: { tokens: readonly TokenView[]; position: number }): ReactElement {
  const prefix = props.tokens
    .slice(Math.max(0, props.position - 8), props.position)
    .map((item) => item.text)
    .join('');
  return (
    <p>
      {props.position === 0 ? '(начало ответа) ' : `…${prefix}`}
      <span className={styles.cursor} /> <span className={styles.muted}>— какой токен дальше?</span>
    </p>
  );
}

function Draws(props: {
  draws: readonly string[];
  chosen: string | null;
  onDraw: () => void;
}): ReactElement {
  return (
    <div className={styles.row}>
      <button type="button" className={styles.preset} onClick={props.onDraw}>
        Вытянуть 20 раз
      </button>
      <span className={styles.draws}>
        {props.draws.map((draw, index) => (
          <code key={index} data-rare={draw !== props.chosen}>
            {showToken(draw)}
          </code>
        ))}
      </span>
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className={styles.slider}>
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <output>{props.value.toFixed(2)}</output>
    </label>
  );
}
