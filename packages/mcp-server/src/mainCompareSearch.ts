// Команда pnpm compare-search: сравнивает поиск по словам, по смыслу и гибридный (этап 5.2).
// Без аргументов — прогон по набору вопросов с известными нужными документами и итог.
// С аргументом — одна выдача по своему вопросу: pnpm compare-search "как оформить отпуск".
// Модель эмбеддингов должна быть скачана заранее (pnpm rag-index).

import { styleText } from 'node:util';
import { RECIPROCAL_RANK_CONSTANT } from './hybridSearch/fuseByReciprocalRank.js';
import { loadKnowledgeBase } from './knowledgeBase/loadKnowledgeBase.js';
import {
  rankWithAllMethods,
  SEARCH_METHOD_TITLES,
  SEARCH_METHODS,
  type SearchMethod,
  type SearchRankings,
  type SearchSources,
} from './searchComparison/rankWithAllMethods.js';
import {
  QUESTION_GROUP_TITLES,
  SEARCH_QUESTIONS,
  type QuestionGroup,
  type SearchQuestion,
} from './searchComparison/searchQuestions.js';
import { scoreRanking, TOP_FIVE, type RankingScore } from './searchComparison/scoreRanking.js';
import { SemanticIndex } from './semanticSearch/SemanticIndex.js';
import { DATA_DIRECTORY, MODEL_DIRECTORY, VECTOR_CACHE_PATH } from './serverPaths.js';

// Самый длинный id — regulations/informationSecurity, 31 символ, плюс отметка и отступ.
const COLUMN_WIDTH = 35;
const SUMMARY_LABEL_WIDTH = 34;
const SUMMARY_COLUMN_WIDTH = 11;

interface QuestionResult {
  question: SearchQuestion;
  rankings: SearchRankings;
  scores: Record<SearchMethod, RankingScore>;
}

async function main(): Promise<void> {
  const documents = await loadKnowledgeBase(DATA_DIRECTORY);
  const semanticIndex = new SemanticIndex({
    documents,
    modelDirectory: MODEL_DIRECTORY,
    vectorCachePath: VECTOR_CACHE_PATH,
    log: (message) => {
      console.log(styleText('dim', message));
    },
  });
  const sources: SearchSources = { documents, semanticIndex };

  const ownQuery = process.argv[2];
  if (ownQuery !== undefined && ownQuery.trim() !== '') {
    const rankings = await rankWithAllMethods(ownQuery, sources);
    console.log(`\n«${ownQuery}»`);
    printTopFive(rankings, []);
    return;
  }

  console.log(
    `Сравнение поиска: ${SEARCH_METHODS.map((method) => SEARCH_METHOD_TITLES[method]).join(', ')} ` +
      `(Reciprocal Rank Fusion, k = ${RECIPROCAL_RANK_CONSTANT}) · ` +
      `${SEARCH_QUESTIONS.length} вопросов, ${documents.length} документов`,
  );
  const results: QuestionResult[] = [];
  for (const [index, question] of SEARCH_QUESTIONS.entries()) {
    const result = await compareOnQuestion(question, sources);
    printQuestion(index + 1, result);
    results.push(result);
  }
  printSummary(results);
}

async function compareOnQuestion(
  question: SearchQuestion,
  sources: SearchSources,
): Promise<QuestionResult> {
  assertDocumentsExist(question, sources);
  const rankings = await rankWithAllMethods(question.query, sources);
  const scores = {
    words: scoreRanking(rankings.words, question.expectedDocumentIds),
    meaning: scoreRanking(rankings.meaning, question.expectedDocumentIds),
    hybrid: scoreRanking(rankings.hybrid, question.expectedDocumentIds),
  };
  return { question, rankings, scores };
}

// Опечатка в id нужного документа молча испортила бы итог — проверяем заранее.
function assertDocumentsExist(question: SearchQuestion, sources: SearchSources): void {
  const knownIds = new Set(sources.documents.map((document) => document.id));
  const unknownIds = question.expectedDocumentIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`В вопросе «${question.query}» нет таких документов: ${unknownIds.join(', ')}`);
  }
}

