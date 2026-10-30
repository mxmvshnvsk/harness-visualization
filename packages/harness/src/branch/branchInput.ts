// Ветка наследует настройки исходной сессии: effort шага, кто ищет в базе, субагенты,
// демо-проект. Иначе разница в ответе была бы не от правки, а от других настроек.

import type { HarnessEvent } from '../events/harnessEvents.js';
import type { SessionInput } from '../session/startSession.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { branchSourceModel, sameBranchModel } from './branchModel.js';
import { adaptBranchHistory, validateBranchHistory } from './branchHistory.js';
import { branchHistoryActors } from './branchHistoryActors.js';
import type { BranchStart } from './runBranchTurn.js';
import type { ModelSettings } from '../settings/settingsSchema.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import { prepareBranchPoint, type BranchEdit } from './branchPoint.js';

export interface BranchRequest {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  sourceTracePath: string;
  sourceEvents: HarnessEvent[];
  step: number;
  edit: BranchEdit;
  workspaceDirectory: string | null;
  reasoningEffort?: ReasoningEffort;
}

export function branchSessionInput(request: BranchRequest): SessionInput {
  const { sourceEvents } = request;
  const started = sourceSessionStarted(sourceEvents);
  const { branch, reasoningEffort } = prepareBranchStart(request);
  return {
    loadedSettings: request.loadedSettings,
    projectRoot: request.projectRoot,
    question: branch.question,
    reasoningEffort,
    searchProvider: null,
    // Нет поля — сессия с оркестрацией: режим поиска там не действует.
    retrievalMode: started.retrievalMode ?? 'tool',
    retrievalToolName: null,
    freshWorkspace: false,
    subagents: (started.subagents ?? null) !== null,
    orchestration: null,
    demoProject: started.demoProject ?? true,
    workspaceDirectory: request.workspaceDirectory,
    workspaceSeedDirectory: blankSourceDirectory(sourceEvents, request.loadedSettings),
    branch,
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

function sourceSessionStarted(sourceEvents: HarnessEvent[]) {
  const started = sourceEvents.find((event) => event.type === 'session_started');
  if (started === undefined) {
    throw new Error('В трейсе нет session_started — это не запись сессии агента');
  }
  if ((started.orchestration ?? null) !== null) {
    throw new Error(
      'Ветка от сессии с оркестрацией пока не поддерживается: у исполнителей свои истории',
    );
  }
  return started;
}

function prepareBranchStart(request: BranchRequest): {
  branch: BranchStart;
  reasoningEffort: ReasoningEffort;
} {
  const point = prepareBranchPoint(request.sourceEvents, request.step, request.edit);
  const sourceModel = branchSourceModel(request.sourceEvents, request.step);
  const targetModel = request.loadedSettings.settings.model;
  const switched = !sameBranchModel(sourceModel, targetModel);
  const messages = adaptBranchHistory(point.messages, switched);
  const reasoningEffort = request.reasoningEffort ?? point.step.reasoningEffort;
  validateBranchHistory(messages, reasoningEffort !== 'off', requiredHistoryReasoning(targetModel));
  const historyEvents = eventsBeforeRequest(request.sourceEvents, point.step.requestId);
  return {
    reasoningEffort,
    branch: {
      sourceTracePath: request.sourceTracePath,
      sourceSessionId: request.sourceEvents[0]?.sessionId ?? null,
      step: point.step.step,
      iteration: point.step.iteration,
      question: point.step.question,
      messages,
      sourceModel,
      targetModel: {
        model: targetModel.model,
        baseUrl: targetModel.baseUrl,
        providerName: targetModel.providerName,
      },
      historyAdapted: switched,
      historyActors: branchHistoryActors(historyEvents, point.messages),
      change: point.change,
    },
  };
}

function requiredHistoryReasoning(model: ModelSettings): ModelSettings['reasoningStyle'] {
  if (model.reasoningStyle === 'openrouter' && !model.model.includes('claude')) {
    return 'none';
  }
  return model.reasoningStyle;
}

function eventsBeforeRequest(events: HarnessEvent[], requestId: string): HarnessEvent[] {
  const requestIndex = events.findIndex(
    (event) => event.type === 'model_request' && event.requestId === requestId,
  );
  return events.slice(0, requestIndex);
}
