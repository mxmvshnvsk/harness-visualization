// Лаборатория «Выбор токена» (этап 11): один вопрос — несколько запросов к модели с вероятностями
// токенов (logprobs, top 20) при разной температуре. Без тулов, без базы знаний, без истории:
// только вопрос и короткий system prompt, — чтобы смотреть на сам выбор токенов.
//
// Проба 26.10.2026 показала: DeepSeek отдаёт вероятности уже после температуры — при T = 0
// у выбранного токена 100 %, при 1.5 распределение сплющено. Поэтому лаборатория спрашивает
// при T = 1 (как посчитала модель), 0 и 1.5 и показывает настоящие распределения рядом.
// Развилка (11.3) — тот же вопрос, но модель продолжает начало ответа, в котором один токен
// заменён другим (prefix completion DeepSeek, бета).
// Прогон — обычный трейс: открывается плеером, запросы видны в «Сырых событиях».

import type { HarnessEvent, TokenLabFork } from '../events/harnessEvents.js';
import type { EventStream } from '../events/EventStream.js';
import type { ReasoningEffort } from '../model/chatTypes.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { requestModel } from '../agent/requestModel.js';
import type { EventListener } from '../events/EventStream.js';
import { NetworkRouter } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import { startSessionRecording } from '../session/sessionRecording.js';

export const TOKEN_LAB_TEMPERATURES = [1, 0, 1.5];
export const TOKEN_LAB_TOP_LOGPROBS = 20;

const SYSTEM_PROMPT = 'Отвечай на языке пользователя, кратко: одним-двумя предложениями.';

export interface TokenLabRequest {
  projectRoot: string;
  loadedSettings: LoadedSettings;
  question: string;
  reasoningEffort: ReasoningEffort;
  listeners?: EventListener[];
}

interface LabCall {
  temperatures: number[];
  fork?: TokenLabFork;
}

// Путь к трейсу от корня проекта.
export function runTokenLab(request: TokenLabRequest): Promise<string> {
  return runLab(request, { temperatures: TOKEN_LAB_TEMPERATURES });
}

// Развилка: ответ прогона при T = 1, токен position заменён на token, — модель продолжает.
export function runTokenFork(
  request: Omit<TokenLabRequest, 'question' | 'reasoningEffort'> & {
    sourceFile: string;
    sourceEvents: readonly HarnessEvent[];
    position: number;
    token: string;
  },
): Promise<string> {
  const source = forkSource(request.sourceEvents, request.position);
  return runLab(
    { ...request, question: source.question, reasoningEffort: source.reasoningEffort },
    {
      temperatures: [1],
      fork: {
        sourceFile: request.sourceFile,
        position: request.position,
        original: source.original,
        token: request.token,
        prefix: `${source.before}${request.token}`,
      },
    },
  );
}

// Вопрос, effort и ответ при T = 1 из трейса прогона: что было до токена position.
export function forkSource(
  events: readonly HarnessEvent[],
  position: number,
): { question: string; reasoningEffort: ReasoningEffort; before: string; original: string } {
  const started = events.find((event) => event.type === 'session_started');
  const question = events.find((event) => event.type === 'user_message');
  const temperatures = new Map(
    events.flatMap((event) =>
      event.type === 'model_request' ? [[event.requestId, event.body.temperature]] : [],
    ),
  );
  const base = events.find(
    (event) => event.type === 'model_response' && temperatures.get(event.requestId) === 1,
  );
  const tokens = base?.type === 'model_response' ? (base.reply.logprobs?.content ?? []) : [];
  const original = tokens[position];
  if (
    started?.type !== 'session_started' ||
    question?.type !== 'user_message' ||
    original === undefined
  ) {
    throw new Error('В трейсе нет ответа при T = 1 с этим токеном — ветвиться не от чего');
  }
  return {
    question: question.text,
    reasoningEffort: started.reasoningEffort,
    before: tokens
      .slice(0, position)
      .map((token) => token.token)
      .join(''),
    original: original.token,
  };
}

async function runLab(request: TokenLabRequest, call: LabCall): Promise<string> {
  const { settings } = request.loadedSettings;
  const recording = await startSessionRecording({
    projectRoot: request.projectRoot,
    tracesDirectory: settings.traces.directory,
    listeners: request.listeners ?? [],
  });
  const { events } = recording;
  events.emit({
    type: 'session_started',
    providerName: settings.model.providerName,
    baseUrl: settings.model.baseUrl,
    model: settings.model.model,
    reasoningEffort: request.reasoningEffort,
    networkProxy: null,
    searchProvider: null,
    retrievalMode: 'tool',
    subagents: null,
    orchestration: null,
    demoProject: false,
    tokenLab: { topLogprobs: TOKEN_LAB_TOP_LOGPROBS, ...call },
  });
  events.emit({ type: 'user_message', text: request.question });
  try {
    const answer = await askAll(request, call, events);
    events.emit({ type: 'assistant_message', text: answer });
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
  return recording.finish();
}

// Запросы по температурам; ответ сессии — первый. У развилки ответ — начало вместе с продолжением.
async function askAll(
  request: TokenLabRequest,
  call: LabCall,
  events: EventStream,
): Promise<string> {
  const { settings, modelApiKey } = request.loadedSettings;
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (info) => events.emit({ type: 'network_request', ...info }),
  });
  const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey, network.fetch);
  const dependencies = { provider, events, prices: settings.prices };
  let answer: string | null = null;
  for (const temperature of call.temperatures) {
    const { reply } = await requestModel(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: request.question },
        ],
        tools: [],
        reasoningEffort: request.reasoningEffort,
        topLogprobs: TOKEN_LAB_TOP_LOGPROBS,
        temperature,
        ...(call.fork === undefined ? {} : { assistantPrefix: call.fork.prefix }),
      },
      dependencies,
      { purpose: 'tokenLab', iteration: null },
    );
    answer ??= `${call.fork?.prefix ?? ''}${reply.text ?? ''}`;
  }
  return answer ?? '';
}
