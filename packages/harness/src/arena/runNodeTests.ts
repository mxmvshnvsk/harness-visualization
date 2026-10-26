// Тесты Код-арены (этап 10): node --test в папке проекта, в песочнице nodeSandbox.ts.

import {
  nodeMajor,
  networkClosedByPermissions,
  runSandboxedNode,
  truncate,
} from './nodeSandbox.js';
import { parseTap, type NodeTestResult } from './testResults.js';

export { networkClosedByPermissions } from './nodeSandbox.js';

export interface NodeTestRequest {
  directory: string;
  // Что запускать: по умолчанию все тесты node --test (test/, *.test.js и т. п.).
  patterns: string[];
  timeoutMs: number;
  outputMaxCharacters: number;
}

export function nodeTestArguments(patterns: readonly string[]): string[] {
  // Один процесс на все файлы: отдельный процесс на файл модель разрешений запретила бы.
  const isolation =
    nodeMajor() >= 24 ? '--test-isolation=none' : '--experimental-test-isolation=none';
  return ['--test', isolation, '--test-reporter=tap', ...patterns];
}

export async function runNodeTests(request: NodeTestRequest): Promise<NodeTestResult> {
  const run = await runSandboxedNode({
    directory: request.directory,
    args: nodeTestArguments(request.patterns),
    timeoutMs: request.timeoutMs,
  });
  const tests = parseTap(run.output);
  return {
    passed: tests.filter((test) => test.ok).length,
    failed: tests.filter((test) => !test.ok).length,
    tests,
    output: truncate(run.output, request.outputMaxCharacters),
    durationMs: run.durationMs,
    timedOut: run.timedOut,
    network: networkClosedByPermissions() ? 'closed' : 'open',
    nodeVersion: process.versions.node,
  };
}
