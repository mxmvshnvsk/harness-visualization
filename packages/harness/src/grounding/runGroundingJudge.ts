// Запускает судью (этап 5b.3) как отдельную запись: у проверки свой трейс со ссылкой
// на исходный. Исходный трейс — запись сессии, дописывать в него нельзя. В трейсе проверки —
// grounding_check_started, по каждому claim пара model_request/model_response
// (purpose: groundingJudge) и claim_judged, в конце session_finished с токеномикой судьи.

import { startSessionRecording } from '../session/sessionRecording.js';
import type { HarnessEvent, SessionFinishedPayload } from '../events/harnessEvents.js';
import { OpenAiCompatibleProvider } from '../model/OpenAiCompatibleProvider.js';
import { NetworkRouter } from '../network/NetworkRouter.js';
import { readProxyUrl } from '../network/proxyFromEnvironment.js';
import type { LoadedSettings } from '../settings/loadSettings.js';
import type { ClaimCheck } from './claimTypes.js';
import { judgeClaims } from './judgeClaims.js';

export interface GroundingJudgeInput {
  loadedSettings: LoadedSettings;
  projectRoot: string;
  sourceTracePath: string;
  sourceEvents: HarnessEvent[];
}

export interface GroundingJudgeResult {
  claims: ClaimCheck[];
  tracePath: string;
  totals: SessionFinishedPayload | null;
}

export async function runGroundingJudge(
  claims: ClaimCheck[],
  input: GroundingJudgeInput,
): Promise<GroundingJudgeResult> {
  const { settings, modelApiKey } = input.loadedSettings;
  const recording = await startSessionRecording({
    projectRoot: input.projectRoot,
    tracesDirectory: settings.traces.directory,
    listeners: [],
  });
  const { events } = recording;
  let totals: SessionFinishedPayload | null = null;
  events.subscribe((event) => {
    if (event.type === 'claim_judged') {
      console.log(`  судья: claim ${String(event.claimNumber)} из ${String(claims.length)}…`);
    }
    if (event.type === 'session_finished') {
      totals = event;
    }
  });
  const network = new NetworkRouter({
    settings: settings.network,
    proxyUrl: readProxyUrl(),
    onRequest: (request) => events.emit({ type: 'network_request', ...request }),
  });
  events.emit({
    type: 'grounding_check_started',
    sourceTracePath: input.sourceTracePath,
    sourceSessionId: input.sourceEvents[0]?.sessionId ?? null,
    claimCount: claims.length,
    judgeModel: settings.model.model,
  });
  // Трейс проверки закрывается и при ошибке: в нём остаётся, что успел сказать судья.
  const finish = async (): Promise<string> => {
    await network.close();
    return recording.finish();
  };
  try {
    const provider = new OpenAiCompatibleProvider(settings.model, modelApiKey, network.fetch);
    const judged = await judgeClaims(claims, { provider, events, prices: settings.prices });
    const tracePath = await finish();
    return { claims: judged, tracePath, totals };
  } catch (error) {
    events.emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    await finish();
    throw error;
  }
}
