import type { HarnessEvent } from '@harness-visualization/harness';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectMcpCourse } from './projectMcpCourse';

// Настоящая сессия курса из репозитория: курс строится из неё же.
const events = readFileSync(
  new URL('../../../../examples/traces/2026-10-25T14-49-33_19b7e04d.jsonl', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as HarnessEvent);

describe('projectMcpCourse', () => {
  const course = projectMcpCourse(events);

  it('разговор с сервером — от знакомства до ответа на первый вызов', () => {
    expect(course.messages.map((message) => [message.kind, message.answers])).toEqual([
      ['initialize', null],
      ['response', 'initialize'],
      ['initialized', null],
      ['list', null],
      ['response', 'list'],
      ['call', null],
      ['response', 'call'],
    ]);
  });

  it('первый вызов тула сервера: описание, просьба модели, решение политики и результат', () => {
    expect(course.serverName).toBe('kedr');
    expect(course.calledTool).toBe('kedr__search');
    expect(course.toolSchema).toMatchObject({ function: { name: 'kedr__search' } });
    expect(course.permission?.decision).toBe('allow');
    expect(course.toolResult?.content).toContain('regulations/vacation');
    expect(Array.isArray(course.toolCalls)).toBe(true);
  });

  it('бюджет и вес тулов: тулы сервера отмечены, скрытый тул — в списке сервера', () => {
    expect(course.budgets).toHaveLength(4);
    expect(course.budgets[0]?.estimate.tools).toBeGreaterThan(
      course.budgets[0]?.estimate.dialog ?? 0,
    );
    expect(course.tools.filter((tool) => tool.fromServer).map((tool) => tool.name)).toEqual([
      'kedr__search',
      'kedr__read_document',
      'kedr__list_documents',
      'kedr__semantic_search',
    ]);
    expect(
      course.serverTools.find((tool) => tool.mcpName === 'hybrid_search')?.hiddenFromModel,
    ).toBe(true);
    expect(course.systemPrompt).toContain(course.instructions ?? '—');
  });
});
