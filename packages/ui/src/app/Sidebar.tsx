// Запуск сессии, сессии сервера и записанные трейсы. Живёт в выезжающей панели, а пока
// ничего не открыто — на стартовом экране.

import type { SessionSummary, TraceSummary } from '@harness-visualization/server';
import type { ReactElement } from 'react';
import type { ServerList } from '../api/useServerList';
import { SessionForm } from '../features/SessionForm';
import { SessionList, TraceList } from '../features/SourceList';
import styles from './App.module.css';
import type { Selection } from './useSelection';

interface SidebarProps {
  sessions: ServerList<SessionSummary>;
  traces: ServerList<TraceSummary>;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}

export function Sidebar({ sessions, traces, selection, onSelect }: SidebarProps): ReactElement {
  return (
    <div className={styles.sources}>
      <section className={styles.card}>
        <SessionForm
          onStarted={(sessionId) => {
            onSelect({ kind: 'session', sessionId });
            sessions.reload();
          }}
        />
      </section>
      <section className={styles.card}>
        <SessionList
          sessions={sessions.items}
          error={sessions.error}
          selection={selection}
          onReload={sessions.reload}
          onSelect={onSelect}
        />
      </section>
      <section className={styles.card}>
        <TraceList
          traces={traces.items}
          error={traces.error}
          selection={selection}
          onReload={traces.reload}
          onSelect={onSelect}
        />
      </section>
    </div>
  );
}
