// Шаг 4. Где живут векторы: кто ими пользуется (только поиск, не модель), что хранится
// в файле индекса и что происходит на каждый запрос. Всё — на настоящем индексе базы.

import type { LabBase, LabIndex, LabSearch } from '@harness-visualization/mcp-server/lab';
import { useState, type FormEvent, type ReactElement } from 'react';
import styles from '../RagLab.module.css';
import { useRagIndex, useSearch } from '../useRagData';
import { Lab, StepShell } from './StepShell';
import { formatRu } from '../../../text/formatNumber';

interface StepProps {
  base: LabBase;
  onStep: (index: number) => void;
}

export function StepStorage({ base, onStep }: StepProps): ReactElement {
  const index = useRagIndex();
  return (
    <StepShell
      index={3}
      onStep={onStep}
      question="Где живут векторы и кто ими пользуется?"
      prose={
        <>
          <p>
            Модель-собеседник (DeepSeek) векторов не получает и не просит — ей приходит текст.
            Векторами пользуется только поиск: по ним он решает, какие куски показать.
          </p>
          <p>
            Как библиотекарь с картотекой: вы спрашиваете словами, он по карточкам выбирает книги и
            приносит сами книги. Карточки вы не видите — они нужны ему, чтобы выбрать. Работа
            делится на две части: заранее, один раз, — индексация; на каждый запрос — поиск.
          </p>
        </>
      }
      lab={
        <>
          {index.status === 'ready' ? (
            <IndexLab index={index.value} />
          ) : (
            <p className={index.status === 'error' ? styles.bad : styles.hint}>
              {index.status === 'loading' ? 'Смотрим файл индекса…' : index.message}
            </p>
          )}
          <QueryLab base={base} />
        </>
      }
      notice="Векторов нет ни в запросе к модели, ни в трейсе — поэтому в «Сырых событиях» их и не видно. У самой DeepSeek внутри тоже есть эмбеддинги — так она представляет слова для себя, — но это другая модель и другие числа, с нашим поиском они не связаны."
      takeaway="Вектор — ключ сортировки: он решает, какой текст показать модели, и на этом его работа кончается. В больших системах файл заменяет векторная база (pgvector, Qdrant), а перебор всех векторов — приближённый поиск ближайших; у нас 58 фрагментов, и честный перебор занимает миллисекунды."
    />
  );
}

const megabytes = (bytes: number): string =>
  formatRu(bytes / 1024 / 1024, { maximumFractionDigits: 0 });
const kilobytes = (bytes: number): string => formatRu(bytes / 1024, { maximumFractionDigits: 0 });
const short = (value: number): string => formatRu(value, { maximumFractionDigits: 3 });

function IndexLab({ index }: { index: LabIndex }): ReactElement {
  const { sample } = index;
  return (
    <Lab
      title="Заранее, один раз: индексация"
      hint="Делает pnpm rag-index — или сам MCP-сервер при запуске, если каких-то векторов не хватает."
    >
      <ol className={styles.flow}>
        <li>
          <b>{index.documentCount} документов</b>
          <span>база знаний «Кедр Софт»</span>
        </li>
        <li>
          <b>{index.vectorCount} фрагментов</b>
          <span>нарезка, как на шаге 2</span>
        </li>
        <li>
          <b>модель эмбеддингов</b>
          <span className={styles.mono}>{index.model}</span>
          <span>
            {megabytes(index.modelBytes)} МБ в {index.modelDirectory}, работает на вашем компьютере
          </span>
        </li>
        <li>
          <b>
            {index.vectorCount} векторов × {index.dimensions} чисел
          </b>
          <span>по одному на фрагмент</span>
        </li>
        <li>
          <b>файл индекса</b>
          <span className={styles.mono}>{index.file}</span>
          <span>{kilobytes(index.bytes)} КБ</span>
        </li>
      </ol>
      {sample !== null && (
        <>
          <p className={styles.hint}>Одна настоящая запись из этого файла:</p>
          <pre className={styles.code}>
            {`"${sample.hash.slice(0, 12)}…${sample.hash.slice(-6)}": [${sample.vectorHead.map(short).join(', ')}, … ещё ${String(index.dimensions - sample.vectorHead.length)} чисел]`}
          </pre>
          <p className={styles.reading}>
            Ключ — не имя документа, а SHA-256 от текста, который ушёл модели эмбеддингов: название
            документа плюс текст фрагмента («{sample.passageHead.replace(/\s+/gu, ' ')}
            …»). При запуске MCP-сервер заново режет документы, считает хеш каждого фрагмента и по
            нему находит вектор — так эта запись становится фрагментом {sample.position}{' '}
            <span className={styles.mono}>{sample.documentId}</span>. Поменяли документ — у
            изменённых фрагментов другой хеш, и пересчитаются только они.
          </p>
        </>
      )}
    </Lab>
  );
}

