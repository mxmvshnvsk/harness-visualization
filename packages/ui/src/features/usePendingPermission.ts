// Вопрос о разрешении, который ждёт ответа. Сам вопрос виден в потоке (permission_requested
// без permission_resolved), а срок ответа — только в сводке сессии на сервере (expiresAt).

import type { HarnessEvent } from '@harness-visualization/harness';
import type { PendingPermissionSummary } from '@harness-visualization/server';
import { useEffect, useState } from 'react';
import { getSession } from '../api/serverApi';

interface FetchedPermission {
  toolCallId: string;
  summary: PendingPermissionSummary | null;
}

export function usePendingPermission(
  sessionId: string | null,
  events: HarnessEvent[],
): PendingPermissionSummary | null {
  const toolCallId = sessionId === null ? null : findUnansweredRequest(events);
  const [fetched, setFetched] = useState<FetchedPermission | null>(null);

  useEffect(() => {
    if (sessionId === null || toolCallId === null) {
      return undefined;
    }
    let cancelled = false;
    getSession(sessionId)
      .then((details) => {
        if (!cancelled) {
          // Нет в сводке — уже ответили или истёк срок: это придёт в потоке.
          const summary = details.pendingPermissions.find((item) => item.toolCallId === toolCallId);
          setFetched({ toolCallId, summary: summary ?? null });
        }
      })
      .catch(() => {
        // Сводку не получили — карточку не показываем; ответ по тайм-ауту всё равно придёт.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, toolCallId]);

  // Сводка — только для вопроса, который ждёт ответа сейчас; старая не показывается.
  return fetched !== null && fetched.toolCallId === toolCallId ? fetched.summary : null;
}

function findUnansweredRequest(events: HarnessEvent[]): string | null {
  const resolved = new Set<string>();
  for (const event of events) {
    if (event.type === 'permission_resolved') {
      resolved.add(event.toolCallId);
    }
  }
  const unanswered = events.findLast(
    (event) => event.type === 'permission_requested' && !resolved.has(event.toolCallId),
  );
  return unanswered?.type === 'permission_requested' ? unanswered.toolCallId : null;
}
