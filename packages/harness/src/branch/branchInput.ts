// Ветка наследует настройки исходной сессии: effort шага, кто ищет в базе, субагенты,
// демо-проект. Иначе разница в ответе была бы не от правки, а от других настроек.

import type { HarnessEvent } from '../events/harnessEvents.js';
import type { SessionInput } from '../session/startSession.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { prepareBranchPoint, type BranchEdit } from './branchPoint.js';

export interface BranchRequest {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  sourceTracePath: string;
  sourceEvents: HarnessEvent[];
  step: number;
  edit: BranchEdit;
  workspaceDirectory: string | null;
}

export function branchSessionInput(request: BranchRequest): SessionInput {
  const { sourceEvents } = request;
  const started = sourceEvents.find((event) => event.type === 'session_started');
  if (started?.type !== 'session_started') {
    throw new Error('В трейсе нет session_started — это не запись сессии агента');
  }
  if ((started.orchestration ?? null) !== null) {
    throw new Error(
      'Ветка от сессии с оркестрацией пока не поддерживается: у исполнителей свои истории',
    );
  }
  const point = prepareBranchPoint(sourceEvents, request.step, request.edit);
  return {
    loadedSettings: request.loadedSettings,
    projectRoot: request.projectRoot,
    question: point.step.question,
    reasoningEffort: point.step.reasoningEffort,
    searchProvider: null,
    retrievalMode: started.retrievalMode,
    retrievalToolName: null,
    freshWorkspace: false,
    subagents: (started.subagents ?? null) !== null,
    orchestration: null,
    demoProject: started.demoProject ?? true,
    workspaceDirectory: request.workspaceDirectory,
    workspaceSeedDirectory: blankSourceDirectory(sourceEvents, request.loadedSettings),
    branch: {
      sourceTracePath: request.sourceTracePath,
      sourceSessionId: sourceEvents[0]?.sessionId ?? null,
      step: point.step.step,
      iteration: point.step.iteration,
      question: point.step.question,
      messages: point.messages,
      change: point.change,
    },
  };
}

// Ветка сессии без демо-проекта начинает с копии папки исходной сессии — с тем, что агент там
// уже написал, — а сама папка исходной сессии не меняется. Это состояние на конец исходной
// сессии, а не на шаг ветвления: снимков песочницы по шагам харнесс не делает.
// Старые трейсы писались в общую workspace-blank/ — их папку не берём, ветка начнёт с пустой.
export function blankSourceDirectory(
  sourceEvents: HarnessEvent[],
  loadedSettings: LoadedSettings,
): string | null {
  const prepared = sourceEvents.find((event) => event.type === 'workspace_prepared');
  const { blankDirectory } = loadedSettings.settings.workspace;
  if (prepared?.type !== 'workspace_prepared') {
    return null;
  }
  return prepared.directory.startsWith(`${blankDirectory}/`) ? prepared.directory : null;
}
