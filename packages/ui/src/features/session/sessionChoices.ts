// Выбор в форме новой сессии: что включить, кто ищет в базе знаний, effort. Начинается со значений
// из harness.config.json (GET /api/session-options); что человек выбрал — запоминаем в браузере
// и в следующий раз начинаем с этого. Clean Workspace не запоминаем: он стирает рабочую папку.

import type { SessionOptionsResponse, StartSessionRequest } from '@harness-visualization/server';
import { useCallback, useEffect, useState } from 'react';
import { getSessionOptions } from '../../api/serverApi';

export type RetrievalChoice = NonNullable<StartSessionRequest['retrievalMode']>;
export type EffortChoice = NonNullable<StartSessionRequest['reasoningEffort']>;

export interface SessionChoices {
  subagents: boolean;
  cleanWorkspace: boolean;
  retrievalMode: RetrievalChoice;
  reasoningEffort: EffortChoice;
}

type Saved = Partial<Pick<SessionChoices, 'subagents' | 'retrievalMode' | 'reasoningEffort'>>;

const STORAGE_KEY = 'hv-session-choices';

const FALLBACK: SessionChoices = {
  subagents: false,
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
  return {
    question,
    retrievalMode: choices.retrievalMode,
    reasoningEffort: choices.reasoningEffort,
    subagents: choices.subagents,
    ...(choices.cleanWorkspace ? { freshWorkspace: true } : {}),
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

function save({ subagents, retrievalMode, reasoningEffort }: SessionChoices): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ subagents, retrievalMode, reasoningEffort }),
    );
  } catch {
    // Не запомнили — в следующий раз начнём со значений из настроек.
  }
}
