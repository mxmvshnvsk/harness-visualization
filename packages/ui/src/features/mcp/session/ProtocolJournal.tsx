// Журнал протокола: сообщения JSON-RPC парами «вопрос — ответ» по id, со временем ответа;
// над tools/call — просьба модели и решение политики; строки stderr сервера между ними.

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { sameSearch, type SearchLink } from '../../../app/viewLinks';
import { ChainLinks, hasVector } from '../../ChainLinks';
import type { McpJournalItem, McpPair } from '../../../projections/projectMcp';
import { describePair, formatKb, formatMs } from './mcpFormat';
import styles from './McpSession.module.css';

export function ProtocolJournal(props: {
  journal: readonly McpJournalItem[];
  focus: SearchLink | null;
}): ReactElement {
  const { journal } = props;
  const [open, setOpen] = useState<number | null>(() => focusedPair(journal, props.focus));
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Журнал протокола</h2>
      <p className={styles.sub}>
        Сообщения JSON-RPC парами «вопрос — ответ» по id, со временем ответа; над вызовом — откуда
        он взялся. Строки stderr — то, что сервер пишет в свой журнал. Нажмите на пару — покажем оба
        сообщения целиком.
      </p>
      <ol className={styles.journal}>
        {journal.map((item, position) => {
          const step = stepOf(item);
          const previous = journal[position - 1];
          const previousStep = previous === undefined ? undefined : stepOf(previous);
          return (
            <li key={item.kind === 'pair' ? item.pair.index : item.log.index}>
              {(previous === undefined || previousStep !== step) && (
                <span className={styles.phase}>
                  {step === null
                    ? 'знакомство · до первого шага модели'
                    : `шаг ${String(step)} · модель`}
                </span>
              )}
              {item.kind === 'log' ? (
                <span className={styles.log}>
                  stderr {item.log.serverName} · {item.log.text}
                </span>
              ) : (
                <PairRow
                  pair={item.pair}
                  focused={item.pair.index === focusedPair(journal, props.focus)}
                  open={open === item.pair.index}
                  onToggle={() => {
                    setOpen(open === item.pair.index ? null : item.pair.index);
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface PairRowProps {
  pair: McpPair;
  focused?: boolean;
  open: boolean;
  onToggle: () => void;
}

export function PairRow({ pair, focused, open, onToggle }: PairRowProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused === true) {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [focused]);
  return (
    <>
      <Cause pair={pair} />
      <div
        ref={ref}
        className={styles.pair}
        data-focused={focused === true ? 'true' : undefined}
        data-pending={pair.response === null && pair.id !== null ? 'true' : undefined}
      >
        <button type="button" aria-expanded={open} onClick={onToggle}>
          <span className={styles.method}>
            → {pair.method}
            {pair.id !== null && <span className={styles.muted}> #{String(pair.id)}</span>}
          </span>
          <span className={styles.params}>{describePair(pair)}</span>
          <span className={styles.latency}>{latencyText(pair)}</span>
          <span className={styles.size}>
            {pair.response === null ? '' : formatKb(pair.response.size)}
          </span>
        </button>
        {open && <PairMessages pair={pair} />}
        <PairLinks pair={pair} />
      </div>
    </>
  );
}

export function PairMessages({ pair }: { pair: McpPair }): ReactElement {
  return (
    <div className={styles.messages}>
      <div>
        <span className={styles.role}>харнесс → сервер {pair.serverName}</span>
        <pre className={styles.json}>{JSON.stringify(pair.request, null, 2)}</pre>
      </div>
      <div>
        <span className={styles.role}>сервер → харнесс</span>
        <pre className={styles.json}>
          {pair.response === null ? 'ответа нет' : JSON.stringify(pair.response.message, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// Откуда взялся tools/call: просьба модели и решение политики — или поиск харнесса.
function Cause({ pair }: { pair: McpPair }): ReactElement {
  return (
    <>
      {pair.call === null && pair.method === 'tools/call' && (
        <span className={styles.cause}>
          вызов без просьбы модели — харнесс искал сам, до первого шага (retrieval)
        </span>
      )}
      {pair.call !== null && (
        <span className={styles.cause}>
          модель попросила <b className={styles.mono}>{pair.call.toolName}</b> → политика:{' '}
          {pair.call.reason ?? '—'} →{' '}
          <span className={styles.decision} data-decision={pair.call.decision}>
            {pair.call.decision ?? '—'}
          </span>{' '}
          → харнесс снял приставку и зовёт тул на сервере {pair.serverName}
        </span>
      )}
    </>
  );
}

// Запрос tools/call: имя тула на сервере и query, если он есть.
function searchOf(pair: McpPair): { tool: string; query: string } | null {
  if (pair.method !== 'tools/call') {
    return null;
  }
  const params = (pair.request as { params?: { name?: unknown; arguments?: { query?: unknown } } })
    .params;
  const tool = params?.name;
  const query = params?.arguments?.query;
  return typeof tool === 'string' ? { tool, query: typeof query === 'string' ? query : '' } : null;
}

function PairLinks({ pair }: { pair: McpPair }): ReactElement | null {
  const search = searchOf(pair);
  if (search === null) {
    return null;
  }
  return (
    <div className={styles.pairLinks}>
      <ChainLinks
        link={{ toolCallId: pair.call?.toolCallId ?? null, query: search.query }}
        inspector
        rag={hasVector(search.tool)}
      />
    </div>
  );
}

// Пара, к которой пришли из «RAG»: тот же вызов модели или тот же запрос харнесса.
function focusedPair(journal: readonly McpJournalItem[], focus: SearchLink | null): number | null {
  if (focus === null) {
    return null;
  }
  const found = journal.find(
    (item) =>
      item.kind === 'pair' &&
      searchOf(item.pair) !== null &&
      sameSearch(focus, item.pair.call?.toolCallId ?? null, searchOf(item.pair)?.query ?? ''),
  );
  return found?.kind === 'pair' ? found.pair.index : null;
}

function stepOf(item: McpJournalItem): number | null {
  return item.kind === 'pair' ? item.pair.step : item.log.step;
}

function latencyText(pair: McpPair): string {
  if (pair.response !== null) {
    return formatMs(pair.response.at - pair.at);
  }
  return pair.id === null ? 'без ответа' : 'ждёт…';
}
