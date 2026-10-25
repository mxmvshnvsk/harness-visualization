// Курс MCP: события записанной сессии с сервера и проекция для шагов.

import { useEffect, useState } from 'react';
import { getMcpCourse, ServerError } from '../../api/serverApi';
import { projectMcpCourse, type McpCourse } from '../../projections/projectMcpCourse';
import type { Loaded } from '../rag/useRagData';

export function useMcpCourse(): Loaded<McpCourse & { file: string }> {
  const [state, setState] = useState<Loaded<McpCourse & { file: string }>>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    getMcpCourse().then(
      (response) => {
        if (!cancelled) {
          setState({
            status: 'ready',
            value: { ...projectMcpCourse(response.events), file: response.file },
          });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof ServerError || error instanceof Error
                ? error.message
                : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
