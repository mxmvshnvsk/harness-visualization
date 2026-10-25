// Плашки сверху вида «MCP»: серверы, вызовы их тулов, цена описаний, скорость ответа.

import type { ReactElement } from 'react';
import type { McpView } from '../../../projections/projectMcp';
import { formatMs } from './mcpFormat';
import styles from './McpSession.module.css';

export function McpTiles({
  view,
  tokens,
}: {
  view: McpView;
  tokens: ReadonlyMap<string, number>;
}): ReactElement {
  const visible = view.servers.flatMap((server) =>
    (server.ready?.tools ?? []).filter((tool) => !tool.hiddenFromModel),
  );
  const used = new Set(view.calls.map((call) => call.toolName));
  const unused = visible.filter((tool) => !used.has(tool.name)).map((tool) => tool.mcpName);
  const perRequest = visible.reduce((sum, tool) => sum + (tokens.get(tool.name) ?? 0), 0);
  const steps = view.steps.length;
  const latency = averageCallLatency(view);
  const names = view.servers.map((server) => server.name).join(', ');
  return (
    <div className={styles.tiles}>
      <div className={styles.tile}>
        <small>серверы</small>
        <b>
          {view.servers.length} · {names}
        </b>
        <span>{readyText(view)}</span>
      </div>
      <div className={styles.tile}>
        <small>вызовы тулов серверов</small>
        <b>{view.calls.length}</b>
        <span>
          {used.size} из {visible.length} видимых тулов;{' '}
          {unused.length === 0 ? 'пригодились все' : `ни разу: ${unused.join(', ')}`}
        </span>
      </div>
      <div className={styles.tile}>
        <small>описания в запросах</small>
        <b>
          ≈{perRequest} ток. × {steps}
        </b>
        <span>
          ≈{perRequest * steps} токенов за {steps} запр. — платим, даже если тул не зовут
        </span>
      </div>
      <div className={styles.tile}>
        <small>ответ сервера</small>
        <b>{latency === null ? '—' : formatMs(latency)}</b>
        <span>в среднем на tools/call; модель на шаг тратит секунды</span>
      </div>
    </div>
  );
}

function readyText(view: McpView): string {
  const ready = view.servers.filter((server) => server.ready !== null);
  if (ready.length === 0) {
    return 'запускается…';
  }
  const tools = ready.reduce((sum, server) => sum + (server.ready?.tools.length ?? 0), 0);
  const slowest = Math.max(...ready.map((server) => server.ready?.durationMs ?? 0));
  return `запуск за ${formatMs(slowest)}, тулов: ${String(tools)}`;
}

function averageCallLatency(view: McpView): number | null {
  const latencies = view.journal.flatMap((item) =>
    item.kind === 'pair' && item.pair.method === 'tools/call' && item.pair.response !== null
      ? [item.pair.response.at - item.pair.at]
      : [],
  );
  return latencies.length === 0
    ? null
    : latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
}
