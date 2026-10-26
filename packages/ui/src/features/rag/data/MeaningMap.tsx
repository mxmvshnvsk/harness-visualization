// Карта смыслов: все фрагменты базы точками, запрос — звездой, пунктир — пять ближайших
// по косинусу. Карта — сжатие 384 измерений в два: расстояние на ней не равно косинусу,
// поэтому точный порядок — в списке рядом.

import type { LabBase, LabQuestion, LabSearch } from '@harness-visualization/mcp-server/lab';
import { useMemo, useState, type ReactElement } from 'react';
import { Segmented } from '../../../components/Segmented';
import { formatSimilarity, kindColor } from '../session/retrievalLabels';
import { star } from '../course/StepVectors';
import type { Point } from '../vectors';
import styles from './Data.module.css';
import { MapExplainer } from './MapExplainer';
import { chunksOf, pcaLayout, umapLayout, type MapChunk, type MapMethod } from './mapProjection';

const METHODS = [
  { value: 'pca', label: 'PCA' },
  { value: 'umap', label: 'UMAP' },
] as const;

const WIDTH = 640;
const HEIGHT = 440;
const PAD = 28;
const NEAREST = 5;

interface MapProps {
  base: LabBase;
  search: LabSearch;
  question: LabQuestion | null;
}

export function MeaningMap({ base, search, question }: MapProps): ReactElement {
  const [method, setMethod] = useState<MapMethod>('pca');
  const [hovered, setHovered] = useState<number | null>(null);
  // UMAP считаем, только когда его впервые выбрали, и дальше держим готовым.
  const [umapWanted, setUmapWanted] = useState(false);
  const chunks = useMemo(() => chunksOf(base), [base]);
  const layouts = useLayouts(chunks, method, umapWanted);
  const queryPoint = useMemo(
    () => layouts.project(search.queryVector),
    [layouts, search.queryVector],
  );
  const nearest = search.chunks.slice(0, NEAREST);
  const indexOf = (documentId: string, position: number): number =>
    chunks.findIndex((chunk) => chunk.document.id === documentId && chunk.position === position);
  const expected = new Set(question?.expectedDocumentIds ?? []);
  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>Карта смыслов</h2>
        <Segmented
          label="Проекция"
          options={METHODS}
          value={method}
          onChange={(next) => {
            setMethod(next);
            setUmapWanted((wanted) => wanted || next === 'umap');
          }}
          size="small"
        />
      </div>
      <MapNote count={chunks.length} method={method} />
      <MapExplainer method={method} />
      <Legend />
      <div className={styles.mapWork}>
        <MapPicture
          chunks={chunks}
          points={layouts.points}
          queryPoint={queryPoint}
          nearest={nearest.map((hit) => layouts.points[indexOf(hit.documentId, hit.position)])}
          expected={expected}
          onHover={setHovered}
        />
        <NearestList
          search={search}
          question={question}
          hovered={hovered === null ? null : (chunks[hovered] ?? null)}
        />
      </div>
    </section>
  );
}

function MapNote({ count, method }: { count: number; method: MapMethod }): ReactElement {
  return (
    <p className={styles.note} data-teaching>
      {count} фрагментов базы — точки, звезда — запрос. На плоскость 384 измерения сжимает{' '}
      {method === 'umap' ? (
        <>
          <b>UMAP</b>: бережёт соседей — темы собираются в острова, но расстояния между островами
          ничего не значат
        </>
      ) : (
        <>
          <b>PCA</b>: два главных направления разброса — честная линейная проекция, но темы часто
          слипаются
        </>
      )}
      . Расстояние на карте — не косинус: точный порядок — в списке справа.
    </p>
  );
}

interface PictureProps {
  chunks: readonly MapChunk[];
  points: readonly Point[];
  queryPoint: Point | null;
  nearest: readonly (Point | undefined)[];
  expected: ReadonlySet<string>;
  onHover: (index: number | null) => void;
}

function MapPicture(props: PictureProps): ReactElement {
  const { chunks, points, queryPoint, expected, onHover } = props;
  const scale = scaler([...points, ...(queryPoint === null ? [] : [queryPoint])]);
  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role="img"
      aria-label="Карта фрагментов базы знаний"
      onMouseLeave={() => {
        onHover(null);
      }}
    >
      {queryPoint !== null &&
        props.nearest.map((point, index) =>
          point === undefined ? null : (
            <line
              key={index}
              className={styles.nearLine}
              x1={scale.x(queryPoint[0])}
              y1={scale.y(queryPoint[1])}
              x2={scale.x(point[0])}
              y2={scale.y(point[1])}
            />
          ),
        )}
      {chunks.map((chunk, index) => (
        <ChunkDot
          key={`${chunk.document.id}-${String(chunk.position)}`}
          chunk={chunk}
          point={points[index] ?? [0, 0]}
          scale={scale}
          expected={expected.has(chunk.document.id)}
          onHover={() => {
            onHover(index);
          }}
        />
      ))}
      {queryPoint !== null && (
        <path className={styles.star} d={star(scale.x(queryPoint[0]), scale.y(queryPoint[1]))} />
      )}
    </svg>
  );
}

