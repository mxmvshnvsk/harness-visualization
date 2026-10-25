// Группы событий: у каждой свой цвет в токенах (--dialog, --model…), одинаковый на всех экранах.

import type { HarnessEventType } from '@harness-visualization/harness';

export type EventGroup =
  'dialog' | 'model' | 'tool' | 'permission' | 'retrieval' | 'judge' | 'error' | 'meta';

// Record по всем типам: появится новый тип события — tsc потребует отнести его к группе.
const EVENT_GROUPS: Record<HarnessEventType, EventGroup> = {
  session_started: 'meta',
  workspace_prepared: 'meta',
  mcp_server_starting: 'meta',
  mcp_server_ready: 'meta',
  mcp_server_failed: 'error',
  mcp_message: 'meta',
  mcp_server_log: 'meta',
  mcp_server_stopped: 'meta',
  network_request: 'meta',
  user_message: 'dialog',
  query_rewritten: 'retrieval',
  context_retrieved: 'retrieval',
  grounding_check_started: 'judge',
  claim_judged: 'judge',
  prompt_assembled: 'model',
  model_request: 'model',
  model_response: 'model',
  model_error: 'error',
  tool_call: 'tool',
  tool_result: 'tool',
  permission_evaluated: 'permission',
  permission_requested: 'permission',
  permission_resolved: 'permission',
  assistant_message: 'dialog',
  awaiting_question: 'dialog',
  tool_result_truncated: 'model',
  tool_results_cleared: 'model',
  history_compacted: 'model',
  skill_catalog: 'meta',
  skill_loaded: 'model',
  memory_loaded: 'meta',
  iteration_limit_reached: 'model',
  subagent_started: 'tool',
  subagent_finished: 'tool',
  memory_updated: 'tool',
  progress_updated: 'tool',
  session_finished: 'meta',
  error: 'error',
};

// Служебные события: много и шумно, по умолчанию скрыты.
export const SERVICE_EVENT_TYPES: ReadonlySet<HarnessEventType> = new Set([
  'mcp_message',
  'network_request',
  'mcp_server_log',
]);

export function eventGroup(type: HarnessEventType): EventGroup {
  return EVENT_GROUPS[type];
}
