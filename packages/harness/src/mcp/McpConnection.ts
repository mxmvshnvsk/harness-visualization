// Соединение с одним MCP-сервером: запускает его подпроцессом,
// проходит рукопожатие, узнаёт список тулов и вызывает их.

import {
  Client,
  type CallToolResult,
  type Implementation,
  type Tool as McpTool,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { EventStream } from '../events/EventStream.js';
import type { McpServerSettings } from '../settings/settingsSchema.js';
import { ObservedTransport } from './ObservedTransport.js';

const CLIENT_INFO = { name: 'harness-visualization', version: '0.1.0' };

export interface McpConnectionOptions {
  settings: McpServerSettings;
  projectRoot: string;
  events: EventStream;
}

export class McpConnection {
  readonly serverName: string;
  readonly tools: McpTool[];
  // Инструкции, которые сервер прислал при рукопожатии.
  readonly instructions: string | null;
  private readonly client: Client;

  private constructor(serverName: string, client: Client, tools: McpTool[]) {
    this.serverName = serverName;
    this.client = client;
    this.tools = tools;
    this.instructions = client.getInstructions() ?? null;
  }

  static async open(options: McpConnectionOptions): Promise<McpConnection> {
    const { settings, events } = options;
    const transport = new StdioClientTransport({
      command: resolveCommand(settings.command),
      args: settings.args,
      cwd: options.projectRoot,
      env: pickEnvironment(settings.environmentVariables),
      stderr: 'pipe',
    });
    forwardServerLog(transport, settings.name, events);

    const client = new Client(CLIENT_INFO);
    const observedTransport = new ObservedTransport(transport, (direction, message) => {
      events.emit({ type: 'mcp_message', serverName: settings.name, direction, message });
    });
    try {
      await client.connect(observedTransport);
      return new McpConnection(settings.name, client, await listAllTools(client));
    } catch (error) {
      // Если рукопожатие не удалось, подпроцесс сервера не должен остаться висеть.
      await client.close();
      throw error;
    }
  }

  serverInfo(): Implementation | null {
    return this.client.getServerVersion() ?? null;
  }

  protocolVersion(): string | null {
    return this.client.getNegotiatedProtocolVersion() ?? null;
  }

  async callTool(name: string, toolArguments: Record<string, unknown>): Promise<CallToolResult> {
    return this.client.callTool({ name, arguments: toolArguments });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

// Список тулов может прийти частями: сервер отдаёт курсор следующей страницы.
async function listAllTools(client: Client): Promise<McpTool[]> {
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? undefined : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}

// node — запускаем тот же Node.js, что и харнесс, а не тот, что первым найдётся в PATH.
function resolveCommand(command: string): string {
  return command === 'node' ? process.execPath : command;
}

// Базовые переменные (PATH, HOME и т. п.) клиент MCP передаёт сам, здесь — только разрешённые сверх них.
function pickEnvironment(variableNames: string[]): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of variableNames) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
}

function forwardServerLog(
  transport: StdioClientTransport,
  serverName: string,
  events: EventStream,
): void {
  const { stderr } = transport;
  if (!(stderr instanceof Readable)) {
    return;
  }
  createInterface({ input: stderr }).on('line', (text) => {
    events.emit({ type: 'mcp_server_log', serverName, text });
  });
}
