import { describe, expect, it } from 'vitest';
import { parseSearchResult } from './parseSearchResult';
import { citedDocuments, projectRetrieval, sessionDocuments } from './projectRetrieval';
import { EventLog, modelRequest, sessionStarted, toolCall, toolCallEvent } from './testEvents';

const SEMANTIC = [
  'regulations/sickLeave — Порядок оформления больничного (regulation, 2025-11-12), фрагмент 1 из 1, сходство 0.867',
  '# Порядок оформления больничного',
  '',
  '1. Заболев, сообщите руководителю.',
  '',
  'team/contacts — Справочник сотрудников (team, 2026-10-05), фрагмент 5 из 6, сходство 0.826',
  '| Сотрудник | Отдел |',
  '',
  'team/contacts — Справочник сотрудников (team, 2026-10-05), фрагмент 2 из 6, сходство 0.822',
  '| Мария Орлова | Кадры |',
].join('\n');

const HYBRID =
  'faq/hrFaq — Частые вопросы к отделу кадров (faq, 2025-03-01), фрагмент 1 из 1, по словам: не найден, по смыслу: 2-е место\nТекст.';

describe('parseSearchResult', () => {
  it('разбирает заголовки, оценки и текст фрагментов', () => {
    const chunks = parseSearchResult(SEMANTIC);
    expect(chunks.map((chunk) => [chunk.documentId, chunk.similarity])).toEqual([
      ['regulations/sickLeave', 0.867],
      ['team/contacts', 0.826],
      ['team/contacts', 0.822],
    ]);
    expect(chunks[0]?.text).toBe(
      '# Порядок оформления больничного\n\n1. Заболев, сообщите руководителю.',
    );
    expect(chunks[1]?.fragment).toEqual({ position: 5, total: 6 });
  });

  it('у гибрида — места в двух выдачах, «не найден» — null', () => {
    expect(parseSearchResult(HYBRID)[0]?.places).toEqual({ words: null, meaning: 2 });
  });
});

describe('projectRetrieval', () => {
  it('поиск харнесса, поиск и чтение модели — по шагам; фрагменты одного документа — одна строка', () => {
    const search = toolCall('c1', 'kedr__search', '{"query":"день здоровья","limit":5}');
    const read = toolCall('c2', 'kedr__read_document', '{"id":"regulations/sickLeave"}');
    const log = new EventLog()
      .add(sessionStarted('rewrite'))
      .add({ type: 'user_message', text: 'сколько платят на больничном' })
      .add({
        type: 'context_retrieved',
        toolName: 'kedr__semantic_search',
        arguments: { query: 'оплата больничного', limit: 5 },
        queryAuthor: 'model',
        userQuestion: 'сколько платят на больничном',
        status: 'success',
        content: SEMANTIC,
        durationMs: 5,
      })
      .add(modelRequest('r1', 1))
      .add(toolCallEvent(search))
      .add(result(search, HYBRID))
      .add(toolCallEvent(read))
      .add(result(read, 'id: regulations/sickLeave'))
      .add({ type: 'assistant_message', text: 'См. regulations/sickLeave.' });
    const view = projectRetrieval(log.events);
    expect(view.mode).toBe('rewrite');
    expect(view.actions.map((action) => [action.kind, action.step])).toEqual([
      ['search', null],
      ['search', 1],
      ['read', 1],
    ]);
    const harness = view.actions[0];
    expect(
      harness?.kind === 'search' &&
        harness.documents.map((document) => [
          document.documentId,
          document.place,
          document.fragments,
        ]),
    ).toEqual([
      ['regulations/sickLeave', 1, 1],
      ['team/contacts', 2, 2],
    ]);
    const documents = sessionDocuments(view.actions).map((document) => document.documentId);
    expect(documents).toEqual(['regulations/sickLeave', 'team/contacts', 'faq/hrFaq']);
    expect([...citedDocuments(view.answers, documents)]).toEqual(['regulations/sickLeave']);
  });
});

function result(call: { id: string; name: string }, content: string) {
  return {
    type: 'tool_result',
    toolCallId: call.id,
    toolName: call.name,
    status: 'success',
    content,
    details: null,
    cost: null,
    durationMs: 3,
  } as const;
}
