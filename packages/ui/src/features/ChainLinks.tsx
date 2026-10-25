// Ссылки цепочки вызова: тот же вызов в других видах — шаг в инспекторе, пара сообщений
// в журнале MCP и поиск в «RAG», где видно, как запрос стал вектором. Показываются только
// нужные: из текущего вида в него же ссылки нет.

import type { ReactElement } from 'react';
import { useViewLinks, type SearchLink } from '../app/viewLinks';
import styles from './ChainLinks.module.css';

interface ChainLinksProps {
  link: SearchLink;
  inspector?: boolean;
  mcp?: boolean;
  // В «RAG» — только у поиска по смыслу и гибрида: у них есть вектор.
  rag?: boolean;
}

export function ChainLinks({ link, inspector, mcp, rag }: ChainLinksProps): ReactElement | null {
  const links = useViewLinks();
  if (links === null || (inspector !== true && mcp !== true && rag !== true)) {
    return null;
  }
  return (
    <span className={styles.links}>
      {inspector === true && (
        <button
          type="button"
          onClick={() => {
            links.toInspector(link);
          }}
        >
          в инспекторе →
        </button>
      )}
      {mcp === true && (
        <button
          type="button"
          onClick={() => {
            links.toMcp(link);
          }}
        >
          в журнале MCP →
        </button>
      )}
      {rag === true && (
        <button
          type="button"
          onClick={() => {
            links.toRag(link);
          }}
        >
          как запрос стал вектором — в «RAG» →
        </button>
      )}
    </span>
  );
}

// Тулы, у которых запрос внутри сервера превращается в вектор.
export function hasVector(mcpToolName: string): boolean {
  return mcpToolName === 'semantic_search' || mcpToolName === 'hybrid_search';
}
