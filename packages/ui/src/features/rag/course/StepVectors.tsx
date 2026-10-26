// Шаг 3. Как машина видит смысл: вектор, косинусное сходство, угадайка и карта фраз.

import { useState, type CSSProperties, type ReactElement } from 'react';
import { useEmbeddings } from '../useRagData';
import styles from '../RagLab.module.css';
import { cosine, pca } from '../vectors';
import { PHRASES, PROBE, TOPICS, type Topic } from './courseContent';
import { CourseTerm, Lab, StepShell } from './StepShell';
import { formatRu } from '../../../text/formatNumber';

const TEXTS = [...PHRASES.map((phrase) => phrase.text), PROBE];

// Цвет темы — палитра карты лаборатории (--rag-*), проверена validate_palette.js.
export const TOPIC_COLORS: Record<Topic, string> = {
  отпуск: 'var(--rag-regulation)',
  удалёнка: 'var(--rag-faq)',
  больничный: 'var(--rag-meeting)',
  техника: 'var(--rag-other)',
};

export function StepVectors({ onStep }: { onStep: (index: number) => void }): ReactElement {
  const vectors = useEmbeddings(TEXTS);
  return (
    <StepShell
      index={2}
      onStep={onStep}
      question="Как машина видит смысл текста?"
      prose={<VectorProse first={vectors.status === 'ready' ? vectors.value[0] : undefined} />}
      lab={
        vectors.status === 'ready' ? (
          <>
            <GuessLab vectors={vectors.value} />
            <ToyMap vectors={vectors.value} />
          </>
        ) : (
          <p className={styles.hint}>
            {vectors.status === 'loading' ? 'Считаем векторы фраз…' : vectors.message}
          </p>
        )
      }
      notice="«Сколько дней можно отдыхать» и «ежегодный отпуск 28 дней» — без общих слов, но обе близки к отпуску. Это и умеет поиск по смыслу. Болезнь и удалёнка на карте перемешаны: они и по смыслу близки — обе про «не в офисе», — а карта ещё и сжата. А в угадайке модель цепляется за слово «дома»: смысл она ловит не всегда так, как человек."
      takeaway="Текст превращается в точку в многомерном пространстве; поиск по смыслу — это поиск ближайших точек к вопросу. Близость по числам похожа на близость по смыслу, но не равна ей."
    />
  );
}

function VectorProse({ first }: { first: number[] | undefined }): ReactElement {
  return (
    <>
      <p>
        Чтобы искать «по смыслу», компьютеру нужно как-то измерять смысл. Модель эмбеддингов
        превращает текст в список из 384 чисел —{' '}
        <CourseTerm tip="Вектор (эмбеддинг) — список чисел, который модель ставит в соответствие тексту. Похожие по смыслу тексты получают похожие списки.">
          вектор
        </CourseTerm>
        . Вот начало вектора фразы «{PHRASES[0]?.text}»:
      </p>
      <p className={styles.vector}>
        [
        {(first ?? [])
          .slice(0, 8)
          .map((value) => formatRu(value, { maximumFractionDigits: 3 }))
          .join('; ')}
        ; … ещё 376 чисел]
      </p>
      <p>
        Сами числа ничего не значат. Важно другое: тексты про одно и то же получают похожие векторы.
        Думайте о векторе как о координатах на карте — только измерений не два, а 384. Близость двух
        текстов меряют{' '}
        <CourseTerm tip="Косинусное сходство — насколько два вектора смотрят в одну сторону: 1 — одинаково, меньше — дальше. У этой модели почти всё лежит между 0,75 и 0,95.">
          косинусным сходством
        </CourseTerm>
        : чем ближе к 1, тем ближе по смыслу.
      </p>
    </>
  );
}

function GuessLab({ vectors }: { vectors: number[][] }): ReactElement {
  const [guess, setGuess] = useState<number | null>(null);
  const probe = vectors[PHRASES.length] ?? [];
  const ranked = PHRASES.map((phrase, index) => ({
    ...phrase,
    index,
    similarity: cosine(probe, vectors[index] ?? []),
  })).sort((left, right) => right.similarity - left.similarity);
  const top = ranked[0];
  const illness = ranked.findIndex((item) => item.topic === 'больничный') + 1;
  return (
    <Lab
      title="Опыт: угадайте, что модель сочтёт ближайшим"
      hint={`Какая фраза ближе всего по смыслу к «${PROBE}»?`}
    >
      <div className={styles.choices}>
        {PHRASES.map((phrase, index) => (
          <button
            key={phrase.text}
            type="button"
            className={styles.choice}
            aria-pressed={guess === index}
            onClick={() => {
              setGuess(index);
            }}
          >
            {phrase.text}
          </button>
        ))}
      </div>
      {guess === null ? (
        <p className={styles.hint}>Выберите ответ — покажем, как посчитала модель.</p>
      ) : (
        <>
          <SimilarityList items={ranked} picked={guess} />
          <p className={styles.hint}>
            Ближе всех — «{top?.text}». Первая фраза про болезнь — на {illness}-м месте.
          </p>
        </>
      )}
    </Lab>
  );
}

