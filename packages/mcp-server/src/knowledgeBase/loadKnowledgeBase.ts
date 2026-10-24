// Загружает все документы базы знаний из папки data.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { KnowledgeDocument } from './documentTypes.js';
import { parseFrontMatter, type FrontMatter } from './parseFrontMatter.js';

const DOCUMENT_EXTENSION = '.md';
// Описание самого набора данных — не документ компании.
const SKIPPED_FILES = ['README.md'];

export async function loadKnowledgeBase(dataDirectory: string): Promise<KnowledgeDocument[]> {
  const entries = await readdir(dataDirectory, { recursive: true, withFileTypes: true });
  const documents: KnowledgeDocument[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(DOCUMENT_EXTENSION)) {
      continue;
    }
    const absolutePath = join(entry.parentPath, entry.name);
    const relativePath = relative(dataDirectory, absolutePath);
    if (SKIPPED_FILES.includes(relativePath)) {
      continue;
    }
    documents.push(await loadDocument(absolutePath, relativePath));
  }
  return documents.sort((first, second) => first.id.localeCompare(second.id));
}

async function loadDocument(
  absolutePath: string,
  relativePath: string,
): Promise<KnowledgeDocument> {
  const fileText = await readFile(absolutePath, 'utf8');
  const { frontMatter, body } = parseFrontMatter(fileText, relativePath);
  return {
    id: toDocumentId(relativePath),
    title: frontMatter.title,
    type: frontMatter.type,
    date: readDocumentDate(frontMatter),
    owner: frontMatter.owner ?? null,
    tags: frontMatter.tags,
    body,
  };
}

// regulations/vacation.md → regulations/vacation
function toDocumentId(relativePath: string): string {
  return relativePath.split(sep).join('/').slice(0, -DOCUMENT_EXTENSION.length);
}

function readDocumentDate(frontMatter: FrontMatter): string | null {
  const value = frontMatter.updated ?? frontMatter.date;
  if (value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}
