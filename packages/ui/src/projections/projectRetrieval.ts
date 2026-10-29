// Вид «RAG» открытой сессии: кто, когда и что искал в базе знаний, что нашёл и что из
// найденного модель прочитала целиком и назвала в ответе. Поиски харнесса до модели —
// события context_retrieved (режимы auto и rewrite), поиски модели — вызовы тулов базы.
// Каждое действие — с номером события: вид показывает только то, до чего дошёл повтор.

import type { HarnessEvent } from '@harness-visualization/harness';
import { parseSearchResult, type FoundChunk } from './parseSearchResult';

export type SearchKind = 'words' | 'meaning' | 'hybrid';

// Тулы MCP-сервера базы знаний — по имени тула на сервере (после «сервер__»).
const SEARCH_TOOLS: Record<string, SearchKind> = {
  search: 'words',
  semantic_search: 'meaning',
  hybrid_search: 'hybrid',
};
const READ_TOOL = 'read_document';

// Найденный документ в одной выдаче: место — по первому его фрагменту.
export interface FoundDocument extends FoundChunk {
  place: number;
  fragments: number;
}

interface ActionBase {
  // Номер события в записи и время от начала — для повтора и перемотки.
  index: number;
  at: number;
  turn: number;
  // Шаг модели в ходе; null — харнесс искал до первого шага.
  step: number | null;
  // Кто искал: null — главный агент (или харнесс до модели), иначе id субагента (этап 6c).
  agentId: string | null;
  chars: number;
  failed: boolean;
}

export interface SearchAction extends ActionBase {
  kind: 'search';
  by: 'harness' | 'model';
  search: SearchKind;
  toolName: string;
  query: string;
  // Поиск харнесса: вопрос пользователя и кто сформулировал запрос.
  userQuestion: string | null;
  queryAuthor: 'user' | 'model' | null;
  // Вызов модели, из-за которого искали; null — искал харнесс до модели.
  toolCallId: string | null;
  limit: number | null;
  documents: FoundDocument[];
  chunkCount: number;
}

export interface ReadAction extends ActionBase {
  kind: 'read';
  documentId: string;
  // Вызов модели kedr__read_document — для ссылок в инспектор и журнал MCP.
  toolCallId: string;
}

export type RetrievalAction = SearchAction | ReadAction;

export interface RetrievalView {
  // Режим поиска из session_started; null — трейс до этапа 4 его не писал.
  mode: string | null;
  actions: RetrievalAction[];
  answers: { index: number; turn: number; text: string }[];
}

interface Cursor {
  startedAt: number;
  turn: number;
  step: number | null;
  calls: Map<string, { name: string; arguments: Record<string, unknown> }>;
}

export function projectRetrieval(events: readonly HarnessEvent[]): RetrievalView {
  const view: RetrievalView = { mode: null, actions: [], answers: [] };
  const first = events[0];
  const cursor: Cursor = {
    startedAt: first === undefined ? 0 : Date.parse(first.timestamp),
    turn: 0,
    step: null,
    calls: new Map(),
  };
  events.forEach((event, index) => {
    const base = (): Omit<ActionBase, 'chars' | 'failed'> => ({
      index,
      at: Date.parse(event.timestamp) - cursor.startedAt,
      turn: cursor.turn,
      step: cursor.step,
      agentId: event.agentId ?? null,
    });
    advance(cursor, event);
    const action = actionOf(event, cursor, base);
    if (action !== null) {
      view.actions.push(action);
    }
    if (event.type === 'session_started') {
      view.mode = event.retrievalMode ?? null;
    }
    if (event.type === 'assistant_message') {
      view.answers.push({ index, turn: cursor.turn, text: event.text });
    }
  });
  return view;
}

function advance(cursor: Cursor, event: HarnessEvent): void {
  if (event.type === 'user_message') {
    cursor.turn += 1;
    cursor.step = null;
  }
  // Номер шага — главного агента: у субагента свои шаги (этап 6c).
  if (
    event.type === 'model_request' &&
    event.purpose === 'agentStep' &&
    event.agentId === undefined
  ) {
    cursor.step = event.iteration;
  }
  if (event.type === 'tool_call') {
    cursor.calls.set(event.toolCallId, {
      name: event.toolName,
      arguments: asRecord(event.arguments),
    });
  }
}