interface RankedPhrase {
  text: string;
  topic: Topic;
  index: number;
  similarity: number;
}

function SimilarityList({
  items,
  picked,
}: {
  items: RankedPhrase[];
  picked: number;
}): ReactElement {
  const width = (similarity: number): string =>
    `${String(Math.max(2, ((similarity - 0.75) / 0.15) * 100))}%`;
  return (
    <ol className={styles.ranked}>
      {items.map((item, place) => (
        <li key={item.text} data-picked={item.index === picked ? 'true' : undefined}>
          <span className={styles.muted}>{place + 1}</span>
          <span>
            {item.text}
            {item.index === picked && ' ← ваш выбор'}
          </span>
          <span className={styles.simbar}>
            <span style={{ width: width(item.similarity), background: TOPIC_COLORS[item.topic] }} />
          </span>
          <span className={styles.number}>
            {formatRu(item.similarity, {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })}
          </span>
        </li>
      ))}
    </ol>
  );
}

const MAP_WIDTH = 520;
const MAP_HEIGHT = 300;
const MAP_PAD = 30;

function ToyMap({ vectors }: { vectors: number[][] }): ReactElement {
  const projection = pca(vectors.slice(0, PHRASES.length), [vectors[PHRASES.length] ?? []]);
  const all = [...projection.points, ...projection.extra];
  const scale = scaler(all);
  const probe = projection.extra[0] ?? [0, 0];
  return (
    <Lab
      title="Те же фразы на карте"
      hint="384 измерения сжаты в два — это упрощение: часть расстояний искажена. Цвет — тема фразы."
    >
      <div className={styles.toy}>
        <svg
          className={styles.map}
          viewBox={`0 0 ${String(MAP_WIDTH)} ${String(MAP_HEIGHT)}`}
          role="img"
          aria-label="Карта учебных фраз"
        >
          {projection.points.map((point, index) => (
            <g key={PHRASES[index]?.text}>
              <circle
                cx={scale.x(point[0])}
                cy={scale.y(point[1])}
                r={9}
                fill={TOPIC_COLORS[PHRASES[index]?.topic ?? 'техника']}
                className={styles.dot}
              />
              <text x={scale.x(point[0])} y={scale.y(point[1]) + 3.5} className={styles.dotLabel}>
                {index + 1}
              </text>
            </g>
          ))}
          <path d={star(scale.x(probe[0]), scale.y(probe[1]))} className={styles.star} />
        </svg>
        <div className={styles.stack}>
          <PhraseList />
          <ul className={styles.legend}>
            {TOPICS.map((topic) => (
              <li key={topic} style={{ '--swatch': TOPIC_COLORS[topic] } as CSSProperties}>
                {topic}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Lab>
  );
}

// Подписи к карте: номер точки — фраза, звёздочка — пробная фраза.
function PhraseList(): ReactElement {
  return (
    <ol className={styles.phraseList}>
      {PHRASES.map((phrase, index) => (
        <li key={phrase.text}>
          <span className={styles.dotNumber} style={{ background: TOPIC_COLORS[phrase.topic] }}>
            {index + 1}
          </span>
          {phrase.text}
        </li>
      ))}
      <li>
        <span className={styles.dotNumber}>★</span>
        <b>{PROBE}</b>
      </li>
    </ol>
  );
}

function scaler(points: readonly [number, number][]): {
  x: (value: number) => number;
  y: (value: number) => number;
} {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  return {
    x: (value) => MAP_PAD + ((value - minX) / (maxX - minX || 1)) * (MAP_WIDTH - 2 * MAP_PAD),
    y: (value) =>
      MAP_HEIGHT - MAP_PAD - ((value - minY) / (maxY - minY || 1)) * (MAP_HEIGHT - 2 * MAP_PAD),
  };
}

export function star(x: number, y: number): string {
  const outer = 11;
  const inner = 4.6;
  const points = Array.from({ length: 10 }, (_unused, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return `${(x + radius * Math.cos(angle)).toFixed(1)} ${(y + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${points.join('L')}Z`;
}
