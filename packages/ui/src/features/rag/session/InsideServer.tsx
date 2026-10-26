// Что происходит внутри MCP-сервера при поиске по смыслу — то, чего модель не видит.
// Запрос превращается в вектор (та же модель эмбеддингов и тот же префикс «query: », что у
// semantic_search), сравнивается косинусом с векторами фрагментов из индекса, а модели
// уходит только текст с числом сходства. Векторы считаются заново, когда блок открыли:
// в трейсе их нет.

import type { LabBase, LabSearch } from '@harness-visualization/mcp-server/lab';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { FoundDocument, SearchAction } from '../../../projections/projectRetrieval';
import { useRagBase, useSearch } from '../useRagData';
import { cosine } from '../vectors';
import { Fingerprint } from './Fingerprint';
import { formatSimilarity } from './retrievalLabels';
import styles from './Retrieval.module.css';

export function InsideServer(props: { action: SearchAction; defaultOpen: boolean }): ReactElement {
  const { action } = props;
  const [open, setOpen] = useState(props.defaultOpen);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (props.defaultOpen) {
      ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [props.defaultOpen]);
  return (
    <details
      ref={ref}
      open={props.defaultOpen}
      className={styles.inside}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>Что происходит внутри MCP-сервера — этого модель не видит</summary>
      {open && <InsideContent action={action} />}
    </details>
  );
}

function InsideContent({ action }: { action: SearchAction }): ReactElement {
  const base = useRagBase();
  const search = useSearch(action.query);
  const failure = [base, search].find((loaded) => loaded.status === 'error');
  if (failure?.status === 'error') {
    return (
      <p className={styles.note} data-teaching>
        {failure.message}
      </p>
    );
  }
  if (base.status !== 'ready' || search.status !== 'ready') {
    return (
      <p className={styles.note} data-teaching>
        Считаем вектор запроса той же моделью…
      </p>
    );
  }
  return <Pipeline action={action} base={base.value} search={search.value} />;
}

interface PipelineProps {
  action: SearchAction;
  base: LabBase;
  search: LabSearch;
}

function Pipeline({ action, base, search }: PipelineProps): ReactElement {
  const total = base.documents.reduce((sum, document) => sum + document.chunks.length, 0);
  const top = action.documents[0];
  const far = search.chunks.at(-1);
  return (
    <div className={styles.pipeline}>
      <ol className={styles.steps}>
        <li>
          <b>1. Текст запроса</b>
          <span>«{action.query}»</span>
          <span className={styles.muted}>
            сервер добавляет префикс «query: » — так обучена модель
          </span>
        </li>
        <li>
          <b>2. Модель эмбеддингов</b>
          <span className={styles.mono}>{base.model}</span>
          <span className={styles.muted}>
            работает внутри MCP-сервера, на вашем компьютере, без запросов в сеть
          </span>
        </li>
        <li>
          <b>3. Вектор запроса — {search.queryVector.length} числа</b>
          <span className={styles.vector}>
            [
            {search.queryVector
              .slice(0, 6)
              .map((value) => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 }))
              .join('; ')}
            ; …]
          </span>
        </li>
        <li>
          <b>4. Сравнение с {total} векторами фрагментов</b>
          <span className={styles.muted}>
            векторы фрагментов посчитаны заранее, при индексации (pnpm rag-index, префикс «passage:
            »), и лежат в кэше; мера близости — косинус
          </span>
        </li>
        <li data-model="true">
          <b>5. Модели уходит только текст</b>
          <span className={styles.mono}>{top === undefined ? '—' : headerOf(top)}</span>
          <span className={styles.muted}>и под ним текст фрагмента — без единого вектора</span>
        </li>
      </ol>
      <Comparison search={search} base={base} top={top} far={far} />
    </div>
  );
}

interface ComparisonProps {
  search: LabSearch;
  base: LabBase;
  top: FoundDocument | undefined;
  far: LabSearch['chunks'][number] | undefined;
}

// Вектор запроса рядом с вектором лучшего и худшего фрагмента: глазом сходство не видно —
// оно в сумме произведений по всем 384 числам. Косинус пересчитан здесь же, в браузере.
function Comparison({ search, base, top, far }: ComparisonProps): ReactElement {
  const rows = fingerprintRows({ search, base, top, far });
  const best = rows.find((row) => row.label.startsWith('1-е'));
  return (
    <div className={styles.compare}>
      <h4 className={styles.compareTitle}>Как выглядят векторы</h4>
      <p className={styles.note} data-teaching>
        Каждая полоска — одно из 384 чисел: цвет — знак, насыщенность — величина. Похожесть глазом
        почти не видна — она складывается из всех чисел сразу.
      </p>
      {rows.map((row) => (
        <Fingerprint
          key={row.label}
          label={row.label}
          vector={row.vector}
          similarity={row.similarity}
        />
      ))}
      {top !== undefined && best?.similarity !== undefined && (
        <Check computed={best.similarity} written={top.similarity} />
      )}
    </div>
  );
}

function fingerprintRows({ search, base, top, far }: ComparisonProps) {
  const rows: { label: string; vector: number[]; similarity: number | undefined }[] = [
    { label: 'запрос', vector: search.queryVector, similarity: undefined },
  ];
  const topVector =
    top === undefined ? null : vectorOf(base, top.documentId, top.fragment?.position ?? 1);
  if (top !== undefined && topVector !== null) {
    rows.push({
      label: `1-е место · ${top.documentId}`,
      vector: topVector,
      similarity: cosine(search.queryVector, topVector),
    });
  }
  const farVector = far === undefined ? null : vectorOf(base, far.documentId, far.position);
  if (far !== undefined && farVector !== null) {
    rows.push({
      label: `последнее место · ${far.documentId}`,
      vector: farVector,
      similarity: cosine(search.queryVector, farVector),
    });
  }
  return rows;
}

function Check({
  computed,
  written,
}: {
  computed: number;
  written: number | null;
}): ReactElement | null {
  if (written === null) {
    return null;
  }
  return (
    <p className={styles.note} data-teaching>
      <b>Сверка:</b> в браузере косинус запроса и лучшего фрагмента — {formatSimilarity(computed)},
      сервер написал модели «сходство {written.toFixed(3)}», разница{' '}
      {formatSimilarity(Math.abs(computed - written))}. Вектор запроса здесь посчитан заново, а
      векторы приходят в браузер округлёнными до 4 знаков — поэтому тысячные могут разойтись,
      особенно если запись сделана на другом компьютере. Большая разница значит, что база менялась
      после записи сессии.
    </p>
  );
}

function vectorOf(base: LabBase, documentId: string, position: number): number[] | null {
  return (
    base.documents
      .find((document) => document.id === documentId)
      ?.chunks.find((chunk) => chunk.position === position)?.vector ?? null
  );
}

function headerOf(document: FoundDocument): string {
  const fragment =
    document.fragment === null
      ? ''
      : `, фрагмент ${String(document.fragment.position)} из ${String(document.fragment.total)}`;
  const score = document.similarity === null ? '' : `, сходство ${document.similarity.toFixed(3)}`;
  return `${document.documentId} — ${document.title} (${document.documentType}, ${document.date})${fragment}${score}`;
}
