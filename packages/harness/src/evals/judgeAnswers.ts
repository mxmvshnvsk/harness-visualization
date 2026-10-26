// Судья evals (model-based grader): модель читает вопрос, рубрику и ответ агента и решает,
// выполнена ли рубрика. Устроен как судья check-grounding (этап 5b.3): отдельная запись со
// своим трейсом, запросы без тулов и без reasoning. Один трейс на весь прогон evals — в нём
// все вердикты по порядку.
//
// Судья — тоже модель: недетерминирован и судит только по тому, что ему показали (урок 13).
// Ему показывают ответ, но не документы: «выдумал ли агент» он проверить не может —
// это работа check-grounding.

import { z } from 'zod';
import { requestModel, type ModelRequestDependencies } from '../agent/requestModel.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { NetworkRouter } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import { startSessionRecording, type SessionRecording } from '../session/sessionRecording.js';
import type { LoadedSettings } from '../settings/loadSettings.js';

const JUDGE_INSTRUCTIONS = [
  'Ты — судья, проверяющий ответ ИИ-ассистента сотрудникам компании.',
  'Тебе дают вопрос пользователя, рубрику и ответ ассистента.',
  'Реши только по рубрике и тексту ответа, без своих знаний о компании:',
  '- pass — ответ выполняет рубрику;',
  '- fail — не выполняет.',
  'Ответь одним JSON-объектом без пояснений вокруг:',
  '{"verdict": "pass" | "fail", "explanation": "одно предложение по-русски"}',
].join('\n');

const answerSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  explanation: z.string(),
});

export interface JudgeVerdict {
  // null — судья ответил не по формату.
  passed: boolean | null;
  explanation: string;
}

export interface EvalJudge {
  judge: (question: string, rubric: string, answer: string) => Promise<JudgeVerdict>;
  finish: () => Promise<string>;
}

export async function startEvalJudge(
  loadedSettings: LoadedSettings,
  projectRoot: string,
): Promise<EvalJudge> {
  const { settings, modelApiKey } = loadedSettings;
  const recording: SessionRecording = await startSessionRecording({
    projectRoot,
    tracesDirectory: settings.traces.directory,
    listeners: [],
  });
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (request) => recording.events.emit({ type: 'network_request', ...request }),
  });
  const dependencies: ModelRequestDependencies = {
    provider: new OpenAiCompatibleProvider(settings.model, modelApiKey, network.fetch),
    events: recording.events,
    prices: settings.prices,
  };
  return {
    judge: (question, rubric, answer) => judgeOnce(dependencies, question, rubric, answer),
    finish: async () => {
      await network.close();
      return recording.finish();
    },
  };
}

async function judgeOnce(
  dependencies: ModelRequestDependencies,
  question: string,
  rubric: string,
  answer: string,
): Promise<JudgeVerdict> {
  const task = [`Вопрос: ${question}`, '', `Рубрика: ${rubric}`, '', 'Ответ ассистента:', answer];
  const { reply } = await requestModel(
    {
      messages: [
        { role: 'system', content: JUDGE_INSTRUCTIONS },
        { role: 'user', content: task.join('\n') },
      ],
      tools: [],
      reasoningEffort: 'off',
    },
    dependencies,
    { purpose: 'evalJudge', iteration: null },
  );
  return parseVerdict(reply.text ?? '');
}

// Модель иногда оборачивает JSON в ```json … ``` — берём текст от первой { до последней }.
function parseVerdict(text: string): JudgeVerdict {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    const parsed = answerSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (parsed.success) {
      return { passed: parsed.data.verdict === 'pass', explanation: parsed.data.explanation };
    }
  } catch {
    // Разбор не удался — ниже вернём вердикт без решения с текстом ответа.
  }
  return { passed: null, explanation: `ответ не по формату: ${text.trim()}` };
}
