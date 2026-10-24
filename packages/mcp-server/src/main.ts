// MCP-сервер базы знаний «Кедр Софт». Общается с клиентом через stdio:
// stdout занят протоколом JSON-RPC, поэтому все сообщения для людей — только в stderr.
// Любая строка в stdout, кроме сообщений протокола, сломала бы клиенту разбор.

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';
import { loadKnowledgeBase } from './knowledgeBase/loadKnowledgeBase.js';
import { registerKnowledgeBaseTools } from './tools/registerKnowledgeBaseTools.js';

// Папка data лежит рядом с папкой dist, куда собирается этот файл.
const DATA_DIRECTORY = fileURLToPath(new URL('../data', import.meta.url));

const SERVER_INSTRUCTIONS =
  'База знаний вымышленной компании «Кедр Софт». Ищи документы через search, ' +
  'читай целиком через read_document. Если документы противоречат друг другу, опирайся на более свежий.';

async function main(): Promise<void> {
  const documents = await loadKnowledgeBase(DATA_DIRECTORY);
  console.error(`База знаний загружена: ${documents.length} документов`);

  serveStdio(() => {
    const server = new McpServer(
      { name: 'kedr-knowledge-base', version: '0.1.0' },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
    );
    registerKnowledgeBaseTools(server, documents);
    return server;
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
