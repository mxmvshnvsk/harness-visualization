// Инспектор: таймлайн шагов слева, выбранный запрос, тул или retrieval — справа.
// Ничего не выбрано — показываем последний запрос к модели: в живой сессии это «сейчас».

import { useState, type ReactElement } from 'react';
import type { SessionView } from '../../projections/sessionView';
import { resolveFocus, type Focus } from './focus';
import styles from './Inspector.module.css';
import { ModelCallPanel } from './ModelCallPanel';
import { RetrievalPanel } from './RetrievalPanel';
import { Timeline } from './Timeline';
import { ToolCallPanel } from './ToolCallPanel';

export function InspectorView({ view }: { view: SessionView }): ReactElement {
  const [chosen, setChosen] = useState<Focus | null>(null);
  const focus = resolveFocus(view, chosen);
  return (
    <div className={styles.layout}>
      <Timeline view={view} focus={focus} onFocus={setChosen} />
      <FocusedPanel view={view} focus={focus} onFocus={setChosen} />
    </div>
  );
}

interface FocusedPanelProps {
  view: SessionView;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}

function FocusedPanel({ view, focus, onFocus }: FocusedPanelProps): ReactElement {
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
  return <div className={styles.muted}>Пока нечего показать: запросов к модели ещё не было.</div>;
}
