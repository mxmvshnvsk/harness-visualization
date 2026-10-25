// Вид «MCP» открытой сессии: серверы, их тулы и журнал протокола. Идёт за курсором
// повтора: видно только то, что случилось до него, — ответ, который ещё не пришёл, ждёт.

import type { HarnessEvent } from '@harness-visualization/harness';
import { useMemo, type ReactElement } from 'react';
import type { SearchLink } from '../../../app/viewLinks';
import { projectMcp, toolTokens, type McpView } from '../../../projections/projectMcp';
import { McpTiles } from './McpTiles';
import { ProtocolJournal } from './ProtocolJournal';
import { ServerCard } from './ServerCard';
import { ServerTools } from './ServerTools';
import styles from './McpSession.module.css';

interface McpSessionViewProps {
  events: readonly HarnessEvent[];
  shown: number;
  // Пришли из «RAG»: какую пару сообщений открыть в журнале.
  focus?: SearchLink | null;
}

export function McpSessionView({ events, shown, focus }: McpSessionViewProps): ReactElement {
  const full = useMemo(() => projectMcp(events), [events]);
  const tokens = useMemo(() => toolTokens(events), [events]);
  if (full.servers.length === 0) {
    return (
      <div className={styles.empty}>
        В этой сессии харнесс не подключал MCP-серверов — тулы были только свои.
      </div>
    );
  }
  const view = upTo(full, shown);
  if (view.servers.length === 0) {
    return <div className={styles.empty}>Сервер ещё не запущен — повтор до этого не дошёл.</div>;
  }
  return (
    <div className={styles.screen}>
      <McpTiles view={view} tokens={tokens} />
      {view.servers.map((server) => (
        <ServerCard key={server.name} server={server} journal={view.journal} />
      ))}
      {view.servers.map((server) => (
        <ServerTools key={server.name} server={server} calls={view.calls} tokens={tokens} />
      ))}
      <ProtocolJournal journal={view.journal} focus={focus ?? null} />
    </div>
  );
}

// Срез до курсора: всё, что случилось раньше события shown.
function upTo(view: McpView, shown: number): McpView {
  const before = (index: number): boolean => index < shown;
  return {
    servers: view.servers
      .filter((server) => before(server.started.index))
      .map((server) => ({
        ...server,
        ready: server.ready !== null && before(server.ready.index) ? server.ready : null,
        failed: server.failed !== null && before(server.failed.index) ? server.failed : null,
        stopped: server.stopped !== null && before(server.stopped.index) ? server.stopped : null,
      })),
    journal: view.journal
      .filter((item) => before(item.kind === 'pair' ? item.pair.index : item.log.index))
      .map((item) =>
        item.kind === 'pair' && item.pair.response !== null && !before(item.pair.response.index)
          ? { kind: 'pair', pair: { ...item.pair, response: null } }
          : item,
      ),
    steps: view.steps.filter(before),
    calls: view.calls.filter((call) => before(call.index)),
  };
}
