import { describe, expect, it } from 'vitest';
import { convertClaudeCode, convertOpenCode } from '@harness-visualization/harness/adapters';
import type { HarnessEvent } from '@harness-visualization/harness';
import { projectCode } from '../projections/projectCode';

// Вкладка «Код» у импорта: адаптер кладёт в результат тула fileEffect, projectCode по нему
// строит файлы и diff. Форматы — как в настоящих записях Claude Code 2.1 и OpenCode 2.1.4.

const SESSION = 'abcdef12-0000-0000-0000-000000000000';
const CWD = '/Users/alice/app';
const ORIGINAL = 'export function add(a, b) {\n  return a - b;\n}\n';
const FIXED = 'export function add(a, b) {\n  return a + b;\n}\n';

function line(second: number, entry: Record<string, unknown>): string {
  return JSON.stringify({
    sessionId: SESSION,
    version: '2.1.0',
    cwd: CWD,
    timestamp: new Date(Date.UTC(2026, 9, 26, 10, 0, second)).toISOString(),
    ...entry,
  });
}

function toolUse(second: number, id: string, name: string, input: unknown): string {
  return line(second, {
    type: 'assistant',
    message: {
      id: `msg_${id}`,
      role: 'assistant',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id, name, input }],
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
}

function toolResult(second: number, id: string, content: string, result: unknown): string {
  return line(second, {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content }] },
    toolUseResult: result,
  });
}

const claudeCode = [
  line(0, { type: 'user', message: { role: 'user', content: 'Почини add' } }),
  toolUse(1, 'tu_1', 'Read', { file_path: `${CWD}/math.js` }),
  toolResult(2, 'tu_1', '1\texport function add(a, b) {\n2\t  return a - b;', {
    type: 'text',
    file: {
      filePath: `${CWD}/math.js`,
      content: ORIGINAL,
      startLine: 1,
      numLines: 4,
      totalLines: 4,
    },
  }),
  toolUse(3, 'tu_2', 'Edit', {
    file_path: `${CWD}/math.js`,
    old_string: '  return a - b;',
    new_string: '  return a + b;',
    replace_all: false,
  }),
  toolResult(4, 'tu_2', 'The file has been updated successfully.', {
    filePath: `${CWD}/math.js`,
    oldString: '  return a - b;',
    newString: '  return a + b;',
    originalFile: ORIGINAL,
  }),
  toolUse(5, 'tu_3', 'Write', { file_path: `${CWD}/NOTES.md`, content: 'Исправлено.\n' }),
  toolResult(6, 'tu_3', 'File created successfully.', {
    type: 'create',
    filePath: `${CWD}/NOTES.md`,
    content: 'Исправлено.\n',
    originalFile: null,
  }),
].join('\n');

const T0 = Date.UTC(2026, 9, 26, 10, 0, 0);

function openCodeTool(id: string, name: string, input: unknown, text: string): unknown {
  return {
    type: 'tool',
    id,
    name,
    state: { status: 'completed', input, content: [{ type: 'text', text }], metadata: {} },
    time: { created: T0 + 100, completed: T0 + 200 },
  };
}

const openCode = JSON.stringify({
  info: {
    id: 'ses_abcdef123456',
    model: { id: 'deepseek/flash', providerID: 'openrouter' },
    time: { created: T0 },
    location: { directory: CWD },
  },
  messages: [
    { id: 'msg_u1', type: 'user', text: 'Почини add', time: { created: T0 + 10 } },
    {
      id: 'msg_a1',
      type: 'assistant',
      time: { created: T0 + 20, completed: T0 + 300 },
      tokens: { input: 1, output: 1 },
      content: [
        openCodeTool(
          'c1',
          'read',
          { path: `${CWD}/math.js` },
          `Read file ${CWD}/math.js, lines 1-3\n1: export function add(a, b) {\n2:   return a - b;\n3: }`,
        ),
        openCodeTool(
          'c2',
          'edit',
          { path: `${CWD}/math.js`, oldString: 'a - b', newString: 'a + b' },
          'Edit applied.',
        ),
        openCodeTool(
          'c3',
          'edit',
          { path: `${CWD}/other.js`, oldString: 'x = 1', newString: 'x = 2' },
          'Edit applied.',
        ),
      ],
    },
  ],
});

function effects(events: readonly HarnessEvent[]): unknown[] {
  return events.flatMap((event) =>
    event.type === 'tool_result' && event.details?.fileEffect !== undefined
      ? [event.details.fileEffect]
      : [],
  );
}

describe('вкладка «Код» у импорта', () => {
  it('Claude Code: чтение, правка и запись — пути от папки проекта, файл до правки точный', () => {
    const events = convertClaudeCode(claudeCode);
    expect(effects(events)).toEqual([
      { kind: 'read', path: 'math.js', content: ORIGINAL, partial: false },
      { kind: 'write', path: 'math.js', before: ORIGINAL, after: FIXED },
      { kind: 'write', path: 'NOTES.md', before: null, after: 'Исправлено.\n' },
    ]);
    const files = projectCode(events, events.length).files;
    expect(files.map((file) => [file.path, file.status])).toEqual([
      ['math.js', 'modified'],
      ['NOTES.md', 'created'],
    ]);
    expect(files[0]?.original).toBe(ORIGINAL);
    expect(files[0]?.current).toBe(FIXED);
  });

  it('OpenCode: строки «N: » без номеров, правка ложится на прочитанное, иначе — фрагментом', () => {
    const events = convertOpenCode(openCode);
    const files = projectCode(events, events.length).files;
    const math = files.find((file) => file.path === 'math.js');
    expect(math?.original).toBe('export function add(a, b) {\n  return a - b;\n}');
    expect(math?.current).toBe('export function add(a, b) {\n  return a + b;\n}');
    const other = files.find((file) => file.path === 'other.js');
    expect(other?.status).toBe('modified');
    expect(other?.current).toBeNull();
    expect(other?.fragments).toEqual([{ oldText: 'x = 1', newText: 'x = 2' }]);
  });

  it('чтение куска файла помечено как частичное', () => {
    const partial = toolResult(2, 'tu_1', '', {
      file: {
        filePath: `${CWD}/math.js`,
        content: '  return a - b;\n',
        startLine: 2,
        numLines: 1,
        totalLines: 4,
      },
    });
    const events = convertClaudeCode(
      [claudeCode.split('\n')[0], claudeCode.split('\n')[1], partial].join('\n'),
    );
    expect(projectCode(events, events.length).files[0]?.partial).toBe(true);
  });
});
