import type { HarnessEvent } from '@harness-visualization/harness';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectMcp, toolTokens } from './projectMcp';

const events = readFileSync(
  new URL('../../../../examples/traces/2026-10-25T14-49-33_19b7e04d.jsonl', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as HarnessEvent);

describe('projectMcp', () => {
  const view = projectMcp(events);

  it('сервер: запуск, готовность, остановка', () => {
    expect(view.servers).toHaveLength(1);
    const [server] = view.servers;
    expect(server?.name).toBe('kedr');
    expect(server?.trustAnnotations).toBe(true);
    expect(server?.ready?.tools).toHaveLength(5);
    expect(server?.stopped).not.toBeNull();
  });

  it('журнал: пары по id, у tools/call — просьба модели и решение политики', () => {
    const pairs = view.journal.flatMap((item) => (item.kind === 'pair' ? [item.pair] : []));
    expect(pairs.map((pair) => pair.method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/list',
      'tools/call',
      'tools/call',
      'tools/call',
      'tools/call',
    ]);
    expect(pairs.find((pair) => pair.method === 'notifications/initialized')?.response).toBeNull();
    const calls = pairs.filter((pair) => pair.method === 'tools/call');
    expect(calls.every((pair) => pair.response !== null)).toBe(true);
    expect(calls.map((pair) => pair.call?.toolName)).toEqual([
      'kedr__search',
      'kedr__semantic_search',
      'kedr__search',
      'kedr__list_documents',
    ]);
    expect(calls[0]?.call?.decision).toBe('allow');
    expect(calls[0]?.step).toBe(1);
    expect(view.journal.filter((item) => item.kind === 'log')).toHaveLength(3);
  });

  it('шаги модели и вес описаний тулов', () => {
    expect(view.steps).toHaveLength(4);
    expect(view.calls).toHaveLength(4);
    expect(toolTokens(events).get('kedr__semantic_search')).toBeGreaterThan(
      toolTokens(events).get('kedr__list_documents') ?? 0,
    );
  });
});
