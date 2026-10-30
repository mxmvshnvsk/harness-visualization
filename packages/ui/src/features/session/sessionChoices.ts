// Выбор в форме новой сессии: что включить, кто ищет в базе знаний, effort. Начинается со значений
// из harness.config.json (GET /api/session-options); что человек выбрал — запоминаем в браузере
// и в следующий раз начинаем с этого. Clean Workspace не запоминаем: он стирает рабочую папку.

import type { SessionOptionsResponse, StartSessionRequest } from '@harness-visualization/server';
import { useCallback, useEffect, useState } from 'react';
import { getSessionOptions } from '../../api/serverApi';

export type RetrievalChoice = NonNullable<StartSessionRequest['retrievalMode']>;
export type EffortChoice = NonNullable<StartSessionRequest['reasoningEffort']>;
export type OrchestrationChoice = NonNullable<StartSessionRequest['orchestration']>;

export interface SessionChoices {
  // false — агент без демо-проекта «Кедр Софт».
  demoProject: boolean;
  subagents: boolean;
  // Оркестрация (этап 6d): включена ли и какой режим — режим помним, даже когда выключена.
  orchestration: boolean;
  orchestrationMode: OrchestrationChoice;
  cleanWorkspace: boolean;
  retrievalMode: RetrievalChoice;
  reasoningEffort: EffortChoice;
  modelKey: string;
  roleModels?: NonNullable<StartSessionRequest['roleModels']>;
}

export type SavedSessionChoices = Partial<Omit<SessionChoices, 'cleanWorkspace'>>;

const STORAGE_KEY = 'hv-session-choices';

const FALLBACK: SessionChoices = {
  demoProject: true,
  subagents: false,
  orchestration: false,
  orchestrationMode: 'superagent',
  cleanWorkspace: false,
  retrievalMode: 'tool',
  reasoningEffort: 'high',
  modelKey: 'default',
};

export interface ChoicesState {
  choices: SessionChoices;
  // null — настройки сервера ещё не пришли.
  options: SessionOptionsResponse | null;
  change: (patch: Partial<SessionChoices>) => void;
  modelNotice: string | null;
}

export function selectedSessionModel(
  state: Pick<ChoicesState, 'choices' | 'options'>,
): SessionOptionsResponse['models'][number] | undefined {
  const key = state.choices.modelKey;
  return state.options?.models.find((model) => model.key === key);
}

