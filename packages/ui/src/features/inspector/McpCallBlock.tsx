// Блок «через MCP» в панели вызова тула сервера: как харнесс переименовал тул и какая пара
// сообщений JSON-RPC ушла и пришла ради этого вызова.

import type { ReactElement } from 'react';
import { PairMessages } from '../mcp/session/ProtocolJournal';
import { formatMs } from '../mcp/session/mcpFormat';
import styles from './Inspector.module.css';
import { useMcpPair } from './mcpPairs';

export function McpCallBlock({
  toolCallId,
  toolName,
}: {
  toolCallId: string;
  toolName: string;
}): ReactElement | null {
  const pair = useMcpPair(toolCallId);
  if (pair === null) {
    return null;
  }
  const params = pair.request as { params?: { name?: unknown } };
  const serverTool = typeof params.params?.name === 'string' ? params.params.name : '—';
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>через MCP</h3>
      <p className={styles.mcpRename}>
        <span className={styles.mcpName}>{toolName}</span>
        <span>модель → харнесс снимает приставку →</span>
        <span className={styles.mcpName}>
          {serverTool} на сервере {pair.serverName}
        </span>
        <span>
          · tools/call #{pair.id}
          {pair.response === null
            ? ' · ждёт ответа'
            : ` · ответ за ${formatMs(pair.response.at - pair.at)}`}
        </span>
      </p>
      <PairMessages pair={pair} />
    </section>
  );
}
