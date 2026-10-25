// Журнал протокола: сообщения JSON-RPC парами «вопрос — ответ» по id, со временем ответа;
// над tools/call — просьба модели и решение политики; строки stderr сервера между ними.

import { useState, type ReactElement } from 'react';
import type { McpJournalItem, McpPair } from '../../../projections/projectMcp';
import { describePair, formatKb, formatMs } from './mcpFormat';
import styles from './McpSession.module.css';

export function ProtocolJournal({ journal }: { journal: readonly McpJournalItem[] }): ReactElement {
  const [open, setOpen] = useState<number | null>(null);
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
  open: boolean;
  onToggle: () => void;
}

export function PairRow({ pair, open, onToggle }: PairRowProps): ReactElement {
  return (
    <>
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
      <div
        className={styles.pair}
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

function stepOf(item: McpJournalItem): number | null {
  return item.kind === 'pair' ? item.pair.step : item.log.step;
}

function latencyText(pair: McpPair): string {
  if (pair.response !== null) {
    return formatMs(pair.response.at - pair.at);
  }
  return pair.id === null ? 'без ответа' : 'ждёт…';
}
