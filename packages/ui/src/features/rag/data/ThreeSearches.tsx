// Три выдачи по одному запросу: по словам, по смыслу и гибрид — те же, что у тулов
// MCP-сервера. Документ с ответом (для вопросов из набора) отмечен.

import type { LabBase, LabQuestion, LabSearch } from '@harness-visualization/mcp-server/lab';
import type { ReactElement } from 'react';
import styles from './Data.module.css';
import { formatRu } from '../../../text/formatNumber';

const METHODS = [
  {
    key: 'words',
    title: 'По словам',
    how: 'Совпадения слов запроса в тексте, заголовке и тегах. Оценка — число совпадений.',
    digits: 0,
  },
  {
    key: 'meaning',
    title: 'По смыслу',
    how: 'Косинус вектора запроса и лучшего фрагмента документа. Оценка — от 0 до 1.',
    digits: 3,
  },
  {
    key: 'hybrid',
    title: 'Гибрид',
    how: 'Reciprocal Rank Fusion: 1 / (60 + место) из каждой выдачи — складываются места, а не оценки.',
    digits: 4,
  },
] as const;

const SHOWN = 8;

interface ThreeSearchesProps {
  base: LabBase;
  search: LabSearch;
  question: LabQuestion | null;
}

export function ThreeSearches({ base, search, question }: ThreeSearchesProps): ReactElement {
  const expected = new Set(question?.expectedDocumentIds ?? []);
  const titleOf = (id: string): string =>
    base.documents.find((document) => document.id === id)?.title ?? id;
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Три поиска по запросу «{search.query}»</h2>
      <div className={styles.columns}>
        {METHODS.map((method) => (
          <div key={method.key} className={styles.column}>
            <h3>{method.title}</h3>
            <p className={styles.note} data-teaching>
              {method.how}
            </p>
            {search[method.key].length === 0 ? (
              <p className={styles.note} data-teaching>
                Ни у одного документа нет слов из запроса.
              </p>
            ) : (
              <ol className={styles.rank}>
                {search[method.key].slice(0, SHOWN).map((item, index) => (
                  <li
                    key={item.documentId}
                    data-hit={expected.has(item.documentId) ? 'true' : undefined}
                    title={titleOf(item.documentId)}
                  >
                    <span className={styles.muted}>{index + 1}</span>
                    <span className={styles.mono}>
                      {expected.has(item.documentId) && '✓ '}
                      {item.documentId}
                    </span>
                    <span className={styles.number}>
                      {formatRu(item.score, {
                        minimumFractionDigits: method.digits,
                        maximumFractionDigits: method.digits,
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
