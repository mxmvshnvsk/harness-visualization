// Точка входа CLI: pnpm chat "вопрос".

import { loadSettings } from '../settings/loadSettings.js';
import { askQuestion } from './askQuestion.js';
import { parseCliArguments } from './parseCliArguments.js';
import { runCliSession } from './runCliSession.js';

async function main(): Promise<void> {
  const cliOptions = parseCliArguments(process.argv.slice(2));
  // Команда запускается из корня репозитория, там лежат harness.config.json и .env.
  const projectRoot = process.cwd();
  const loadedSettings = await loadSettings(projectRoot);
  const question = cliOptions.question ?? (await askQuestion());
  if (question === '') {
    console.log('Пустой запрос — нечего отправлять модели.');
    return;
  }
  const result = await runCliSession({
    loadedSettings,
    projectRoot,
    question,
    reasoningEffort:
      cliOptions.reasoningEffort ?? loadedSettings.settings.model.defaultReasoningEffort,
    searchProvider: cliOptions.searchProvider,
    retrievalMode: cliOptions.retrievalMode ?? loadedSettings.settings.retrieval.mode,
    retrievalToolName: cliOptions.retrievalToolName,
    freshWorkspace: cliOptions.freshWorkspace,
    subagents: cliOptions.subagents,
    orchestration: cliOptions.orchestration,
    demoProject: cliOptions.demoProject,
    workspaceDirectory: null,
    verbose: cliOptions.verbose,
    quiet: false,
  });
  if (result.failed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
