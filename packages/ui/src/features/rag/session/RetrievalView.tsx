// Вид «RAG» открытой сессии: срез поиска по базе знаний — кто, когда и что искал, что нашёл,
// что модель прочитала целиком и на что опирается ответ. Идёт за курсором повтора: видны
// только поиски до этого момента. Разбор опоры — для записанных трейсов, когда повтор дошёл
// до конца (сервер считает сходство заново, судью не зовёт).

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, useState, type ReactElement } from 'react';
import {
  citedDocuments,
  projectRetrieval,
  sessionDocuments,
  type RetrievalAction,
} from '../../../projections/projectRetrieval';
import { AnswerSupport } from './AnswerSupport';
import { DocumentMatrix } from './DocumentMatrix';
import styles from './Retrieval.module.css';
import { SearchDetail } from './SearchDetail';
import { SearchTimeline } from './SearchTimeline';
import { SummaryTiles } from './SummaryTiles';

interface RetrievalViewProps {
  events: readonly HarnessEvent[];
  shown: number;
  // Записанный трейс — для разбора опоры ответа; null — живая сессия.
  traceFile: string | null;
}

export function RetrievalView({ events, shown, traceFile }: RetrievalViewProps): ReactElement {
  const view = useMemo(() => projectRetrieval(events), [events]);
  const actions = view.actions.filter((action) => action.index < shown);
  const [chosen, setChosen] = useState<number | null>(null);
  if (view.actions.length === 0) {
    return (
      <div className={styles.empty}>
        В этой сессии агент не искал в базе знаний: ни поиска харнесса, ни вызовов её тулов.
      </div>
    );
  }
  if (actions.length === 0) {
    return <div className={styles.empty}>Поиски впереди — повтор до них ещё не дошёл.</div>;
  }
  const selected = actions.find((action) => action.index === chosen) ?? actions.at(-1);
  const documents = sessionDocuments(actions);
  const answers = view.answers.filter((answer) => answer.index < shown);
  const cited = citedDocuments(
    answers,
    documents.map((document) => document.documentId),
  );
  const context = { actions, cited, turns: Math.max(...actions.map((action) => action.turn)) };
  return (
    <div className={styles.screen}>
      <SummaryTiles mode={view.mode} actions={actions} documents={documents} cited={cited} />
      <section className={styles.card}>
        <h2 className={styles.title}>Ход поиска</h2>
        <p className={styles.sub}>
          Кто, когда и что искал. Слева — по порядку в сессии, справа — выдача и судьба каждого
          документа. Видны только поиски до курсора повтора.
        </p>
        <div className={styles.work}>
          <SearchTimeline
            {...context}
            selected={selected?.index ?? null}
            onSelect={(action: RetrievalAction) => {
              setChosen(action.index);
            }}
          />
          {selected !== undefined && <SearchDetail {...context} action={selected} />}
        </div>
      </section>
      <DocumentMatrix {...context} documents={documents} />
      {traceFile !== null && shown >= events.length && answers.length > 0 && (
        <AnswerSupport file={traceFile} />
      )}
    </div>
  );
}
