import { describe, expect, it } from 'vitest';
import type { HarnessEventPayload } from '@harness-visualization/harness';
import { projectCode } from './projectCode';
import { countChanges, diffHunks, lineDiff } from './lineDiff';
import { EventLog, modelRequest, sessionStarted, toolCall, toolCallEvent } from './testEvents';

function result(
  id: string,
  name: string,
  content: string,
  details: Record<string, unknown> | null = null,
): HarnessEventPayload {
  return {
    type: 'tool_result',
    toolCallId: id,
    toolName: name,
    status: 'success',
    content,
    details,
    cost: null,
    durationMs: 5,
  };
}

function arenaLog(): EventLog {
  const started = sessionStarted();
  const arena = {
    taskId: 'trip-deadline',
    directory: 'workspace-arena/x',
    runTests: true,
    contextPreset: 'real' as const,
    maxIterations: 25,
    network: 'open' as const,
    nodeVersion: '24.6.0',
  };
  const read = toolCall('c1', 'read_file', '{"path":"src/tripReport.js"}');
  const write = toolCall(
    'c2',
    'write_file',
    JSON.stringify({ path: './src/tripReport.js', content: 'a\nB\nc\n' }),
  );
  const create = toolCall('c3', 'write_file', JSON.stringify({ path: 'tmp.js', content: 'x\n' }));
  const tests = toolCall('c4', 'run_tests');
  return new EventLog()
    .add(started.type === 'session_started' ? { ...started, demoProject: false, arena } : started)
    .add(modelRequest('r1', 1))
    .add(toolCallEvent(read))
    .add(result('c1', 'read_file', 'a\nb\nc\n'))
    .add(modelRequest('r2', 2))
    .add(toolCallEvent(write))
    .add(result('c2', 'write_file', 'Записано'))
    .add(toolCallEvent(create))
    .add(result('c3', 'write_file', 'Записано'))
    .add(modelRequest('r3', 3))
    .add(toolCallEvent(tests))
    .add(
      result('c4', 'run_tests', 'Тесты: прошло 2, упало 1.', {
        passed: 2,
        failed: 1,
        tests: [
          { name: 'будни', file: 'test/a.test.js', ok: true, error: null },
          {
            name: 'праздники',
            file: 'test/a.test.js',
            ok: false,
            error: 'ожидалось 1, получено 2',
          },
        ],
        timedOut: false,
        network: 'open',
      }),
    );
}

describe('projectCode', () => {
  const log = arenaLog();

  it('исходный текст — из read_file, новый — из write_file; путь без ./', () => {
    const view = projectCode(log.events, log.length);
    const file = view.files.find((item) => item.path === 'src/tripReport.js');
    expect(file).toMatchObject({
      original: 'a\nb\nc\n',
      current: 'a\nB\nc\n',
      status: 'modified',
      step: 2,
    });
  });

  it('файл, записанный без чтения, — новый; изменённые раньше прочитанных', () => {
    const view = projectCode(log.events, log.length);
    expect(view.files.map((file) => [file.path, file.status])).toEqual([
      ['src/tripReport.js', 'modified'],
      ['tmp.js', 'created'],
    ]);
  });

  it('идёт за курсором: до записи файл только прочитан', () => {
    const view = projectCode(log.events, 4);
    expect(view.files[0]?.status).toBe('read');
    expect(view.testRuns).toEqual([]);
  });

  it('запуски тестов — с шагом и упавшими тестами', () => {
    const view = projectCode(log.events, log.length);
    expect(view.testRuns).toEqual([
      {
        step: 3,
        passed: 2,
        failed: 1,
        failedTests: [
          { name: 'праздники', file: 'test/a.test.js', error: 'ожидалось 1, получено 2' },
        ],
        timedOut: false,
        network: 'open',
      },
    ]);
    expect(view.arena?.taskId).toBe('trip-deadline');
  });
});

describe('lineDiff', () => {
  it('замена строки — удаление и добавление на её месте', () => {
    const lines = lineDiff('a\nb\nc\n', 'a\nB\nc\n');
    expect(lines.map((line) => `${line.kind}:${line.text}`)).toEqual([
      'same:a',
      'del:b',
      'add:B',
      'same:c',
    ]);
    expect(countChanges(lines)).toEqual({ added: 1, removed: 1 });
  });

  it('новый файл — все строки добавлены, с номерами', () => {
    expect(lineDiff('', 'x\ny')).toEqual([
      { kind: 'add', text: 'x', oldNumber: null, newNumber: 1 },
      { kind: 'add', text: 'y', oldNumber: null, newNumber: 2 },
    ]);
  });

  it('далёкие от правок строки сворачиваются', () => {
    const before = Array.from({ length: 20 }, (_item, index) => `line ${String(index)}`).join('\n');
    const after = before.replace('line 10', 'LINE 10');
    const hunks = diffHunks(lineDiff(before, after), 2);
    expect(
      hunks.map((hunk) =>
        hunk.kind === 'skip' ? `skip ${String(hunk.count)}` : `lines ${String(hunk.lines.length)}`,
      ),
    ).toEqual(['skip 8', 'lines 6', 'skip 7']);
  });
});
