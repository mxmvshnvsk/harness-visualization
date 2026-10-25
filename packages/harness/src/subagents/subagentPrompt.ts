// System prompt субагента (этап 6c). Свой, короче главного: ни скиллов, ни памяти, ни диалога —
// одна задача и отчёт для главного агента. Инструкции MCP-серверов — только тех, чьи тулы у него есть.

import { describeMcpInstructions, describeToday } from '../agent/systemPrompt.js';
import type { McpServerInstructions } from '../agent/systemPrompt.js';

export interface SubagentPromptParts {
  agent: string;
  instructions: string;
  toolNames: string[];
  mcpInstructions: McpServerInstructions[];
}

export function buildSubagentPrompt(now: Date, parts: SubagentPromptParts): string {
  const mcp = parts.mcpInstructions.filter((server) =>
    parts.toolNames.some((name) => name.startsWith(`${server.serverName}__`)),
  );
  return [
    `Ты — субагент «${parts.agent}» в учебном проекте Harness Visualization.`,
    'Главный агент поручил тебе одну задачу — она в сообщении ниже.',
    'Твой ответ целиком уйдёт главному агенту как отчёт. Пользователь его не видит, уточнить у него ничего нельзя.',
    'Делай только порученное. Не придумывай содержимое файлов — найди и прочитай их тулами.',
    'У тебя есть рабочая папка с документами компании «Кедр Софт». Пути указывай относительно её корня.',
    'Отчёт — кратко, по пунктам: факты и у каждого источник (путь к файлу, пункт). Чего не нашёл — так и напиши.',
    ...(parts.instructions.trim() === '' ? [] : ['', parts.instructions.trim()]),
    ...describeMcpInstructions(mcp),
    describeToday(now),
  ].join('\n');
}
