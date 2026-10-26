// Diff у write_file в инспекторе (этап 10): что именно агент поменял этой записью. Текст до
// записи — из трейса: последняя запись этого файла или результат read_file (projectCode).

import type { HarnessEvent } from '@harness-visualization/harness';
import { createContext, useContext, useMemo, type ReactElement } from 'react';
import { projectCode } from '../../projections/projectCode';
import { diffHunks, lineDiff } from '../../projections/lineDiff';
import { DiffBlock } from './CodeView';
import styles from './Code.module.css';

// Все события записи — инспектору их передаёт InspectorView.
export const SessionEventsContext = createContext<readonly HarnessEvent[]>([]);

type ToolCallEvent = Extract<HarnessEvent, { type: 'tool_call' }>;

export function WriteFileDiff({ call }: { call: ToolCallEvent }): ReactElement | null {
  const events = useContext(SessionEventsContext);
  const before = useMemo(() => fileBefore(events, call), [events, call]);
  const args = call.arguments as { path?: unknown; content?: unknown } | null;
  if (call.toolName !== 'write_file' || typeof args?.content !== 'string') {
    return null;
  }
  const hunks = diffHunks(lineDiff(before.text ?? '', args.content));
  return (
    <div>
      <p className={styles.muted}>{before.note}</p>
      <DiffBlock hunks={hunks} />
    </div>
  );
}

function fileBefore(
  events: readonly HarnessEvent[],
  call: ToolCallEvent,
): { text: string | null; note: string } {
  const path =
    typeof (call.arguments as { path?: unknown } | null)?.path === 'string'
      ? String((call.arguments as { path: string }).path).replace(/^\.\//, '')
      : '';
  const index = events.indexOf(call);
  const file = projectCode(events, index === -1 ? events.length : index).files.find(
    (item) => item.path === path,
  );
  if (file === undefined || file.current === null) {
    return {
      text: null,
      note: 'Файл агент до этого не читал и не писал: исходного текста в трейсе нет — показан целиком.',
    };
  }
  return {
    text: file.current,
    note:
      file.writes > 0
        ? `Против прошлой записи агента (шаг ${String(file.step)}).`
        : `Против прочитанного на шаге ${String(file.step)}.`,
  };
}
