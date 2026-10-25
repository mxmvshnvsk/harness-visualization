// Вкладка «Данные» лаборатории RAG: та же база, что в маршруте, но без подсказок — любой
// запрос на карте смыслов, три выдачи по нему и сравнение двух своих фраз.

import type { LabBase, LabQuestion } from '@harness-visualization/mcp-server/lab';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useSearch } from '../useRagData';
import styles from './Data.module.css';
import { MeaningMap } from './MeaningMap';
import { ThreeSearches } from './ThreeSearches';
import { TwoPhrases } from './TwoPhrases';

export function DataTab({ base }: { base: LabBase }): ReactElement {
  const [query, setQuery] = useState(base.questions[0]?.query ?? 'удалёнка');
  const search = useSearch(query);
  const question = base.questions.find((item) => item.query === query) ?? null;
  return (
    <div className={styles.data}>
      <div className={styles.work}>
        <QueryPicker questions={base.questions} query={query} onQuery={setQuery} />
        <div className={styles.results}>
          {search.status === 'ready' ? (
            <>
              <MeaningMap base={base} search={search.value} question={question} />
              <ThreeSearches base={base} search={search.value} question={question} />
            </>
          ) : (
            <p className={search.status === 'error' ? styles.bad : styles.note}>
              {search.status === 'loading' ? 'Ищем…' : search.message}
            </p>
          )}
        </div>
      </div>
      <TwoPhrases />
    </div>
  );
}

interface PickerProps {
  questions: readonly LabQuestion[];
  query: string;
  onQuery: (query: string) => void;
}

// Свой запрос или вопрос из набора pnpm compare-search — у них известно, где ответ.
function QueryPicker({ questions, query, onQuery }: PickerProps): ReactElement {
  const [draft, setDraft] = useState('');
  const groups = Map.groupBy(questions, (question) => question.group);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (draft.trim() !== '') {
      onQuery(draft.trim());
    }
  };
  return (
    <aside className={styles.picker} aria-label="Запрос">
      <form className={styles.own} onSubmit={submit}>
        <input
          value={draft}
          maxLength={300}
          placeholder="Свой запрос"
          aria-label="Свой запрос"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <button type="submit">Найти</button>
      </form>
      {[...groups].map(([group, items]) => (
        <div key={group} className={styles.group}>
          <h3>{group}</h3>
          <ul>
            {items.map((item) => (
              <li key={item.query}>
                <button
                  type="button"
                  aria-pressed={item.query === query}
                  onClick={() => {
                    onQuery(item.query);
                  }}
                >
                  {item.query}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