export function useSessionChoices(): ChoicesState {
  const [options, setOptions] = useState<SessionOptionsResponse | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<SessionChoices>(() => ({
    ...FALLBACK,
    ...readSavedChoices(),
  }));
  useEffect(() => {
    let cancelled = false;
    getSessionOptions()
      .then((loaded) => {
        if (!cancelled) {
          setOptions(loaded);
          const saved = readSavedChoices();
          const unavailable = loaded.models.find((model) => model.key === saved.modelKey);
          if (
            saved.modelKey !== undefined &&
            (unavailable === undefined || !unavailable.available)
          ) {
            setModelNotice(
              'Сохранённая модель больше недоступна. Восстановлена модель по умолчанию; проверьте выбор.',
            );
          }
          setChoices((current) =>
            normalizeModelChoice(restoreSessionChoices(current, loaded, saved), loaded),
          );
        }
      })
      .catch(() => {
        // Без настроек сервера форма работает со своими значениями — сервер всё равно проверит.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const change = useCallback(
    (patch: Partial<SessionChoices>) => {
      if (patch.modelKey !== undefined) {
        setModelNotice(null);
      }
      setChoices((current) => {
        const updated = { ...current, ...patch };
        const next = options === null ? updated : normalizeModelChoice(updated, options);
        saveSessionChoices(next);
        return next;
      });
    },
    [options],
  );
  return { choices, options, change, modelNotice };
}

export function normalizeModelChoice(
  choices: SessionChoices,
  options: SessionOptionsResponse,
): SessionChoices {
  const selected = options.models.find(
    (model) => model.key === choices.modelKey && model.available,
  );
  const model = selected ?? options.models.find((entry) => entry.key === options.defaultModelKey);
  if (model === undefined) {
    return { ...choices, modelKey: options.defaultModelKey };
  }
  const reasoningEffort =
    model.reasoningEfforts.length === 0 || model.reasoningEfforts.includes(choices.reasoningEffort)
      ? choices.reasoningEffort
      : model.defaultReasoningEffort;
  return { ...choices, modelKey: model.key, reasoningEffort };
}

export function toStartRequest(question: string, choices: SessionChoices): StartSessionRequest {
  const clean = choices.cleanWorkspace ? { freshWorkspace: true } : {};
  const selectedModel = choices.modelKey === 'default' ? {} : { modelKey: choices.modelKey };
  // Без демо-проекта ни поиска в базе, ни субагентов — харнесс их и не включит.
  if (!choices.demoProject) {
    return {
      question,
      reasoningEffort: choices.reasoningEffort,
      demoProject: false,
      ...selectedModel,
      ...clean,
    };
  }
  // В оркестрации поручения даёт код или оркестратор, а ищут исполнители — режим поиска
  // и субагенты модели не нужны.
  if (choices.orchestration) {
    return {
      question,
      reasoningEffort: choices.reasoningEffort,
      orchestration: choices.orchestrationMode,
      ...selectedModel,
      ...(choices.roleModels === undefined ? {} : { roleModels: choices.roleModels }),
      ...clean,
    };
  }
  return {
    question,
    retrievalMode: choices.retrievalMode,
    reasoningEffort: choices.reasoningEffort,
    subagents: choices.subagents,
    ...subagentModelRequest(choices),
    ...selectedModel,
    ...clean,
  };
}

function subagentModelRequest(choices: SessionChoices): Pick<StartSessionRequest, 'roleModels'> {
  if (!choices.subagents || choices.roleModels?.subagents === undefined) {
    return {};
  }
  return { roleModels: { subagents: choices.roleModels.subagents } };
}

export function restoreSessionChoices(
  current: SessionChoices,
  options: SessionOptionsResponse,
  saved: SavedSessionChoices,
): SessionChoices {
  const defaults = options.roleModels;
  const subagents = Object.fromEntries(
    options.subagents.agents.map((name) => [
      name,
      saved.roleModels?.subagents?.[name] === undefined
        ? (defaults?.subagents[name]?.modelKey ?? null)
        : saved.roleModels.subagents[name],
    ]),
  );
  const orchestrator =
    saved.roleModels?.orchestrator === undefined
      ? (defaults?.orchestrator ?? null)
      : saved.roleModels.orchestrator;
  return { ...current, ...defaultsOf(options), ...saved, roleModels: { orchestrator, subagents } };
}

function defaultsOf(options: SessionOptionsResponse): Partial<SessionChoices> {
  return {
    subagents: options.subagents.enabledByDefault && options.subagents.agents.length > 0,
    ...(options.retrievalMode === undefined ? {} : { retrievalMode: options.retrievalMode }),
    ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
  };
}

// Хранилище браузера может быть недоступно (приватный режим) — тогда просто не запоминаем.
export function readSavedChoices(): SavedSessionChoices {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = text === null ? {} : JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSessionChoices(choices: SessionChoices): void {
  // Clean Workspace не запоминаем: он стирает рабочую папку.
  const saved: SavedSessionChoices = {
    demoProject: choices.demoProject,
    subagents: choices.subagents,
    orchestration: choices.orchestration,
    orchestrationMode: choices.orchestrationMode,
    retrievalMode: choices.retrievalMode,
    reasoningEffort: choices.reasoningEffort,
    modelKey: choices.modelKey,
    roleModels: choices.roleModels,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Не запомнили — в следующий раз начнём со значений из настроек.
  }
}
