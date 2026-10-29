// Выбранный поиск: откуда взялся запрос, выдача и судьба каждого документа — прочитан ли
// целиком, назван ли в ответе, находили ли его раньше. Клик по строке — фрагмент, который
// увидела модель.

import { useState, type CSSProperties, type ReactElement } from 'react';
import type {
  FoundDocument,
  ReadAction,
  RetrievalAction,
  SearchAction,
} from '../../../projections/projectRetrieval';
import { ChainLinks } from '../../ChainLinks';
import { InsideServer } from './InsideServer';
import { formatSimilarity, kindColor, SEARCH_LABELS } from './retrievalLabels';
import styles from './Retrieval.module.css';

interface DetailProps {
  action: RetrievalAction;
  actions: readonly RetrievalAction[];
  cited: ReadonlySet<string>;
  // Пришли сюда из журнала MCP — сразу раскрыть «внутри MCP-сервера».
  focused?: boolean;
}

export function SearchDetail({ action, actions, cited, focused }: DetailProps): ReactElement {
  return action.kind === 'read' ? (
    <ReadDetail action={action} actions={actions} cited={cited} />
  ) : (
    <SearchResult
      key={action.index}
      action={action}
      actions={actions}
      cited={cited}
      focused={focused}
    />
  );
}

function ReadDetail(props: { action: ReadAction } & Omit<DetailProps, 'action'>): ReactElement {
  const { action, actions, cited } = props;
  const seenIn = actions.filter(
    (other): other is SearchAction =>
      other.kind === 'search' &&
      other.index < action.index &&
      other.documents.some((document) => document.documentId === action.documentId),
  );
  return (
    <div className={styles.detail}>
      <h3 className={styles.detailTitle}>Модель читает документ целиком</h3>
      <ChainLinks link={{ toolCallId: action.toolCallId, query: '' }} inspector mcp />
      <div className={styles.meta}>
        <span>
          документ <b className={styles.mono}>{action.documentId}</b>
        </span>
        <span>
          <b>{action.chars}</b> симв. в контекст
        </span>
      </div>
      <p className={styles.note} data-teaching>
        Поиск отдаёт фрагменты, а за полным текстом модель приходит сама.{' '}
        {seenIn.length > 0
          ? `Этот документ она видела в выдаче ${seenIn.map((search) => `«${search.query}»`).join(', ')} и решила, что фрагмента мало.`
          : 'В выдачах поиска до этого его не было — модель знала id заранее или из списка документов.'}
        {cited.has(action.documentId) && <b> Ответ его называет.</b>}
      </p>
    </div>
  );
}

function SearchResult(props: { action: SearchAction } & Omit<DetailProps, 'action'>): ReactElement {
  const { action } = props;
  const [open, setOpen] = useState<string | null>(null);
  const useful = action.documents.filter((document) => isUseful(document.documentId, props)).length;
  return (
    <div className={styles.detail}>
      <h3 className={styles.detailTitle}>
        {action.by === 'harness' ? 'Поиск харнесса до модели' : 'Поиск модели'}:{' '}
        {SEARCH_LABELS[action.search].name}
      </h3>
      <QueryChain action={action} />
      <ChainLinks link={{ toolCallId: action.toolCallId, query: action.query }} inspector mcp />
      {action.search !== 'words' && !action.failed && (
        <InsideServer action={action} defaultOpen={props.focused === true} />
      )}
      <div className={styles.meta}>
        <span>
          в выдаче <b>{action.documents.length}</b> док. ({action.chunkCount} фрагм.)
        </span>
        <span>
          пригодилось <b>{useful}</b>
        </span>
        <span>
          в контекст <b>{action.chars}</b> симв.
        </span>
      </div>
      {action.failed ? (
        <p className={styles.note} data-teaching>
          Поиск вернул ошибку — модель получила её текст.
        </p>
      ) : (
        <ul className={styles.rows}>
          {action.documents.map((document) => (
            <ResultRow
              key={document.documentId}
              document={document}
              open={open === document.documentId}
              onToggle={() => {
                setOpen(open === document.documentId ? null : document.documentId);
              }}
              chips={<Chips document={document} {...props} />}
            />
          ))}
        </ul>
      )}
      <p className={styles.note} data-teaching>
        Нажмите на строку — покажем фрагмент, который увидела модель.
      </p>
    </div>
  );
}

