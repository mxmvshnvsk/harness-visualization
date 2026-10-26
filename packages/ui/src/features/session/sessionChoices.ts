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
}

type Saved = Partial<Omit<SessionChoices, 'cleanWorkspace'>>;

const STORAGE_KEY = 'hv-session-choices';

const FALLBACK: SessionChoices = {
  demoProject: true,
  subagents: false,
  orchestration: false,
  orchestrationMode: 'superagent',
  cleanWorkspace: false,
  retrievalMode: 'tool',
  reasoningEffort: 'high',
};

export interface ChoicesState {
  choices: SessionChoices;
  // null — настройки сервера ещё не пришли.
  options: SessionOptionsResponse | null;
  change: (patch: Partial<SessionChoices>) => void;
}

export function useSessionChoices(): ChoicesState {
  const [options, setOptions] = useState<SessionOptionsResponse | null>(null);
  const [choices, setChoices] = useState<SessionChoices>(() => ({ ...FALLBACK, ...readSaved() }));
  useEffect(() => {
    let cancelled = false;
    getSessionOptions()
      .then((loaded) => {
        if (!cancelled) {
          setOptions(loaded);
          setChoices((current) => ({ ...current, ...defaultsOf(loaded), ...readSaved() }));
        }
      })
      .catch(() => {
        // Без настроек сервера форма работает со своими значениями — сервер всё равно проверит.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const change = useCallback((patch: Partial<SessionChoices>) => {
    setChoices((current) => {
      const next = { ...current, ...patch };
      save(next);
      return next;
    });
  }, []);
  return { choices, options, change };
}

export function toStartRequest(question: string, choices: SessionChoices): StartSessionRequest {
  const clean = choices.cleanWorkspace ? { freshWorkspace: true } : {};
  // Без демо-проекта ни поиска в базе, ни субагентов — харнесс их и не включит.
  if (!choices.demoProject) {
    return { question, reasoningEffort: choices.reasoningEffort, demoProject: false, ...clean };
  }
  // В оркестрации поручения даёт код или оркестратор, а ищут исполнители — режим поиска
  // и субагенты модели не нужны.
  if (choices.orchestration) {
    return {
      question,
      reasoningEffort: choices.reasoningEffort,
      orchestration: choices.orchestrationMode,
      ...clean,
    };
  }
  return {
    question,
    retrievalMode: choices.retrievalMode,
    reasoningEffort: choices.reasoningEffort,
    subagents: choices.subagents,
    ...clean,
  };
}

function defaultsOf(options: SessionOptionsResponse): Partial<SessionChoices> {
  return {
    subagents: options.subagents.enabledByDefault && options.subagents.agents.length > 0,
    ...(options.retrievalMode === undefined ? {} : { retrievalMode: options.retrievalMode }),
    ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
  };
}

// Хранилище браузера может быть недоступно (приватный режим) — тогда просто не запоминаем.
function readSaved(): Saved {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return text === null ? {} : (JSON.parse(text) as Saved);
  } catch {
    return {};
  }
}

function save(choices: SessionChoices): void {
  // Clean Workspace не запоминаем: он стирает рабочую папку.
  const saved: Saved = {
    demoProject: choices.demoProject,
    subagents: choices.subagents,
    orchestration: choices.orchestration,
    orchestrationMode: choices.orchestrationMode,
    retrievalMode: choices.retrievalMode,
    reasoningEffort: choices.reasoningEffort,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Не запомнили — в следующий раз начнём со значений из настроек.
  }
}
