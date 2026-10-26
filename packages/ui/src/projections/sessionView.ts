// Вид сессии — то, что экраны показывают, собранное из событий проекцией projectSession.
// Своего состояния у интерфейса нет: вид всегда можно построить заново из событий,
// в том числе из первых N — так повтор сессии показывает её на любом шаге.

import type {
  RetrievalMode,
  TokenUsage,
  ToolCostTotal,
  ToolResultStatus,
} from '@harness-visualization/harness';
import type { CacheWarmth } from '@harness-visualization/harness/tokenomics';
import type { EventOfType } from '../events/eventTypes';

export interface SessionView {
  sessionId: string | null;
  // session — сессия агента; groundingCheck — проверка опоры ответа судьёй.
  kind: 'session' | 'groundingCheck' | 'unknown';
  question: string | null;
  model: string | null;
  retrievalMode: RetrievalMode | null;
  // inProgress — событий конца ещё нет: сессия идёт, трейс оборван или повтор остановлен раньше.
  status: 'inProgress' | 'finished' | 'failed';
  // Шаги цикла агента: запрос к модели и тулы, которые она попросила.
  steps: AgentStep[];
  // Все запросы к модели, включая служебные (queryRewrite, groundingJudge), по порядку.
  modelCalls: ModelCall[];
  toolCalls: ToolCallView[];
  retrieval: RetrievalView;
  answer: string | null;
  errors: string[];
  totals: SessionTotals;
}

export interface ModelCall {
  // Чей запрос: null — главного агента, иначе id субагента (этап 6c).
  agentId: string | null;
  requestId: string;
  purpose: EventOfType<'model_request'>['purpose'];
  // Номер шага агента; null — служебный запрос харнесса вне цикла агента.
  iteration: number | null;
  request: EventOfType<'model_request'>;
  response: EventOfType<'model_response'> | null;
  error: EventOfType<'model_error'> | null;
  // Каких тулов модель попросила в этом ответе.
  toolCallIds: string[];
  // null — ответа ещё нет.
  cache: CacheView | null;
}

// Сколько prompt пришло из кэша провайдера и чем это можно объяснить.
export interface CacheView {
  hitTokens: number;
  missTokens: number;
  // Доля prompt из кэша, 0–1.
  share: number;
  // По тому же порогу, что у харнесса (classifyCacheWarmth).
  warmth: CacheWarmth;
  // Из кэша пришло больше, чем весь prompt предыдущего шага агента, — значит, кэш прогрел
  // не только этот шаг: такое же начало prompt недавно отправлял кто-то ещё.
  // null — сравнивать не с чем (первый шаг или служебный запрос).
  exceedsPreviousPrompt: boolean | null;
  // Весь prompt предыдущего шага агента (input tokens); null — как выше.
  previousStepInputTokens: number | null;
}

export interface AgentStep {
  iteration: number;
  call: ModelCall;
  toolCalls: ToolCallView[];
  // pending — ответа модели ещё нет; toolCalls — модель попросила тулы; answer — ответила текстом.
  outcome: 'pending' | 'toolCalls' | 'answer' | 'error';
}

export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  call: EventOfType<'tool_call'>;
  // Цепочка разрешения: решение политики, вопрос пользователю и ответ на него.
  evaluation: EventOfType<'permission_evaluated'> | null;
  question: EventOfType<'permission_requested'> | null;
  answer: EventOfType<'permission_resolved'> | null;
  result: EventOfType<'tool_result'> | null;
  // Харнесс обрезал результат, прежде чем отдать модели (этап 6.3); null — не обрезал.
  truncation: EventOfType<'tool_result_truncated'> | null;
  // pending — решение ещё не принято или тул выполняется; waitingForUser — ждёт ответа на вопрос.
  status: 'pending' | 'waitingForUser' | ToolResultStatus;
}

export interface RetrievalView {
  // Запрос, который модель сформулировала по просьбе харнесса (retrieval rewrite).
  rewrite: EventOfType<'query_rewritten'> | null;
  // Что харнесс нашёл и подмешал в контекст до первого запроса (auto, rewrite).
  retrieved: EventOfType<'context_retrieved'> | null;
}

export interface SessionTotals {
  modelRequests: number;
  // Сумма usage ответов модели, полученных к этому месту.
  usage: TokenUsage;
  // Стоимость запросов к модели по валютам; валюты не складываем.
  modelCosts: MoneyTotal[];
  // Запросы, для которых цена неизвестна: тогда сумма стоимости неполная.
  unpricedModelRequests: number;
  toolCosts: ToolCostTotal[];
  // От первого события до последнего (или до session_finished).
  durationMs: number;
  // Сколько из этого шла работа — без простоя между ответом и новым вопросом (workTime.ts).
  workMs: number;
}

export interface MoneyTotal {
  currency: string;
  total: number;
}
