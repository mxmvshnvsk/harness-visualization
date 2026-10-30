import type { HarnessEvent } from '@harness-visualization/harness';
import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { projectModelActors } from '../../projections/modelActors';
import {
  historyMessageLabel,
  modelActorLabel,
  type ActorReference,
  type ModelActorsContextValue,
} from './modelActorLabels';
import styles from './ModelActor.module.css';

const ModelActorsContext = createContext<ModelActorsContextValue>({
  ...projectModelActors([]),
  sourceEvents: [],
});

export function ModelActorsProvider({
  events,
  children,
}: {
  events: readonly HarnessEvent[];
  children: ReactNode;
}): ReactElement {
  const value = useMemo(() => ({ ...projectModelActors(events), sourceEvents: events }), [events]);
  return <ModelActorsContext.Provider value={value}>{children}</ModelActorsContext.Provider>;
}

export function ModelActor(reference: ActorReference): ReactElement | null {
  const actors = useModelActors();
  if (!actors.multiple) {
    return null;
  }
  const label = modelActorLabel(reference, actors);
  return (
    <span className={styles.actor} title={label.title}>
      {label.text}
    </span>
  );
}

export function HistoryActors(): ReactElement | null {
  const actors = useModelActors();
  if (!actors.multiple || actors.inherited.length === 0) {
    return null;
  }
  const modelNames = [...new Set(actors.inherited.map((actor) => actor.label))];
  return (
    <p className={styles.history}>
      Из истории: {modelNames.join(', ')}. Эти сообщения не являются новыми запросами.
    </p>
  );
}

export function MessageActor({
  message,
  requestId,
}: {
  message: unknown;
  requestId: string;
}): ReactElement | null {
  const actors = useModelActors();
  if (!actors.multiple) {
    return null;
  }
  const label = historyMessageLabel(message, requestId, actors);
  if (label === null) {
    return null;
  }
  return <span className={styles.actor}>{label}</span>;
}

export function useModelActors(): ModelActorsContextValue {
  return useContext(ModelActorsContext);
}
