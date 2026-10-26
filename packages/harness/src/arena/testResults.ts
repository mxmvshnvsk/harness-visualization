// Результаты node --test (этап 10): разбор вывода TAP и сводка для модели. Без node:-модулей —
// годится и интерфейсу, и тестам.

export interface NodeTestResult {
  passed: number;
  failed: number;
  tests: NodeTestCase[];
  // Сырой вывод TAP, обрезанный до лимита.
  output: string;
  durationMs: number;
  timedOut: boolean;
  network: 'closed' | 'open';
  nodeVersion: string;
}

export interface NodeTestCase {
  name: string;
  file: string | null;
  ok: boolean;
  // Первая строка ошибки упавшего теста.
  error: string | null;
}

// TAP от node --test: «ok N - имя» и «not ok N - имя», под упавшим — YAML с error и location.
// Строки «# Subtest:» с отступом — вложенные тесты (describe); считаем только листья — у них
// нет своих вложенных.
export function parseTap(output: string): NodeTestCase[] {
  const lines = output.split('\n');
  const cases: NodeTestCase[] = [];
  lines.forEach((line, index) => {
    const match = /^(\s*)(not ok|ok) \d+ - (.*)$/.exec(line);
    if (match === null) {
      return;
    }
    const details = yamlBlock(lines, index + 1);
    if (details.type === 'suite') {
      return;
    }
    cases.push({
      name: (match[3] ?? '').replace(/ # .*$/, ''),
      file: fileOf(details.location),
      ok: match[2] === 'ok',
      error: match[2] === 'ok' ? null : describeFailure(details),
    });
  });
  return cases;
}

function yamlBlock(lines: readonly string[], from: number): Record<string, string> {
  const fields: Record<string, string> = {};
  if (lines[from]?.trim() !== '---') {
    return fields;
  }
  for (let index = from + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '...') {
      break;
    }
    const field = /^\s*(\w+): (.*)$/.exec(line);
    if (field?.[1] !== undefined && fields[field[1]] === undefined) {
      fields[field[1]] = readValue(field[2] ?? '', lines, index);
    }
  }
  return fields;
}

// error: 'текст' — одной строкой; error: |- — первая непустая строка блока ниже.
function readValue(value: string, lines: readonly string[], index: number): string {
  if (value !== '|-') {
    return value.replace(/^'(.*)'$/, '$1');
  }
  for (let next = index + 1; next < lines.length; next += 1) {
    const text = (lines[next] ?? '').trim();
    if (text !== '') {
      return text;
    }
  }
  return '';
}

// У assert.equal в TAP есть expected и actual — они понятнее первой строки сообщения.
function describeFailure(details: Record<string, string>): string {
  const message = details.error ?? 'тест упал';
  if (details.expected === undefined || details.actual === undefined) {
    return message;
  }
  return `${message.replace(/:$/, '')}: ожидалось ${details.expected}, получено ${details.actual}`;
}

// Путь файла теста от корня копии: test/… или acceptance/… — по нему приёмка отличает
// скрытые тесты от видимых.
function fileOf(location: string | undefined): string | null {
  const match = /\.[/\\](.+?\.test\.[cm]?js)/.exec(location ?? '');
  return match?.[1]?.replaceAll('\\', '/') ?? null;
}

export function summarizeTests(result: NodeTestResult): string {
  if (result.timedOut) {
    return `Тесты не уложились в отведённое время и остановлены.\n${result.output}`;
  }
  if (result.tests.length === 0) {
    return `Ни одного теста не нашлось или они не запустились.\n${result.output}`;
  }
  const failed = result.tests.filter((test) => !test.ok);
  const lines = [`Тесты: прошло ${String(result.passed)}, упало ${String(result.failed)}.`];
  for (const test of failed) {
    lines.push(`✗ ${test.name}${test.file === null ? '' : ` (${test.file})`}: ${test.error ?? ''}`);
  }
  return lines.join('\n');
}

export function testDetails(result: NodeTestResult): Record<string, unknown> {
  return {
    passed: result.passed,
    failed: result.failed,
    tests: result.tests,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    network: result.network,
    nodeVersion: result.nodeVersion,
    output: result.output,
  };
}
