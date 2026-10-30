import { ModelActor } from './models/ModelActor';
// Ссылки цепочки вызова: тот же вызов в других видах — шаг в инспекторе, пара сообщений
// в журнале MCP, поиск в «RAG» (как запрос стал вектором), запрос в «Контексте», скилл или
// память в «Скиллах и памяти», файл в «Коде». Показываются только нужные: из текущего вида
// в него же ссылки нет.

import type { ReactElement } from 'react';
import { useViewLinks, type SearchLink } from '../app/viewLinks';
import styles from './ChainLinks.module.css';

interface ChainLinksProps {
  link: SearchLink;
  inspector?: boolean;
  // Подпись ссылки в инспектор: «в инспекторе →» или точнее — «запрос в инспекторе →».
  inspectorLabel?: string;
  mcp?: boolean;
  // В «RAG» — только у поиска по смыслу и гибрида: у них есть вектор.
  rag?: boolean;
  context?: boolean;
  skills?: boolean;
  code?: boolean;
}

type Target = 'inspector' | 'mcp' | 'rag' | 'context' | 'skills' | 'code';

const LABELS: Record<Target, string> = {
  inspector: 'в инспекторе →',
  mcp: 'в журнале MCP →',
  rag: 'как запрос стал вектором — в «RAG» →',
  context: 'рост prompt в «Контексте» →',
  skills: 'в «Скиллы и память» →',
  code: 'файл в «Коде» →',
};

const TARGETS: readonly Target[] = ['inspector', 'mcp', 'rag', 'context', 'skills', 'code'];

export function ChainLinks(props: ChainLinksProps): ReactElement | null {
  const links = useViewLinks();
  const shown = TARGETS.filter((target) => props[target] === true);
  if (links === null || shown.length === 0) {
    return null;
  }
  const go: Record<Target, (link: SearchLink) => void> = {
    inspector: links.toInspector,
    mcp: links.toMcp,
    rag: links.toRag,
    context: links.toContext,
    skills: links.toSkills,
    code: links.toCode,
  };
  return (
    <span className={styles.links}>
      <ModelActor requestId={props.link.requestId} toolCallId={props.link.toolCallId} />
      {shown.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => {
            go[target](props.link);
          }}
        >
          {target === 'inspector' ? (props.inspectorLabel ?? LABELS.inspector) : LABELS[target]}
        </button>
      ))}
    </span>
  );
}

// Тулы, у которых запрос внутри сервера превращается в вектор.
export function hasVector(mcpToolName: string): boolean {
  return mcpToolName === 'semantic_search' || mcpToolName === 'hybrid_search';
}
