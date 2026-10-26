// Лаборатория «Выбор токена» (этап 11): один вопрос — несколько запросов к модели с вероятностями
// токенов (logprobs, top 20) при разной температуре. Без тулов, без базы знаний, без истории:
// только вопрос и короткий system prompt, — чтобы смотреть на сам выбор токенов.
//
// Проба 26.10.2026 показала: DeepSeek отдаёт вероятности уже после температуры — при T = 0
// у выбранного токена 100 %, при 1.5 распределение сплющено. Поэтому лаборатория спрашивает
// при T = 1 (как посчитала модель), 0 и 1.5 и показывает настоящие распределения рядом.
// Прогон — обычный трейс: открывается плеером, запросы видны в «Сырых событиях».

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

// Путь к трейсу от корня проекта.
export async function runTokenLab(request: TokenLabRequest): Promise<string> {
  const { settings, modelApiKey } = request.loadedSettings;
  const recording = await startSessionRecording({
    projectRoot: request.projectRoot,
    tracesDirectory: settings.traces.directory,
    listeners: request.listeners ?? [],
  });
  const { events } = recording;
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (info) => events.emit({ type: 'network_request', ...info }),
  });
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
    tokenLab: { topLogprobs: TOKEN_LAB_TOP_LOGPROBS, temperatures: TOKEN_LAB_TEMPERATURES },
  });
  events.emit({ type: 'user_message', text: request.question });
  const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey, network.fetch);
  const dependencies = { provider, events, prices: settings.prices };
  try {
    let answer: string | null = null;
    for (const temperature of TOKEN_LAB_TEMPERATURES) {
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
        },
        dependencies,
        { purpose: 'tokenLab', iteration: null },
      );
      answer ??= reply.text;
    }
    events.emit({ type: 'assistant_message', text: answer ?? '' });
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
  return recording.finish();
}
