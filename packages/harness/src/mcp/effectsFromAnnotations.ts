// Пометки MCP-тула → классы действий для политики харнесса.
// Значения по умолчанию — из спецификации MCP: если автор сервера ничего не указал,
// тул считается изменяющим данные, разрушительным и выходящим во внешний мир.
// Пометки — лишь заявление автора сервера, поэтому харнесс учитывает их
// только для серверов с trustAnnotations: true.

import type { Tool as McpTool } from '@modelcontextprotocol/client';
import type { ToolEffect } from '../permissions/permissionTypes.js';

export function effectsFromAnnotations(annotations: McpTool['annotations']): ToolEffect[] {
  const readOnly = annotations?.readOnlyHint ?? false;
  const destructive = annotations?.destructiveHint ?? true;
  const openWorld = annotations?.openWorldHint ?? true;

  const effects: ToolEffect[] = [];
  if (readOnly) {
    effects.push('read');
  } else {
    effects.push(destructive ? 'delete' : 'write');
  }
  if (openWorld) {
    effects.push('network');
  }
  return effects;
}
