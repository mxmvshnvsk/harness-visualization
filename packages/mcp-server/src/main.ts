// MCP-сервер базы знаний «Кедр Софт». Общается с клиентом через stdio:
// stdout занят протоколом JSON-RPC, поэтому все сообщения для людей — только в stderr.
// Любая строка в stdout, кроме сообщений протокола, сломала бы клиенту разбор.

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadKnowledgeBase } from './knowledgeBase/loadKnowledgeBase.js';
import { redirectConsoleToStderr } from './redirectConsoleToStderr.js';
import { SemanticIndex } from './semanticSearch/SemanticIndex.js';
import { DATA_DIRECTORY, MODEL_DIRECTORY, VECTOR_CACHE_PATH } from './serverPaths.js';
import { registerKnowledgeBaseTools } from './tools/registerKnowledgeBaseTools.js';
import { registerSemanticSearchTool } from './tools/registerSemanticSearchTool.js';

const SERVER_INSTRUCTIONS =
  'База знаний вымышленной компании «Кедр Софт». Ищи документы по словам через search ' +
  'или по смыслу через semantic_search, читай целиком через read_document. ' +
  'Если документы противоречат друг другу, опирайся на более свежий.';

async function main(): Promise<void> {
  redirectConsoleToStderr();
  const documents = await loadKnowledgeBase(DATA_DIRECTORY);
  console.error(`База знаний загружена: ${documents.length} документов`);

  const semanticIndex = new SemanticIndex({
    documents,
    modelDirectory: MODEL_DIRECTORY,
    vectorCachePath: VECTOR_CACHE_PATH,
    log: (message) => {
      console.error(message);
    },
  });

  serveStdio(() => {
    const server = new McpServer(
      { name: 'kedr-knowledge-base', version: '0.2.0' },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
    );
    registerKnowledgeBaseTools(server, documents);
    registerSemanticSearchTool(server, semanticIndex);
    return server;
  });

  // Индекс строится уже после запуска сервера: рукопожатие MCP не ждёт модель.
  semanticIndex.startBuilding();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