function actionOf(
  event: HarnessEvent,
  cursor: Cursor,
  base: () => Omit<ActionBase, 'chars' | 'failed'>,
): RetrievalAction | null {
  if (event.type === 'context_retrieved') {
    return harnessAction(event, base);
  }
  return event.type === 'tool_result' ? modelAction(event, cursor, base) : null;
}

function harnessAction(
  event: Extract<HarnessEvent, { type: 'context_retrieved' }>,
  base: () => Omit<ActionBase, 'chars' | 'failed'>,
): SearchAction | null {
  const search = SEARCH_TOOLS[serverToolName(event.toolName)];
  if (search === undefined) {
    return null;
  }
  return searchAction(
    { ...base(), chars: event.content.length, failed: event.status === 'error' },
    { search, toolName: event.toolName, arguments: event.arguments, content: event.content },
    {
      by: 'harness',
      userQuestion: event.userQuestion,
      queryAuthor: event.queryAuthor,
      toolCallId: null,
    },
  );
}

function modelAction(
  event: Extract<HarnessEvent, { type: 'tool_result' }>,
  cursor: Cursor,
  base: () => Omit<ActionBase, 'chars' | 'failed'>,
): RetrievalAction | null {
  const call = cursor.calls.get(event.toolCallId);
  const name = serverToolName(event.toolName);
  const common = { ...base(), chars: event.content.length, failed: event.status !== 'success' };
  if (name === READ_TOOL) {
    return {
      ...common,
      kind: 'read',
      documentId: stringOf(call?.arguments.id) ?? '',
      toolCallId: event.toolCallId,
    };
  }
  const search = SEARCH_TOOLS[name];
  if (search === undefined) {
    return null;
  }
  return searchAction(
    common,
    {
      search,
      toolName: event.toolName,
      arguments: call?.arguments ?? {},
      content: event.status === 'success' ? event.content : '',
    },
    { by: 'model', userQuestion: null, queryAuthor: null, toolCallId: event.toolCallId },
  );
}

function searchAction(
  base: ActionBase,
  tool: {
    search: SearchKind;
    toolName: string;
    arguments: Record<string, unknown>;
    content: string;
  },
  origin: Pick<SearchAction, 'by' | 'userQuestion' | 'queryAuthor' | 'toolCallId'>,
): SearchAction {
  const chunks = parseSearchResult(tool.content);
  const limit = tool.arguments.limit;
  return {
    ...base,
    ...origin,
    kind: 'search',
    search: tool.search,
    toolName: tool.toolName,
    query: stringOf(tool.arguments.query) ?? '',
    limit: typeof limit === 'number' ? limit : null,
    documents: documentsOf(chunks),
    chunkCount: chunks.length,
  };
}

// Фрагменты одного документа — одна строка выдачи; место — по первому фрагменту.
export function documentsOf(chunks: readonly FoundChunk[]): FoundDocument[] {
  const documents = new Map<string, FoundDocument>();
  for (const chunk of chunks) {
    const known = documents.get(chunk.documentId);
    if (known === undefined) {
      documents.set(chunk.documentId, { ...chunk, place: documents.size + 1, fragments: 1 });
    } else {
      known.fragments += 1;
    }
  }
  return [...documents.values()];
}

// Документы всех поисков, в порядке первой находки.
export function sessionDocuments(
  actions: readonly RetrievalAction[],
): { documentId: string; title: string; documentType: string; firstIndex: number }[] {
  const documents = new Map<
    string,
    { documentId: string; title: string; documentType: string; firstIndex: number }
  >();
  for (const action of actions) {
    if (action.kind !== 'search') {
      continue;
    }
    for (const document of action.documents) {
      if (!documents.has(document.documentId)) {
        documents.set(document.documentId, {
          documentId: document.documentId,
          title: document.title,
          documentType: document.documentType,
          firstIndex: action.index,
        });
      }
    }
  }
  return [...documents.values()];
}

// Какие из найденных документов ответ называет по id — так же их узнаёт check-grounding.
export function citedDocuments(
  answers: readonly { text: string }[],
  documentIds: readonly string[],
): Set<string> {
  return new Set(documentIds.filter((id) => answers.some((answer) => answer.text.includes(id))));
}

function serverToolName(toolName: string): string {
  return toolName.split('__').at(-1) ?? toolName;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
