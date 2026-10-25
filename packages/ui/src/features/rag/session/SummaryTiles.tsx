// Плашки сверху вида «RAG»: режим поиска, сколько искали и кто, воронка документов, объём.

import type { ReactElement } from 'react';
import type { RetrievalAction } from '../../../projections/projectRetrieval';
import { MODE_LABELS } from './retrievalLabels';
import styles from './Retrieval.module.css';

interface SummaryTilesProps {
  mode: string | null;
  actions: readonly RetrievalAction[];
  documents: readonly { documentId: string }[];
  cited: ReadonlySet<string>;
}

export function SummaryTiles({ mode, actions, documents, cited }: SummaryTilesProps): ReactElement {
  const searches = actions.filter((action) => action.kind === 'search');
  const reads = new Set(
    actions.flatMap((action) => (action.kind === 'read' ? [action.documentId] : [])),
  );
  const byHarness = searches.filter((action) => action.by === 'harness').length;
  const chars = actions.reduce((sum, action) => sum + action.chars, 0);
  const label = mode === null ? undefined : MODE_LABELS[mode];
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}>
        <small>режим поиска</small>
        <b>{label?.name ?? mode ?? 'не записан'}</b>
        <span>{label?.text ?? 'Трейс записан до того, как харнесс стал писать режим.'}</span>
      </div>
      <div className={styles.tile}>
        <small>поиски</small>
        <b>
          {searches.length}
          {reads.size > 0 && ` + ${String(actions.length - searches.length)} чтение`}
        </b>
        <span>
          {byHarness} — харнесс до модели, {searches.length - byHarness} — модель тулами
        </span>
      </div>
      <div className={styles.tile}>
        <small>документы</small>
        <div className={styles.funnel}>
          <b>{documents.length}</b>
          <i>найдено →</i>
          <b>{reads.size}</b>
          <i>прочитано целиком →</i>
          <b>{cited.size}</b>
          <i>названо в ответе</i>
        </div>
        <span>Остальное — найдено, но не пригодилось.</span>
      </div>
      <div className={styles.tile}>
        <small>в контексте</small>
        <b>{(chars / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс. симв.</b>
        <span>найденное и прочитанное — часть «результаты тулов» на экране «Контекст»</span>
      </div>
    </div>
  );
}