function QueryChain({ action }: { action: SearchAction }): ReactElement {
  if (action.by === 'harness') {
    return (
      <>
        <div className={styles.chain}>
          <div className={styles.box}>
            <span className={styles.role}>вопрос пользователя</span>
            {action.userQuestion}
          </div>
          <span className={styles.arrow}>→</span>
          <div className={styles.box}>
            <span className={styles.role}>
              {action.queryAuthor === 'model' ? 'запрос, переписанный моделью' : 'запрос = вопрос'}
            </span>
            {action.query}
          </div>
        </div>
        <p className={styles.note} data-teaching>
          Харнесс искал до первого шага модели и положил найденное прямо в запрос — модель его не
          просила, а увидела сразу.
        </p>
      </>
    );
  }
  return (
    <div className={styles.chain}>
      <div className={styles.box}>
        <span className={styles.role}>модель зовёт тул · шаг {action.step}</span>
        {action.toolName}
        {action.limit !== null && `, до ${String(action.limit)}`}
      </div>
      <span className={styles.arrow}>→</span>
      <div className={styles.box}>
        <span className={styles.role}>запрос модели</span>
        {action.query}
      </div>
    </div>
  );
}

interface RowProps {
  document: FoundDocument;
  open: boolean;
  onToggle: () => void;
  chips: ReactElement;
}

function ResultRow({ document, open, onToggle, chips }: RowProps): ReactElement {
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span className={styles.rank}>{document.place}</span>
        <span className={styles.doc}>
          <span className={styles.docId}>
            <span className={styles.dot} style={{ background: kindColor(document.documentType) }} />
            {document.documentId}
          </span>
          <span className={styles.docTitle}>
            {document.title}
            {document.fragment !== null &&
              ` · фрагмент ${String(document.fragment.position)} из ${String(document.fragment.total)}`}
          </span>
          {chips}
        </span>
        <Score document={document} />
      </button>
      {open && <div className={styles.fragment}>{document.text}</div>}
    </li>
  );
}

// Оценка в выдаче: сходство у поиска по смыслу, два места у гибрида, место — по словам.
function Score({ document }: { document: FoundDocument }): ReactElement {
  if (document.similarity !== null) {
    const width = Math.max(2, ((document.similarity - 0.75) / 0.2) * 100);
    return (
      <span className={styles.score}>
        {formatSimilarity(document.similarity)}
        <span className={styles.bar} style={{ '--width': `${String(width)}%` } as CSSProperties} />
      </span>
    );
  }
  if (document.places !== null) {
    return (
      <span className={styles.score}>
        <span>по словам: {document.places.words ?? '—'}</span>
        <span>по смыслу: {document.places.meaning ?? '—'}</span>
      </span>
    );
  }
  return <span className={styles.score}>{document.place}-е по словам</span>;
}

function readStep(
  documentId: string,
  actions: readonly RetrievalAction[],
): number | null | undefined {
  const read = actions.find(
    (action): action is ReadAction => action.kind === 'read' && action.documentId === documentId,
  );
  return read === undefined ? undefined : read.step;
}

function isUseful(documentId: string, props: Omit<DetailProps, 'action'>): boolean {
  return props.cited.has(documentId) || readStep(documentId, props.actions) !== undefined;
}

function Chips(
  props: { document: FoundDocument; action: SearchAction } & Omit<DetailProps, 'action'>,
): ReactElement {
  const { document, action, actions, cited } = props;
  const step = readStep(document.documentId, actions);
  const before = actions.some(
    (other) =>
      other.kind === 'search' &&
      other.index < action.index &&
      other.documents.some((found) => found.documentId === document.documentId),
  );
  return (
    <span className={styles.chips}>
      {step !== undefined && (
        <span className={styles.chip} data-tone="read">
          прочитан целиком{step === null ? '' : ` · шаг ${String(step)}`}
        </span>
      )}
      {cited.has(document.documentId) && (
        <span className={styles.chip} data-tone="cited">
          назван в ответе
        </span>
      )}
      {before && (
        <span className={styles.chip} data-tone="again">
          уже находили
        </span>
      )}
      {document.fragments > 1 && <span className={styles.chip}>{document.fragments} фрагм.</span>}
    </span>
  );
}
