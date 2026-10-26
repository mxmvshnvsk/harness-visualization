import { describe, expect, it } from 'vitest';
import {
  parseTap,
  summarizeTests,
  type NodeTestResult,
} from '@harness-visualization/harness/arena';

// Кусок настоящего вывода node --test --test-reporter=tap: тест прошёл, тест упал на assert,
// suite с вложенным тестом, ошибка модели разрешений Node.
const TAP = `TAP version 13
# Subtest: две недели отпуска — 14 дней
not ok 1 - две недели отпуска — 14 дней
  ---
  duration_ms: 1.1
  type: 'test'
  location: './test/vacation.test.js:5:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    13 !== 14

  code: 'ERR_ASSERTION'
  expected: 14
  actual: 13
  operator: 'strictEqual'
  ...
# Subtest: конец раньше начала — ошибка
ok 2 - конец раньше начала — ошибка
  ---
  duration_ms: 0.3
  type: 'test'
  ...
# Subtest: календарь
    # Subtest: вложенный
    ok 1 - вложенный
      ---
      duration_ms: 0.1
      type: 'test'
      ...
ok 3 - календарь
  ---
  duration_ms: 0.4
  type: 'suite'
  ...
# Subtest: читает чужой файл
not ok 4 - читает чужой файл
  ---
  duration_ms: 0.2
  type: 'test'
  location: './acceptance/evil.test.js:7:1'
  error: 'Access to this API has been restricted. Use --allow-fs-read to manage permissions.'
  code: 'ERR_ACCESS_DENIED'
  ...
1..4`;

describe('parseTap', () => {
  const tests = parseTap(TAP);

  it('считает листья, без suite', () => {
    expect(tests.map((test) => [test.name, test.ok])).toEqual([
      ['две недели отпуска — 14 дней', false],
      ['конец раньше начала — ошибка', true],
      ['вложенный', true],
      ['читает чужой файл', false],
    ]);
  });

  it('у упавшего assert — ожидалось и получено', () => {
    expect(tests[0]?.error).toBe('Expected values to be strictly equal: ожидалось 14, получено 13');
    expect(tests[0]?.file).toBe('test/vacation.test.js');
  });

  it('ошибка модели разрешений — одной строкой, файл — от корня копии', () => {
    expect(tests[3]?.error).toMatch(/--allow-fs-read/);
    expect(tests[3]?.file).toBe('acceptance/evil.test.js');
  });
});

describe('summarizeTests', () => {
  const result: NodeTestResult = {
    passed: 1,
    failed: 1,
    tests: parseTap(TAP).slice(0, 2),
    output: TAP,
    durationMs: 40,
    timedOut: false,
    network: 'open',
    nodeVersion: '24.6.0',
  };

  it('модель видит счёт и упавшие тесты, а не весь TAP', () => {
    expect(summarizeTests(result)).toBe(
      'Тесты: прошло 1, упало 1.\n✗ две недели отпуска — 14 дней (test/vacation.test.js): Expected values to be strictly equal: ожидалось 14, получено 13',
    );
  });

  it('таймаут — так и сказано', () => {
    expect(summarizeTests({ ...result, timedOut: true })).toMatch(/^Тесты не уложились/);
  });
});
