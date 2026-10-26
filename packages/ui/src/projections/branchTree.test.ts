import { describe, expect, it } from 'vitest';
import type { TraceSummary } from '@harness-visualization/server';
import { branchFamily, nestBranches, uniqueParagraphs } from './branchTree';

function trace(file: string, startedAt: string, sourceFile: string | null = null): TraceSummary {
  return {
    file,
    kind: 'session',
    synthetic: false,
    example: false,
    sessionId: file,
    title: 'вопрос',
    model: 'deepseek-flash',
    startedAt,
    finishedAt: startedAt,
    eventCount: 10,
    finished: true,
    hasError: false,
    skippedLines: 0,
    sizeBytes: 100,
    branch: sourceFile === null ? null : { sourceFile, step: 4, change: 'toolResult' },
  };
}

const traces = [
  trace('c', '2026-10-26T10:20'),
  trace('b2', '2026-10-26T10:15', 'a'),
  trace('b1a', '2026-10-26T10:12', 'b1'),
  trace('b1', '2026-10-26T10:10', 'a'),
  trace('a', '2026-10-26T10:00'),
];

describe('семья веток', () => {
  it('от любой ветки — вся семья от корня, ветки по времени', () => {
    const family = branchFamily(traces, 'b1a');
    expect(family.map((node) => `${'·'.repeat(node.depth)}${node.trace.file}`)).toEqual([
      'a',
      '·b1',
      '··b1a',
      '·b2',
    ]);
    expect(family[2]?.parentFile).toBe('b1');
  });

  it('в списке трейсов ветки — под родителями', () => {
    expect(nestBranches(traces).map((node) => node.trace.file)).toEqual([
      'c',
      'a',
      'b1',
      'b1a',
      'b2',
    ]);
  });

  it('ветка, чей родитель удалён, — сама корень', () => {
    expect(branchFamily([trace('x', '2026-10-26T11:00', 'gone')], 'x')).toHaveLength(1);
  });

  it('разница ответов — по абзацам', () => {
    const before = 'Коротко: да.\n\nРасхождений нет.\n\nКому писать: ИТ.';
    const after = 'Коротко:  да.\n\nКому писать: ИТ.\n\nИз-за рубежа — 30 дней.';
    expect([...uniqueParagraphs(before, after)]).toEqual(['Расхождений нет.']);
    expect([...uniqueParagraphs(after, before)]).toEqual(['Из-за рубежа — 30 дней.']);
  });

  it('другие слова того же абзаца — не разница', () => {
    const before = 'Коротко: да, для доступа к внутренним системам из дома нужен.';
    const after = 'Коротко: Да — для доступа к внутренним системам из дома VPN нужен.';
    expect(uniqueParagraphs(after, before).size).toBe(0);
  });
});
