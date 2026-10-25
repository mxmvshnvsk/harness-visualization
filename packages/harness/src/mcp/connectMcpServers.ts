// Запускает MCP-серверы из настроек и превращает их тулы в тулы харнесса.
// Сервер, который не запустился, не роняет сессию: агент работает без его тулов.
// Тулы из hiddenTools модель не видит — они только для вызовов самого харнесса.

import type { McpServerInstructions } from '../agent/systemPrompt.js';
import type { McpToolSummary } from '../events/harnessEvents.js';
import type { EventStream } from '../events/EventStream.js';
import type { McpServerSettings } from '../settings/settingsSchema.js';
import type { Tool } from '../tools/toolTypes.js';
import { createMcpTool } from './createMcpTool.js';
import { McpConnection } from './McpConnection.js';

export interface ConnectedMcpServers {
  connections: McpConnection[];
  // Тулы, которые харнесс предложит модели.
  tools: Tool[];
  // Тулы, которые вызывает только харнесс (hiddenTools в настройках сервера).
  harnessOnlyTools: Tool[];
  instructions: McpServerInstructions[];
}

export interface McpServersContext {
  projectRoot: string;
  events: EventStream;
}

export async function connectMcpServers(
  servers: McpServerSettings[],
  context: McpServersContext,
): Promise<ConnectedMcpServers> {
  const connected: ConnectedMcpServers = {
    connections: [],
    tools: [],
    harnessOnlyTools: [],
    instructions: [],
  };
  for (const settings of servers.filter((server) => server.enabled)) {
    const startedAt = performance.now();
    const connection = await openConnection(settings, context);
    if (connection === null) {
      continue;
    }
    const tools = connection.tools.map((mcpTool) =>
      createMcpTool(connection, mcpTool, settings.trustAnnotations),
    );
    context.events.emit({
      type: 'mcp_server_ready',
      serverName: settings.name,
      serverInfo: connection.serverInfo(),
      protocolVersion: connection.protocolVersion(),
      instructions: connection.instructions,
      tools: summarizeTools(connection, tools, settings.hiddenTools),
      durationMs: Math.round(performance.now() - startedAt),
    });
    connected.connections.push(connection);
    connection.tools.forEach((mcpTool, index) => {
      const tool = tools[index];
      if (tool === undefined) {
        return;
      }
      const isHidden = settings.hiddenTools.includes(mcpTool.name);
      (isHidden ? connected.harnessOnlyTools : connected.tools).push(tool);
    });
    if (connection.instructions !== null) {
      connected.instructions.push({ serverName: settings.name, text: connection.instructions });
    }
  }
  return connected;
}

async function openConnection(
  settings: McpServerSettings,
  context: McpServersContext,
): Promise<McpConnection | null> {
  const { events } = context;
  events.emit({
    type: 'mcp_server_starting',
    serverName: settings.name,
    command: settings.command,
    args: settings.args,
    trustAnnotations: settings.trustAnnotations,
  });
  try {
    return await McpConnection.open({ settings, ...context });
  } catch (error) {
    events.emit({
      type: 'mcp_server_failed',
      serverName: settings.name,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// Тулы харнесса созданы из тулов сервера в том же порядке.
function summarizeTools(
  connection: McpConnection,
  tools: Tool[],
  hiddenTools: string[],
): McpToolSummary[] {
  return connection.tools.map((mcpTool, index) => ({
    name: tools[index]?.name ?? mcpTool.name,
    mcpName: mcpTool.name,
    annotations: mcpTool.annotations ?? null,
    effects: [...(tools[index]?.effects ?? [])],
    hiddenFromModel: hiddenTools.includes(mcpTool.name),
  }));
}

export async function closeMcpServers(
  connections: McpConnection[],
  events: EventStream,
): Promise<void> {
  for (const connection of connections) {
    await connection.close();
    events.emit({ type: 'mcp_server_stopped', serverName: connection.serverName });
  }
}
