// Шаг 5. Близко — не значит верно: сходство векторов говорит «про то же», а не «правда».

import { useState, type CSSProperties, type ReactElement } from 'react';
import styles from '../RagLab.module.css';
import { useEmbeddings } from '../useRagData';
import { cosine } from '../vectors';
import { PAIRS } from './courseContent';
import { Lab, StepShell } from './StepShell';

const TEXTS = PAIRS.flatMap((pair) => [pair.first, pair.second]);
// Порог «про то же» у проверки опоры (harness.config.json, grounding.similarityThreshold).
const THRESHOLD = 0.87;
// Шкала: у этой модели почти всё лежит выше 0,75.
const SCALE_FROM = 0.75;

export function StepClose({ onStep }: { onStep: (index: number) => void }): ReactElement {
  return (
    <StepShell
      index={4}
      onStep={onStep}
      question="Если тексты похожи — значит, это правда?"
      prose={
        <>
          <p>
            Сходство векторов говорит, <i>о чём</i> текст. Но не говорит, <i>правда ли</i> в нём
            написана. Два предложения про одно и то же с разными цифрами для модели почти одинаковы.
          </p>
          <p>
            Это важно дальше: харнесс проверяет ответ агента и в том числе сравнивает каждое
            утверждение с тем, что агент прочитал. Если сходство выше порога 0,87, утверждение
            считается «про то же». Верно ли оно — уже другой вопрос.
          </p>
        </>
      }
      lab={<PairsLab />}
      notice="«Отпуск 28 дней» и «отпуск 35 дней» — самая близкая пара, хотя одна из фраз неверна. На настоящих ответах так же: утверждение, противоречащее документу, получает сходство 0,87–0,91, верное — 0,88–0,95. Числом их не различить."
      takeaway="Сходство отвечает на вопрос «про то же?», а не «верно ли?». Чтобы проверить факты, нужно что-то ещё."
    />
  );
}

function PairsLab(): ReactElement {
  const vectors = useEmbeddings(TEXTS);
  const [guess, setGuess] = useState<number | null>(null);
  return (
    <Lab
      title="Опыт: какая пара фраз, по мнению модели, ближе всего?"
      hint="Выберите пару — покажем сходство всех."
    >
      <div className={styles.choices} role="group" aria-label="Пара">
        {PAIRS.map((pair, index) => (
          <button
            key={pair.first}
            type="button"
            className={styles.choice}
            aria-pressed={guess === index}
            onClick={() => {
              setGuess(index);
            }}
          >
            «{pair.first}» и «{pair.second}»
          </button>
        ))}
      </div>
      {guess !== null && vectors.status === 'loading' && (
        <p className={styles.hint}>Считаем векторы…</p>
      )}
      {guess !== null && vectors.status === 'error' && (
        <p className={styles.bad}>{vectors.message}</p>
      )}
      {guess !== null && vectors.status === 'ready' && (
        <PairScales vectors={vectors.value} guess={guess} />
      )}
    </Lab>
  );
}

function PairScales({ vectors, guess }: { vectors: number[][]; guess: number }): ReactElement {
  const pairs = PAIRS.map((pair, index) => ({
    ...pair,
    index,
    similarity: cosine(vectors[index * 2] ?? [], vectors[index * 2 + 1] ?? []),
  })).sort((left, right) => right.similarity - left.similarity);
  const closest = pairs[0];
  return (
    <>
      <p className={closest?.index === guess ? styles.good : styles.bad}>
        {closest?.index === guess ? 'Верно.' : 'Не угадали.'} Ближе всех — «{closest?.first}» и «
        {closest?.second}».
      </p>
      <ul className={styles.pairs}>
        {pairs.map((pair) => (
          <li key={pair.first} data-picked={pair.index === guess ? 'true' : undefined}>
            <span>«{pair.first}»</span>
            <span>«{pair.second}»</span>
            <SimilarityScale value={pair.similarity} />
          </li>
        ))}
      </ul>
    </>
  );
}

const percent = (value: number): string =>
  `${String(Math.max(0, ((value - SCALE_FROM) / (1 - SCALE_FROM)) * 100))}%`;

export function SimilarityScale({ value }: { value: number }): ReactElement {
  return (
    <span
      className={styles.scale}
      style={{ '--value': percent(value), '--threshold': percent(THRESHOLD) } as CSSProperties}
      aria-label={`сходство ${formatSimilarity(value)}, порог 0,87`}
    >
      <span className={styles.scaleFill} />
      <span className={styles.scaleThreshold} />
      <span className={styles.scaleValue}>{formatSimilarity(value)}</span>
      <span className={styles.scaleLabel}>порог 0,87</span>
    </span>
  );
}

export function formatSimilarity(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
