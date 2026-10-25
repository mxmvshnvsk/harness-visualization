// Подробная панель: запрос к модели, вызов тула или retrieval.

import type { ReactElement } from 'react';
import type { SessionView } from '../../projections/sessionView';
import type { Focus } from './focus';
import styles from './Inspector.module.css';
import { ModelCallPanel } from './ModelCallPanel';
import { RetrievalPanel } from './RetrievalPanel';
import { ToolCallPanel } from './ToolCallPanel';

interface FocusedPanelProps {
  view: SessionView;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}

export function FocusedPanel({ view, focus, onFocus }: FocusedPanelProps): ReactElement {
  if (focus?.kind === 'model') {
    const call = view.modelCalls.find((item) => item.requestId === focus.requestId);
    if (call !== undefined) {
      return <ModelCallPanel call={call} onFocus={onFocus} />;
    }
  }
  if (focus?.kind === 'tool') {
    const tool = view.toolCalls.find((item) => item.toolCallId === focus.toolCallId);
    if (tool !== undefined) {
      return <ToolCallPanel tool={tool} />;
    }
  }
  if (focus?.kind === 'retrieval') {
    return <RetrievalPanel retrieval={view.retrieval} />;
  }
  return <div className={styles.muted}>Пока нечего показать.</div>;
}
