// Тесты Код-арены (этап 10): node --test в папке проекта, в песочнице nodeSandbox.ts.

import { runSandboxedNode, sandboxInfo, truncate, type SandboxConfig } from './nodeSandbox.js';
import { parseTap, type NodeTestResult } from './testResults.js';

export { networkClosedByPermissions } from './nodeSandbox.js';

export interface NodeTestRequest {
  directory: string;
  // Что запускать: по умолчанию все тесты node --test (test/, *.test.js и т. п.).
  patterns: string[];
  timeoutMs: number;
  outputMaxCharacters: number;
  sandbox: SandboxConfig;
}

// Флаги зависят от версии Node песочницы — у Docker она своя, из образа.
export function nodeTestArguments(patterns: readonly string[], nodeVersion: string): string[] {
  // Один процесс на все файлы: отдельный процесс на файл модель разрешений запретила бы.
  const major = Number(nodeVersion.split('.')[0]);
  if (major < 22) {
    throw new Error(`Для Код-арены нужен Node 22 или новее, в песочнице ${nodeVersion}`);
  }
  const isolation = major >= 24 ? '--test-isolation=none' : '--experimental-test-isolation=none';
  return ['--test', isolation, '--test-reporter=tap', ...patterns];
}

export async function runNodeTests(request: NodeTestRequest): Promise<NodeTestResult> {
  const info = await sandboxInfo(request.sandbox);
  const run = await runSandboxedNode({
    directory: request.directory,
    args: nodeTestArguments(request.patterns, info.nodeVersion),
    timeoutMs: request.timeoutMs,
    sandbox: request.sandbox,
  });
  const tests = parseTap(run.output);
  return {
    passed: tests.filter((test) => test.ok).length,
    failed: tests.filter((test) => !test.ok).length,
    tests,
    output: truncate(run.output, request.outputMaxCharacters),
    durationMs: run.durationMs,
    timedOut: run.timedOut,
    network: info.network,
    nodeVersion: info.nodeVersion,
  };
}
