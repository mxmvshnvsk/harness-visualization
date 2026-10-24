// Разбирает метаданные в начале документа — блок между строками «---»:
//   ---
//   title: Регламент об отпусках
//   type: regulation
//   ---
// Метаданные записаны в формате YAML, разбирает их библиотека yaml.

import { parse } from 'yaml';
import { z } from 'zod';

const FRONT_MATTER_DELIMITER = '---';

const frontMatterSchema = z.object({
  title: z.string(),
  type: z.string(),
  // YAML превращает 2026-02-10 в дату или оставляет строкой — принимаем оба варианта.
  updated: z.union([z.string(), z.date()]).optional(),
  date: z.union([z.string(), z.date()]).optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type FrontMatter = z.infer<typeof frontMatterSchema>;

export interface ParsedDocumentText {
  frontMatter: FrontMatter;
  body: string;
}

export function parseFrontMatter(fileText: string, fileName: string): ParsedDocumentText {
  const lines = fileText.split('\n');
  if (lines[0]?.trim() !== FRONT_MATTER_DELIMITER) {
    throw new Error(`В документе ${fileName} нет метаданных в начале файла`);
  }
  const closingLineIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === FRONT_MATTER_DELIMITER,
  );
  if (closingLineIndex === -1) {
    throw new Error(`В документе ${fileName} не закрыт блок метаданных`);
  }
  const yamlText = lines.slice(1, closingLineIndex).join('\n');
  const validation = frontMatterSchema.safeParse(parse(yamlText));
  if (!validation.success) {
    throw new Error(`Ошибка в метаданных ${fileName}:\n${validation.error.message}`);
  }
  return {
    frontMatter: validation.data,
    body: lines
      .slice(closingLineIndex + 1)
      .join('\n')
      .trim(),
  };
}
