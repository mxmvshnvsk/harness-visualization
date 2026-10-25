// Чип агента цвета его дорожки: «главный» или id субагента. Нет субагентов в сессии — нет чипа.

import type { ReactElement } from 'react';
import { useAgentLabels } from './agentLabels';
import styles from './AgentChip.module.css';

export function AgentChip({
  agentId,
}: {
  agentId: string | null | undefined;
}): ReactElement | null {
  const labels = useAgentLabels();
  if (!labels.enabled) {
    return null;
  }
  const id = agentId ?? null;
  return (
    <span className={styles.chip} data-color={labels.colorOf(id)}>
      {id ?? 'главный'}
    </span>
  );
}
