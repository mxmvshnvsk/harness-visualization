// Точка входа pnpm logprobs-probe (этап 11): что DeepSeek на самом деле отдаёт о вероятностях
// токенов. Документация описывает logprobs, top_logprobs (до 20) и даже logprobs рассуждения,
// а про режим рассуждений говорит только, что temperature там «не вызывает ошибки, но и не
// действует». Проба отвечает на вопросы, от которых зависит лаборатория «Выбор токена»:
//   1. есть ли logprobs ответа без рассуждений (effort off) и сколько альтернатив;
//   2. есть ли logprobs ответа и рассуждения в режиме рассуждений (effort high);
//   3. приходят ли logprobs в потоке и без него одинаково;
//   4. действует ли temperature без рассуждений: при 0 ответы одинаковые, при 1.5 — разные.
// Семь коротких запросов. Ключ — из .env, как у обычной сессии; в вывод и файл не попадает:
// файл хранит параметры запроса и тело ответа, без заголовков.
//   pnpm logprobs-probe   → таблица в консоли и traces/logprobs-probe/<время>.json

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelReply, ModelRequest, ReasoningEffort } from '../model/chatTypes.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { NetworkRouter } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import { loadSettings } from '../settings/loadSettings.js';

const FACT =
  'Сколько календарных дней ежегодного оплачиваемого отпуска положено по Трудовому кодексу РФ? Ответь одним предложением.';
const NAME =
  'Придумай название для внутреннего портала IT-компании. Ответь одним словом, без пояснений.';

interface Probe {
  id: string;
  question: string;
  effort: ReasoningEffort;
  topLogprobs?: number;
  temperature?: number;
  // Поток наоборот, чем в настройках: logprobs в потоке собираются по кускам.
  flipStream?: boolean;
}

const PROBES: Probe[] = [
  { id: 'off-logprobs', question: FACT, effort: 'off', topLogprobs: 20 },
  {
    id: 'off-logprobs-other-stream',
    question: FACT,
    effort: 'off',
    topLogprobs: 5,
    flipStream: true,
  },
  { id: 'high-logprobs', question: FACT, effort: 'high', topLogprobs: 5 },
  { id: 'off-t0-a', question: NAME, effort: 'off', temperature: 0, topLogprobs: 5 },
  { id: 'off-t0-b', question: NAME, effort: 'off', temperature: 0, topLogprobs: 5 },
  { id: 'off-t1.5-a', question: NAME, effort: 'off', temperature: 1.5, topLogprobs: 5 },
  { id: 'off-t1.5-b', question: NAME, effort: 'off', temperature: 1.5, topLogprobs: 5 },
];

interface ProbeResult {
  probe: Probe;
  stream: boolean;
  status: number;
  durationMs: number;
  text: string | null;
  reasoningChars: number;
  contentTokens: number;
  reasoningTokens: number;
  topPerToken: number;
  error: string | null;
  body: unknown;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const { settings, modelApiKey } = await loadSettings(projectRoot);
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: () => undefined,
  });
  const results: ProbeResult[] = [];
  for (const probe of PROBES) {
    const stream = probe.flipStream === true ? !settings.model.stream : settings.model.stream;
    const provider = new OpenAiCompatibleProvider(
      { ...settings.model, stream },
      modelApiKey,
      network.fetch,
    );
    results.push(await runProbe(provider, probe, stream));
    console.log(describe(results.at(-1) as ProbeResult));
  }
  const directory = join(projectRoot, 'traces', 'logprobs-probe');
  await mkdir(directory, { recursive: true });
  const file = join(
    directory,
    `${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.json`,
  );
  const saved = { model: settings.model.model, baseUrl: settings.model.baseUrl, results };
  await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`, 'utf8');
  console.log(`\n${summarize(results)}\nСохранено: ${file}`);
}

async function runProbe(
  provider: OpenAiCompatibleProvider,
  probe: Probe,
  stream: boolean,
): Promise<ProbeResult> {
  const raw = await provider.send(provider.prepareRequest(requestOf(probe)));
  const base = { probe, stream, status: raw.status, durationMs: raw.durationMs, body: raw.body };
  try {
    return { ...base, ...summarizeReply(provider.parseReply(raw)), error: null };
  } catch (error) {
    return {
      ...base,
      ...summarizeReply(null),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requestOf(probe: Probe): ModelRequest {
  return {
    messages: [{ role: 'user', content: probe.question }],
    tools: [],
    reasoningEffort: probe.effort,
    ...(probe.topLogprobs === undefined ? {} : { topLogprobs: probe.topLogprobs }),
    ...(probe.temperature === undefined ? {} : { temperature: probe.temperature }),
  };
}

type ReplySummary = Pick<
  ProbeResult,
  'text' | 'reasoningChars' | 'contentTokens' | 'reasoningTokens' | 'topPerToken'
>;

const NO_REPLY: ReplySummary = {
  text: null,
  reasoningChars: 0,
  contentTokens: 0,
  reasoningTokens: 0,
  topPerToken: 0,
};

function summarizeReply(reply: ModelReply | null): ReplySummary {
  if (reply === null) {
    return NO_REPLY;
  }
  const content = reply.logprobs?.content ?? [];
  return {
    text: reply.text,
    reasoningChars: (reply.reasoningText ?? '').length,
    contentTokens: content.length,
    reasoningTokens: (reply.logprobs?.reasoning ?? []).length,
    topPerToken: Math.max(0, ...content.map((token) => token.top.length)),
  };
}

function describe(result: ProbeResult): string {
  const { probe } = result;
  const params = [
    `effort ${probe.effort}`,
    probe.topLogprobs === undefined ? null : `top ${String(probe.topLogprobs)}`,
    probe.temperature === undefined ? null : `T ${String(probe.temperature)}`,
    result.stream ? 'поток' : 'без потока',
  ].filter((item) => item !== null);
  if (result.error !== null) {
    return `✗ ${probe.id} (${params.join(', ')}): ${result.error}`;
  }
  return [
    `✓ ${probe.id} (${params.join(', ')}), ${String(result.durationMs)} мс`,
    `    ответ: ${JSON.stringify(result.text)}`,
    `    logprobs ответа: ${String(result.contentTokens)} токенов, до ${String(result.topPerToken)} альтернатив; рассуждения: ${String(result.reasoningChars)} символов, logprobs рассуждения: ${String(result.reasoningTokens)} токенов`,
  ].join('\n');
}

function summarize(results: readonly ProbeResult[]): string {
  const byId = new Map(results.map((result) => [result.probe.id, result]));
  const same = (left: string, right: string): string =>
    byId.get(left)?.text === byId.get(right)?.text ? 'одинаковые' : 'разные';
  const yes = (value: number | undefined): string => ((value ?? 0) > 0 ? 'есть' : 'нет');
  return [
    'Итог пробы:',
    `  effort off: logprobs ответа — ${yes(byId.get('off-logprobs')?.contentTokens)}`,
    `  другой режим потока: logprobs ответа — ${yes(byId.get('off-logprobs-other-stream')?.contentTokens)}`,
    `  effort high: logprobs ответа — ${yes(byId.get('high-logprobs')?.contentTokens)}, рассуждения — ${yes(byId.get('high-logprobs')?.reasoningTokens)}`,
    `  temperature 0: два ответа ${same('off-t0-a', 'off-t0-b')}; 1.5: ${same('off-t1.5-a', 'off-t1.5-b')}`,
  ].join('\n');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
