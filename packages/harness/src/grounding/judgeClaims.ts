// Уровень 3 проверки опоры (этап 5b.3): модель-судья читает claim рядом со строками того,
// что видела модель в сессии, и говорит, подтверждают они claim, противоречат или молчат.
// Сходство embeddings (5b.2) этого не умеет: «отпуск 35 дней» при 28 в документе для него
// так же близко, как верный claim. Но судья — тоже модель: он недетерминирован и может
// ошибаться, поэтому его вердикт — мнение и показывается отдельно от проверок кодом.
//
// Один запрос на claim: так в трейсе видно, что судья получил и что ответил по каждому.
// Без reasoning (effort off) — короткая задача, а запросов много.

import { z } from 'zod';
import { requestModel, type ModelRequestDependencies } from '../agent/requestModel.js';
import type { JudgeVerdict } from '../events/harnessEvents.js';
import type { ClaimCheck, JudgeOpinion } from './claimTypes.js';

const JUDGE_INSTRUCTIONS = [
  'Ты — судья, проверяющий опору ответа ИИ-ассистента на источники.',
  'Тебе дают утверждение из ответа и строки из документов, которые ассистент видел.',
  'Реши только по этим строкам, без своих знаний:',
  '- supported — строки подтверждают утверждение;',
  '- contradicted — строки противоречат утверждению (другие числа, сроки, условия);',
  '- notFound — в строках об этом нет.',
  'Ответь одним JSON-объектом без пояснений вокруг:',
  '{"verdict": "supported" | "contradicted" | "notFound", "explanation": "одно предложение по-русски"}',
].join('\n');

const judgeAnswerSchema = z.object({
  verdict: z.enum(['supported', 'contradicted', 'notFound']),
  explanation: z.string(),
});

export async function judgeClaims(
  claims: ClaimCheck[],
  dependencies: ModelRequestDependencies,
): Promise<ClaimCheck[]> {
  const judged: ClaimCheck[] = [];
  for (const checked of claims) {
    judged.push({ ...checked, judge: await judgeClaim(checked, dependencies) });
  }
  return judged;
}

async function judgeClaim(
  checked: ClaimCheck,
  dependencies: ModelRequestDependencies,
): Promise<JudgeOpinion> {
  const evidence = checked.closestLines.map((line) => line.passage);
  const { requestId, reply } = await requestModel(
    {
      messages: [
        { role: 'system', content: JUDGE_INSTRUCTIONS },
        { role: 'user', content: describeTask(checked.claim.text, evidence) },
      ],
      tools: [],
      reasoningEffort: 'off',
    },
    dependencies,
    { purpose: 'groundingJudge', iteration: null },
  );
  const opinion = parseJudgeAnswer(reply.text ?? '');
  dependencies.events.emit({
    type: 'claim_judged',
    requestId,
    claimNumber: checked.claim.number,
    claim: checked.claim.text,
    evidence,
    verdict: opinion.verdict,
    explanation: opinion.explanation,
  });
  return { ...opinion, eventRequestId: requestId };
}

function describeTask(claim: string, evidence: string[]): string {
  const lines = evidence.length === 0 ? ['(строк нет)'] : evidence.map((line) => `- ${line}`);
  return [`Утверждение: ${claim}`, '', 'Строки из того, что видел ассистент:', ...lines].join('\n');
}

// Модель иногда оборачивает JSON в ```json … ``` — берём текст от первой { до последней }.
function parseJudgeAnswer(text: string): { verdict: JudgeVerdict; explanation: string } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return { verdict: 'unclear', explanation: `ответ не JSON: ${text.trim()}` };
  }
  try {
    const parsed = judgeAnswerSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Разбор не удался — ниже вернём unclear с текстом ответа.
  }
  return { verdict: 'unclear', explanation: `ответ не по формату: ${text.trim()}` };
}
