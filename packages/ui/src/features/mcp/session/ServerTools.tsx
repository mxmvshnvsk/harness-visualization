// Тулы сервера: что прислал сервер, что увидела модель, как решала политика, сколько раз
// звали и сколько описание тула занимает в каждом запросе к модели.

import type { McpToolSummary } from '@harness-visualization/harness';
import type { CSSProperties, ReactElement } from 'react';
import type { McpServerView, McpView } from '../../../projections/projectMcp';
import styles from './McpSession.module.css';

interface ServerToolsProps {
  server: McpServerView;
  calls: McpView['calls'];
  tokens: ReadonlyMap<string, number>;
}

export function ServerTools({ server, calls, tokens }: ServerToolsProps): ReactElement {
  const tools = server.ready?.tools ?? [];
  const max = Math.max(...tools.map((tool) => tokens.get(tool.name) ?? 0), 1);
  const unused = tools.filter(
    (tool) => !tool.hiddenFromModel && !calls.some((call) => call.toolName === tool.name),
  );
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Тулы сервера {server.name}</h2>
      <p className={styles.sub}>
        Что прислал сервер, что из этого увидела модель, как решала политика и что пригодилось. Вес
        — сколько описание тула занимает в <i>каждом</i> запросе к модели.
      </p>
      {tools.length === 0 ? (
        <p className={styles.sub}>Список тулов ещё не пришёл.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>на сервере</th>
                <th>для модели</th>
                <th>модель</th>
                <th>пометки сервера</th>
                <th>классы действия</th>
                <th>решение политики</th>
                <th>вызовов</th>
                <th>≈токенов в запросе</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  calls={calls}
                  tokens={tokens.get(tool.name) ?? 0}
                  max={max}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unused.length > 0 && (
        <p className={styles.sub}>
          <b>{unused.map((tool) => tool.mcpName).join(', ')}</b> модель пока ни разу не позвала, но
          описание лежит в каждом запросе.
        </p>
      )}
    </section>
  );
}

interface ToolRowProps {
  tool: McpToolSummary;
  calls: McpView['calls'];
  tokens: number;
  max: number;
}

function ToolRow({ tool, calls, tokens, max }: ToolRowProps): ReactElement {
  const own = calls.filter((call) => call.toolName === tool.name);
  const hidden = tool.hiddenFromModel;
  return (
    <tr
      data-hidden={hidden ? 'true' : undefined}
      data-unused={!hidden && own.length === 0 ? 'true' : undefined}
    >
      <td className={styles.mono}>{tool.mcpName}</td>
      <td className={styles.mono}>{hidden ? '—' : tool.name}</td>
      <td>
        <span className={styles.chip} data-tone={hidden ? 'off' : 'on'}>
          {hidden ? 'скрыт · hiddenTools' : 'видит'}
        </span>
      </td>
      <td className={styles.mono}>{hintsOf(tool)}</td>
      <td className={styles.mono}>{tool.effects.length === 0 ? '—' : tool.effects.join(', ')}</td>
      <td>
        <DecisionCell calls={own} />
      </td>
      <td className={styles.calls}>{hidden ? '—' : own.length}</td>
      <td>{hidden ? '0' : <WeightCell tokens={tokens} max={max} />}</td>
    </tr>
  );
}

function hintsOf(tool: McpToolSummary): string {
  const hints = Object.entries(tool.annotations ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key.replace(/Hint$/u, ''));
  return hints.length === 0 ? '—' : hints.join(', ');
}

function DecisionCell({ calls }: { calls: McpView['calls'] }): ReactElement {
  const decided = calls.filter((call) => call.decision !== null);
  const first = decided[0];
  if (first === undefined) {
    return <span className={styles.muted}>не спрашивали</span>;
  }
  return (
    <>
      <span className={styles.decision} data-decision={first.decision}>
        {first.decision}
      </span>{' '}
      × {decided.length}
    </>
  );
}

function WeightCell({ tokens, max }: { tokens: number; max: number }): ReactElement {
  return (
    <>
      <span
        className={styles.weight}
        style={{ '--width': `${String((tokens / max) * 100)}%` } as CSSProperties}
      />
      ≈{tokens}
    </>
  );
}