// UMAP — заметная работа в браузере: считается один раз, после первого выбора.
function useLayouts(chunks: readonly MapChunk[], method: MapMethod, umapWanted: boolean) {
  const vectors = useMemo(() => chunks.map((chunk) => chunk.vector), [chunks]);
  const pcaMap = useMemo(() => pcaLayout(vectors), [vectors]);
  const umapMap = useMemo(() => (umapWanted ? umapLayout(vectors) : null), [vectors, umapWanted]);
  return method === 'umap' && umapMap !== null ? umapMap : pcaMap;
}

interface DotProps {
  chunk: MapChunk;
  point: Point;
  scale: ReturnType<typeof scaler>;
  expected: boolean;
  onHover: () => void;
}

function ChunkDot({ chunk, point, scale, expected, onHover }: DotProps): ReactElement {
  const x = scale.x(point[0]);
  const y = scale.y(point[1]);
  return (
    <g onMouseEnter={onHover}>
      {expected && <circle className={styles.ring} cx={x} cy={y} r={10} />}
      <circle className={styles.dot} cx={x} cy={y} r={5.5} fill={kindColor(chunk.document.type)} />
      <circle cx={x} cy={y} r={12} fill="transparent" />
    </g>
  );
}

function Legend(): ReactElement {
  const kinds = [
    { type: 'regulation', label: 'регламент' },
    { type: 'faq', label: 'FAQ' },
    { type: 'meeting', label: 'встреча' },
    { type: 'other', label: 'другое' },
  ];
  return (
    <ul className={styles.legend}>
      {kinds.map((kind) => (
        <li key={kind.type}>
          <span className={styles.swatch} style={{ background: kindColor(kind.type) }} />
          {kind.label}
        </li>
      ))}
      <li>
        <span className={styles.ringSwatch} />
        документ с ответом
      </li>
      <li>
        <span className={styles.lineSwatch} />
        {NEAREST} ближайших по косинусу
      </li>
    </ul>
  );
}

interface NearestProps {
  search: LabSearch;
  question: LabQuestion | null;
  hovered: MapChunk | null;
}

function NearestList({ search, question, hovered }: NearestProps): ReactElement {
  const total = search.chunks.length;
  return (
    <div className={styles.side}>
      <h3 className={styles.caption}>поиск по смыслу · фрагменты</h3>
      <ol className={styles.hits}>
        {search.chunks.slice(0, NEAREST).map((hit, index) => (
          <li key={`${hit.documentId}-${String(hit.position)}`}>
            <span className={styles.muted}>{index + 1}</span>
            <span className={styles.mono}>
              {hit.documentId} · фр. {hit.position}
            </span>
            <span className={styles.number}>{formatSimilarity(hit.similarity)}</span>
          </li>
        ))}
      </ol>
      {question !== null && (
        <>
          <h3 className={styles.caption}>лучший фрагмент документа с ответом</h3>
          <ul className={styles.hits}>
            {question.expectedDocumentIds.map((id) => {
              const place = search.chunks.findIndex((hit) => hit.documentId === id) + 1;
              return (
                <li key={id}>
                  <span className={styles.muted}>✓</span>
                  <span className={styles.mono}>{id}</span>
                  <span className={place > 0 && place <= NEAREST ? styles.good : styles.bad}>
                    {place} из {total}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={styles.note} data-teaching>
            {question.checks}
          </p>
        </>
      )}
      <div className={styles.hover}>
        {hovered === null ? (
          <span className={styles.muted}>Наведите на точку — покажем фрагмент.</span>
        ) : (
          <>
            <b>{hovered.document.title}</b>
            <span className={styles.mono}>
              {hovered.document.id} · фрагмент {hovered.position}
            </span>
            <span>
              {hovered.text.slice(0, 240)}
              {hovered.text.length > 240 ? '…' : ''}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function scaler(points: readonly Point[]): {
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
    x: (value) => PAD + ((value - minX) / (maxX - minX || 1)) * (WIDTH - 2 * PAD),
    y: (value) => HEIGHT - PAD - ((value - minY) / (maxY - minY || 1)) * (HEIGHT - 2 * PAD),
  };
}
