// Документы сессии: строка — документ, колонка — поиск, в клетке — место в выдаче.
// Видно, что одно и то же находят снова и снова, а что всплыло случайно.

import type { CSSProperties, ReactElement } from 'react';
import type { RetrievalAction, SearchAction } from '../../../projections/projectRetrieval';
import { kindColor, placeOf, SEARCH_LABELS } from './retrievalLabels';
import styles from './Retrieval.module.css';

interface DocumentMatrixProps {
  actions: readonly RetrievalAction[];
  documents: readonly { documentId: string; documentType: string; firstIndex: number }[];
  cited: ReadonlySet<string>;
  turns: number;
}

const LEGEND = [
  { type: 'regulation', label: 'регламент' },
  { type: 'faq', label: 'FAQ' },
  { type: 'meeting', label: 'встреча' },
  { type: 'other', label: 'другое' },
];

export function DocumentMatrix(props: DocumentMatrixProps): ReactElement {
  const { actions, cited, turns } = props;
  const searches = actions.filter((action): action is SearchAction => action.kind === 'search');
  const read = new Set(
    actions.flatMap((action) => (action.kind === 'read' ? [action.documentId] : [])),
  );
  // Сверху — то, что пригодилось: названо в ответе, прочитано; дальше — по первой находке.
  const order = [...props.documents].sort(
    (left, right) =>
      Number(cited.has(right.documentId)) - Number(cited.has(left.documentId)) ||
      Number(read.has(right.documentId)) - Number(read.has(left.documentId)) ||
      left.firstIndex - right.firstIndex,
  );
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Документы сессии</h2>
      <p className={styles.sub}>
        Строка — документ, колонка — поиск, число — место документа в выдаче.
      </p>
      <ul className={styles.legend}>
        {LEGEND.map((item) => (
          <li key={item.type}>
            <span className={styles.dot} style={{ background: kindColor(item.type) }} />
            {item.label}
          </li>
        ))}
      </ul>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <MatrixHead searches={searches} turns={turns} />
          <tbody>
            {order.map((document) => (
              <DocumentRow
                key={document.documentId}
                document={document}
                searches={searches}
                read={read.has(document.documentId)}
                cited={cited.has(document.documentId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixHead(props: { searches: readonly SearchAction[]; turns: number }): ReactElement {
  return (
    <thead>
      <tr>
        <th className={styles.docColumn}>документ</th>
        {props.searches.map((search, position) => (
          <th key={search.index} title={search.query}>
            {position + 1}. {SEARCH_LABELS[search.search].name}
            <br />
            {placeOf(search, props.turns)}
          </th>
        ))}
        <th>прочитан</th>
        <th>в ответе</th>
      </tr>
    </thead>
  );
}

interface DocumentRowProps {
  document: { documentId: string; documentType: string };
  searches: readonly SearchAction[];
  read: boolean;
  cited: boolean;
}

function DocumentRow({ document, searches, read, cited }: DocumentRowProps): ReactElement {
  return (
    <tr>
      <td className={styles.docCell}>
        <span className={styles.dot} style={{ background: kindColor(document.documentType) }} />
        {document.documentId}
      </td>
      {searches.map((search) => (
        <PlaceCell key={search.index} search={search} documentId={document.documentId} />
      ))}
      <YesCell yes={read} />
      <YesCell yes={cited} />
    </tr>
  );
}

function YesCell({ yes }: { yes: boolean }): ReactElement {
  return (
    <td>
      <span className={styles.cell} data-state={yes ? 'yes' : 'none'}>
        {yes ? 'да' : ''}
      </span>
    </td>
  );
}

function PlaceCell({
  search,
  documentId,
}: {
  search: SearchAction;
  documentId: string;
}): ReactElement {
  const found = search.documents.find((document) => document.documentId === documentId);
  if (found === undefined) {
    return (
      <td>
        <span className={styles.cell} data-state="none" />
      </td>
    );
  }
  // Чем выше место, тем насыщеннее клетка; первое место — выделено.
  const weight = Math.max(8, 60 - (found.place - 1) * 6);
  return (
    <td>
      <span
        className={styles.cell}
        data-state={found.place === 1 ? 'top' : 'hit'}
        style={{ '--weight': `${String(weight)}%` } as CSSProperties}
      >
        {found.place}
      </span>
    </td>
  );
}
