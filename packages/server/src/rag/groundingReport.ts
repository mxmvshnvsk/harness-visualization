// Проверка опоры ответа для лаборатории RAG (этап 8b): те же три уровня, что у
// pnpm check-grounding, — код (цитаты дословно), сходство (ближайшая увиденная строка) и судья.
// Судью сервер не зовёт — это запросы к модели и деньги: его мнения берутся из трейса
// проверки (pnpm check-grounding --judge), который ссылается на этот трейс.

import {
  checkGrounding,
  claimSupportLevel,
  collectSeenTexts,
  disagreesWithJudge,
  measureClaimSimilarity,
  type ClaimCheck,
  type ClaimSupportLevel,
  type CheckedReference,
  type HarnessEvent,
} from '@harness-visualization/harness';
import type { TextEmbedder } from '@harness-visualization/embeddings';
import type { TraceCatalog } from '../traces/TraceCatalog.js';

export interface GroundingClaim {
  number: number;
  text: string;
  kind: ClaimCheck['claim']['kind'];
  level: ClaimSupportLevel;
  quotes: { quote: string; found: boolean; toolName: string | null }[];
  similarity: { score: number; passage: string; documentId: string | null } | null;
  judge: { verdict: string; explanation: string; evidence: string[] } | null;
  // Код и судья расходятся — самое интересное место для разбора.
  disagree: boolean;
}

export interface GroundingReportResponse {
  file: string;
  question: string | null;
  answer: string;
  references: CheckedReference[];
  claims: GroundingClaim[];
  similarityThreshold: number;
  // Трейс проверки, откуда мнения судьи; null — судью по этому трейсу не звали.
  judgeTrace: string | null;
}

interface ReportInput {
  file: string;
  events: HarnessEvent[];
  embedder: TextEmbedder;
  catalog: TraceCatalog;
  similarityThreshold: number;
}

export async function buildGroundingReport(input: ReportInput): Promise<GroundingReportResponse> {
  const report = checkGrounding(input.events);
  const measured = await measureClaimSimilarity(
    report.claims,
    collectSeenTexts(input.events),
    input.embedder,
  );
  const judge = await findJudgeOpinions(input.file, input.catalog);
  const question = input.events.find((event) => event.type === 'user_message');
  return {
    file: input.file,
    question: question?.type === 'user_message' ? question.text : null,
    answer: report.answer,
    references: report.references,
    claims: measured.map((checked) => toClaim(checked, judge.opinions, input.similarityThreshold)),
    similarityThreshold: input.similarityThreshold,
    judgeTrace: judge.file,
  };
}

type JudgeEvent = Extract<HarnessEvent, { type: 'claim_judged' }>;

function toClaim(
  checked: ClaimCheck,
  opinions: ReadonlyMap<number, JudgeEvent>,
  threshold: number,
): GroundingClaim {
  const opinion = opinions.get(checked.claim.number) ?? null;
  const withJudge: ClaimCheck =
    opinion === null
      ? checked
      : {
          ...checked,
          judge: {
            verdict: opinion.verdict,
            explanation: opinion.explanation,
            eventRequestId: opinion.requestId,
          },
        };
  const level = claimSupportLevel(withJudge, threshold);
  return {
    number: checked.claim.number,
    text: checked.claim.text,
    kind: checked.claim.kind,
    level,
    quotes: checked.quotes.map((quote) => ({
      quote: quote.quote,
      found: quote.foundIn !== null,
      toolName: quote.foundIn?.toolName ?? null,
    })),
    similarity:
      checked.similarity === null
        ? null
        : {
            score: checked.similarity.score,
            passage: checked.similarity.passage,
            documentId: checked.similarity.documentId,
          },
    judge:
      opinion === null
        ? null
        : {
            verdict: opinion.verdict,
            explanation: opinion.explanation,
            evidence: opinion.evidence,
          },
    disagree: disagreesWithJudge(withJudge, level),
  };
}

// Самый свежий трейс проверки, который проверял этот файл.
async function findJudgeOpinions(
  file: string,
  catalog: TraceCatalog,
): Promise<{ file: string | null; opinions: Map<number, JudgeEvent> }> {
  const checks = (await catalog.list()).filter(
    (summary) =>
      summary.kind === 'groundingCheck' &&
      summary.title !== null &&
      (summary.title === file || summary.title.endsWith(`/${file}`)),
  );
  const latest = checks[0];
  const contents = latest === undefined ? null : await catalog.read(latest.file);
  const opinions = new Map<number, JudgeEvent>();
  for (const event of contents?.events ?? []) {
    if (event.type === 'claim_judged') {
      opinions.set(event.claimNumber, event);
    }
  }
  return { file: latest?.file ?? null, opinions };
}