function QueryLab({ base }: { base: LabBase }): ReactElement {
  const [draft, setDraft] = useState('сколько платят на больничном');
  const [query, setQuery] = useState(draft);
  const search = useSearch(query);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (draft.trim() !== '') {
      setQuery(draft.trim());
    }
  };
  return (
    <Lab
      title="На каждый запрос: поиск"
      hint="Так работает semantic_search внутри MCP-сервера. Впишите свой запрос."
    >
      <form className={styles.queryForm} onSubmit={submit}>
        <input
          value={draft}
          maxLength={300}
          aria-label="Запрос"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <button type="submit" className={styles.next}>
          Искать
        </button>
      </form>
      {search.status === 'ready' ? (
        <SearchSteps base={base} search={search.value} />
      ) : (
        <p className={search.status === 'error' ? styles.bad : styles.hint}>
          {search.status === 'loading' ? 'Считаем…' : search.message}
        </p>
      )}
    </Lab>
  );
}

const TOP = 5;

function SearchSteps({ base, search }: { base: LabBase; search: LabSearch }): ReactElement {
  const top = search.chunks.slice(0, TOP);
  return (
    <ol className={styles.flow} data-vertical="true">
      <li>
        <b>1. Запрос → вектор</b>
        <span className={styles.vector}>
          [{search.queryVector.slice(0, 6).map(short).join('; ')}; … ещё{' '}
          {search.queryVector.length - 6}]
        </span>
      </li>
      <li>
        <b>2. Косинус с каждым из {search.chunks.length} векторов файла</b>
        <SimilarityStrip search={search} />
        <span>
          от {short(search.chunks[0]?.similarity ?? 0)} до{' '}
          {short(search.chunks.at(-1)?.similarity ?? 0)}; выделены {TOP} лучших
        </span>
      </li>
      <li>
        <b>3. По ключам — тексты {TOP} лучших фрагментов, векторы больше не нужны</b>
      </li>
      <li data-model="true">
        <b>4. Модели уходит только текст</b>
        <pre className={styles.code}>{top.map((hit) => headerOf(base, hit)).join('\n')}</pre>
        <span>и под каждой строкой — текст фрагмента</span>
      </li>
    </ol>
  );
}

// Все сходства столбиками, от лучшего к худшему: видно, как мало отделяет первые места от
// середины — поиск берёт верхушку отсортированного списка.
function SimilarityStrip({ search }: { search: LabSearch }): ReactElement {
  const values = search.chunks.map((hit) => hit.similarity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <svg
      className={styles.strip}
      viewBox={`0 0 ${String(values.length * 6)} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Сходство запроса с ${String(values.length)} фрагментами`}
    >
      {values.map((value, index) => {
        const height = 4 + ((value - min) / (max - min || 1)) * 36;
        return (
          <rect
            key={index}
            x={index * 6}
            y={40 - height}
            width={4}
            height={height}
            className={index < TOP ? styles.stripTop : styles.stripRest}
          />
        );
      })}
    </svg>
  );
}

function headerOf(base: LabBase, hit: LabSearch['chunks'][number]): string {
  const document = base.documents.find((item) => item.id === hit.documentId);
  if (document === undefined) {
    return hit.documentId;
  }
  return `${document.id} — ${document.title} (${document.type}, ${document.date ?? 'без даты'}), фрагмент ${String(hit.position)} из ${String(document.chunks.length)}, сходство ${hit.similarity.toFixed(3)}`;
}
