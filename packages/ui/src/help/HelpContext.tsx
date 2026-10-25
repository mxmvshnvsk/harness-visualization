// Справка доступна с любого экрана: кнопка «Что это?» или термин открывают окно с темой.

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { HelpDialog } from './HelpDialog';
import type { HelpTopic } from './helpTopics';

const OpenHelpContext = createContext<(topic: HelpTopic) => void>(() => undefined);

export function HelpProvider({ children }: { children: ReactNode }): ReactElement {
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const open = useCallback((next: HelpTopic) => {
    setTopic(next);
  }, []);
  return (
    <OpenHelpContext.Provider value={open}>
      {children}
      <HelpDialog
        topic={topic}
        onClose={() => {
          setTopic(null);
        }}
      />
    </OpenHelpContext.Provider>
  );
}

export function useOpenHelp(): (topic: HelpTopic) => void {
  return useContext(OpenHelpContext);
}
