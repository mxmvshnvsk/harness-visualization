// Вход сессии для прогона арены (этап 10): общий для pnpm arena и сервера.

import type { ReasoningEffort } from '../model/chatTypes.js';
import type { SessionInput } from '../session/startSession.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import type { ArenaSessionInput } from './arenaSession.js';

export interface ArenaSessionRequest {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  arena: ArenaSessionInput;
  reasoningEffort: ReasoningEffort;
  // Первый вопрос; у задачи «Кедр Софт» по умолчанию — текст TASK.md.
  question: string | null;
}

export function arenaSessionInput(request: ArenaSessionRequest): SessionInput {
  const question = request.question ?? request.arena.task?.text ?? null;
  if (question === null || question.trim() === '') {
    throw new Error('Задача пустая: опишите, что сделать');
  }
  return {
    loadedSettings: request.loadedSettings,
    projectRoot: request.projectRoot,
    question,
    reasoningEffort: request.reasoningEffort,
    searchProvider: null,
    retrievalMode: 'tool',
    retrievalToolName: null,
    freshWorkspace: false,
    subagents: false,
    orchestration: null,
    demoProject: false,
    workspaceDirectory: null,
    arena: request.arena,
  };
}
