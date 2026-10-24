// Тулы MCP-сервера базы знаний: поиск по словам, чтение документа, каталог.
// Все только читают — это заявлено в annotations.readOnlyHint.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { KnowledgeDocument } from '../knowledgeBase/documentTypes.js';
import { searchDocuments, type SearchHit } from '../knowledgeBase/searchDocuments.js';
import { READ_ONLY_ANNOTATIONS } from './readOnlyAnnotations.js';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_SEARCH_LIMIT = 20;

export function registerKnowledgeBaseTools(
  server: McpServer,
  documents: KnowledgeDocument[],
): void {
  registerSearchTool(server, documents);
  registerReadDocumentTool(server, documents);
  registerListDocumentsTool(server, documents);
}

function registerSearchTool(server: McpServer, documents: KnowledgeDocument[]): void {
  server.registerTool(
    'search',
    {
      title: 'Поиск по базе знаний',
      description:
        'Ищет документы базы знаний компании «Кедр Софт» по словам запроса: регламенты, проекты, ' +
        'протоколы встреч, FAQ, разборы инцидентов, справочник сотрудников. ' +
        'Возвращает документы с датой и подходящим фрагментом. Чтобы прочитать документ целиком, используй read_document.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Слова для поиска, например «удалённая работа»'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_LIMIT)
          .optional()
          .describe(`Сколько документов вернуть, по умолчанию ${DEFAULT_SEARCH_LIMIT}`),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    ({ query, limit }) => {
      const hits = searchDocuments(documents, query, limit ?? DEFAULT_SEARCH_LIMIT);
      const text =
        hits.length === 0
          ? `По запросу «${query}» ничего не найдено`
          : hits.map(describeHit).join('\n\n');
      return { content: [{ type: 'text', text }] };
    },
  );
}

function registerReadDocumentTool(server: McpServer, documents: KnowledgeDocument[]): void {
  server.registerTool(
    'read_document',
    {
      title: 'Прочитать документ',
      description:
        'Возвращает документ базы знаний целиком, с метаданными. id берётся из результатов search или list_documents.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Идентификатор документа, например regulations/vacation'),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    ({ id }) => {
      const document = documents.find((candidate) => candidate.id === id);
      if (document === undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Документа «${id}» нет. Найдите id через search или list_documents.`,
            },
          ],
        };
      }
      return { content: [{ type: 'text', text: describeFullDocument(document) }] };
    },
  );
}

function registerListDocumentsTool(server: McpServer, documents: KnowledgeDocument[]): void {
  server.registerTool(
    'list_documents',
    {
      title: 'Каталог документов',
      description:
        'Показывает список документов базы знаний: id, название, тип и дату. Можно отфильтровать по типу.',
      inputSchema: z.object({
        type: z
          .string()
          .optional()
          .describe('Тип документа: regulation, project, meeting, faq, incident, team, glossary'),
      }),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    ({ type }) => {
      const selected =
        type === undefined ? documents : documents.filter((document) => document.type === type);
      const text =
        selected.length === 0
          ? `Документов типа «${type ?? ''}» нет`
          : selected.map(describeListEntry).join('\n');
      return { content: [{ type: 'text', text }] };
    },
  );
}

function describeHit(hit: SearchHit): string {
  const { document } = hit;
  return `${document.id} — ${document.title} (${document.type}, ${document.date ?? 'без даты'})\n${hit.snippet}`;
}

function describeListEntry(document: KnowledgeDocument): string {
  return `${document.id} — ${document.title} (${document.type}, ${document.date ?? 'без даты'})`;
}

function describeFullDocument(document: KnowledgeDocument): string {
  const metadata = [
    `id: ${document.id}`,
    `тип: ${document.type}`,
    `дата: ${document.date ?? 'не указана'}`,
    `владелец: ${document.owner ?? 'не указан'}`,
  ];
  return `${metadata.join('\n')}\n\n${document.body}`;
}
