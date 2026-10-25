// Превращает тул MCP-сервера в обычный тул харнесса.
// Для модели и для политики он ничем не отличается от встроенных:
// у него есть имя, описание, схема аргументов и классы действий.

import type { CallToolResult, ContentBlock, Tool as McpTool } from '@modelcontextprotocol/client';
import { ToolError } from '../tools/ToolError.js';
import type { Tool, ToolOutput } from '../tools/toolTypes.js';
import { withoutSchemaKeyword } from '../tools/withoutSchemaKeyword.js';
import { effectsFromAnnotations } from './effectsFromAnnotations.js';
import type { McpConnection } from './McpConnection.js';

// kedr + search → kedr__search: так тулы разных серверов не перепутаются.
const TOOL_NAME_SEPARATOR = '__';
const MAX_ARGUMENTS_PREVIEW_LENGTH = 120;

export function createMcpTool(
  connection: McpConnection,
  mcpTool: McpTool,
  trustAnnotations: boolean,
): Tool {
  const serverName = connection.serverName;
  const effects = trustAnnotations ? effectsFromAnnotations(mcpTool.annotations) : [];
  return {
    name: `${serverName}${TOOL_NAME_SEPARATOR}${mcpTool.name}`,
    description: `MCP-сервер ${serverName}. ${mcpTool.description ?? mcpTool.title ?? ''}`.trim(),
    parametersSchema: withoutSchemaKeyword(mcpTool.inputSchema),
    effects,
    prepare(rawArguments) {
      // Аргументы проверяет сам сервер по своей схеме, харнесс проверяет только форму.
      if (!isPlainObject(rawArguments)) {
        throw new ToolError('Аргументы должны быть объектом JSON');
      }
      const argumentsPreview = JSON.stringify(rawArguments).slice(0, MAX_ARGUMENTS_PREVIEW_LENGTH);
      return {
        actionDescription: `Вызвать ${mcpTool.name} на MCP-сервере ${serverName} с ${argumentsPreview}`,
        targets: [],
        effects,
        checkBeforeExecution: () => Promise.resolve(),
        execute: async () => {
          const result = await connection.callTool(mcpTool.name, rawArguments);
          return toToolOutput(result, serverName, mcpTool.name);
        },
      };
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// isError: true — тул отработал, но с ошибкой; модель получит её текст и сможет исправиться.
function toToolOutput(result: CallToolResult, serverName: string, mcpToolName: string): ToolOutput {
  const content = result.content.map(describeContentBlock).join('\n');
  if (result.isError === true) {
    throw new ToolError(content);
  }
  return { content, details: { mcpServer: serverName, mcpTool: mcpToolName } };
}

// Модели харнесс пока передаёт только текст: картинки и файлы — на будущее.
function describeContentBlock(block: ContentBlock): string {
  if (block.type === 'text') {
    return block.text;
  }
  return `[блок ${block.type} пропущен: харнесс передаёт модели только текст]`;
}
