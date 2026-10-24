// Поиск по словам в документах базы знаний.
// Русские слова меняют окончания: «отпуск», «отпуска», «отпуском». Поэтому
// у длинных слов запроса отбрасываются два последних символа, и ищутся слова
// документа, которые начинаются с этой основы. Это грубо, но наглядно:
// на этапе 5 рядом появится поиск по смыслу, и разницу будет видно.

import type { KnowledgeDocument } from './documentTypes.js';

const MIN_WORD_LENGTH = 3;
const STEM_MIN_LENGTH = 6;
const ENDING_LENGTH = 2;
const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;
const SNIPPET_LENGTH = 240;

export interface SearchHit {
  document: KnowledgeDocument;
  score: number;
  // Строка документа, в которой нашлось слово запроса.
  snippet: string;
}

export function searchDocuments(
  documents: KnowledgeDocument[],
  query: string,
  limit: number,
): SearchHit[] {
  const stems = toStems(query);
  if (stems.length === 0) {
    return [];
  }
  return documents
    .map((document) => ({
      document,
      score: scoreDocument(document, stems),
      snippet: findSnippet(document, stems),
    }))
    .filter((hit) => hit.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

function toStems(text: string): string[] {
  return splitIntoWords(text)
    .filter((word) => word.length >= MIN_WORD_LENGTH)
    .map((word) => (word.length >= STEM_MIN_LENGTH ? word.slice(0, -ENDING_LENGTH) : word));
}

// Слова — непрерывные последовательности букв и цифр, в нижнем регистре.
function splitIntoWords(text: string): string[] {
  return text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function scoreDocument(document: KnowledgeDocument, stems: string[]): number {
  const bodyWords = splitIntoWords(document.body);
  const titleWords = splitIntoWords(document.title);
  const tagWords = document.tags.flatMap(splitIntoWords);
  let score = 0;
  for (const stem of stems) {
    score += countMatches(bodyWords, stem);
    score += countMatches(titleWords, stem) * TITLE_WEIGHT;
    score += countMatches(tagWords, stem) * TAG_WEIGHT;
  }
  return score;
}

function countMatches(words: string[], stem: string): number {
  return words.filter((word) => word.startsWith(stem)).length;
}

function findSnippet(document: KnowledgeDocument, stems: string[]): string {
  const lines = document.body
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
  const matchingLine = lines.find((line) => {
    const lineWords = splitIntoWords(line);
    return stems.some((stem) => lineWords.some((word) => word.startsWith(stem)));
  });
  const snippet = (matchingLine ?? lines[0] ?? '').replace(/\s+/g, ' ').trim();
  return snippet.length > SNIPPET_LENGTH ? `${snippet.slice(0, SNIPPET_LENGTH)}…` : snippet;
}