function printQuestion(number: number, result: QuestionResult): void {
  const { question, rankings, scores } = result;
  console.log(
    `\n${styleText('bold', `${number}. «${question.query}»`)} — ${QUESTION_GROUP_TITLES[question.group]}`,
  );
  console.log(styleText('dim', `   Проверяет: ${question.checks}`));
  console.log(`   Нужные документы: ${question.expectedDocumentIds.join(', ')}`);
  printTopFive(rankings, question.expectedDocumentIds);
  const places = SEARCH_METHODS.map(
    (method) => `${SEARCH_METHOD_TITLES[method]} ${describePlaces(scores[method].places)}`,
  );
  console.log(`   Места нужных: ${places.join(' · ')}`);
}

function printTopFive(rankings: SearchRankings, expectedIds: string[]): void {
  const header = SEARCH_METHODS.map((method) =>
    `  ${SEARCH_METHOD_TITLES[method]}`.padEnd(COLUMN_WIDTH),
  ).join('');
  console.log(styleText('dim', `     ${header}`.trimEnd()));
  for (let index = 0; index < TOP_FIVE; index += 1) {
    const cells = SEARCH_METHODS.map((method) => {
      const documentId = rankings[method][index]?.documentId ?? '';
      return describeCell(documentId, expectedIds.includes(documentId));
    });
    console.log(`   ${index + 1} ${cells.join('')}`.trimEnd());
  }
}

// Отступ добавляем после раскраски: коды цвета невидимы, но padEnd посчитал бы их символами.
function describeCell(documentId: string, isExpected: boolean): string {
  const text = `${isExpected ? '✓' : ' '} ${documentId}`;
  const padding = ' '.repeat(Math.max(0, COLUMN_WIDTH - text.length));
  return `${isExpected ? styleText('green', text) : text}${padding}`;
}

// [1, 23] → «1, 23»; [null] → «нет».
function describePlaces(places: (number | null)[]): string {
  return places.map((place) => (place === null ? 'нет' : String(place))).join(', ');
}

function printSummary(results: QuestionResult[]): void {
  const expectedTotal = results.reduce(
    (sum, result) => sum + result.question.expectedDocumentIds.length,
    0,
  );
  console.log(`\n${styleText('bold', `Итого по ${results.length} вопросам`)}`);
  printSummaryRow('', (method) => SEARCH_METHOD_TITLES[method]);
  printSummaryRow('первым — нужный документ', (method) =>
    describeShare(
      countWhere(results, (result) => result.scores[method].firstIsExpected),
      results.length,
    ),
  );
  printSummaryRow('нужный в первой тройке', (method) =>
    describeShare(
      countWhere(results, (result) => result.scores[method].expectedInTopThree),
      results.length,
    ),
  );
  printSummaryRow(`нужных в первой пятёрке (из ${expectedTotal})`, (method) =>
    String(results.reduce((sum, result) => sum + result.scores[method].foundInTopFive, 0)),
  );

  console.log(`\n${styleText('bold', 'По группам: нужный в первой тройке')}`);
  for (const group of Object.keys(QUESTION_GROUP_TITLES) as QuestionGroup[]) {
    const groupResults = results.filter((result) => result.question.group === group);
    printSummaryRow(`${QUESTION_GROUP_TITLES[group]} (${groupResults.length})`, (method) =>
      describeShare(
        countWhere(groupResults, (result) => result.scores[method].expectedInTopThree),
        groupResults.length,
      ),
    );
  }
}

function printSummaryRow(label: string, describe: (method: SearchMethod) => string): void {
  const cells = SEARCH_METHODS.map((method) => describe(method).padEnd(SUMMARY_COLUMN_WIDTH));
  console.log(`${label.padEnd(SUMMARY_LABEL_WIDTH)}${cells.join('')}`.trimEnd());
}

function countWhere(
  results: QuestionResult[],
  matches: (result: QuestionResult) => boolean,
): number {
  return results.filter(matches).length;
}

function describeShare(count: number, total: number): string {
  return `${count} из ${total}`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
