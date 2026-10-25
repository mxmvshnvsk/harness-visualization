// Разбор SKILL.md: YAML в начале файла между строками «---» и инструкция после него.
// Из YAML нужны только name и description — строки «ключ: значение», поэтому без библиотеки
// YAML. Ограничения — как в спецификации Agent Skills Anthropic.

import { z } from 'zod';

export interface ParsedSkillFile {
  name: string;
  description: string;
  instructions: string;
}

const XML_TAG = /<[^>]+>/;

const frontmatterSchema = z.object({
  name: z
    .string()
    .min(1, 'name пустой')
    .max(64, 'name длиннее 64 символов')
    .regex(/^[a-z0-9-]+$/, 'name — только строчные латинские буквы, цифры и дефис')
    .refine((name) => !/anthropic|claude/.test(name), 'name не может содержать anthropic и claude'),
  description: z
    .string()
    .min(1, 'description пустой')
    .max(1024, 'description длиннее 1024 символов')
    .refine((description) => !XML_TAG.test(description), 'description не может содержать XML-теги'),
});

// Бросает Error с понятной причиной: харнесс покажет её в событии skill_catalog.
export function parseSkillFile(text: string): ParsedSkillFile {
  const normalized = text.replaceAll('\r\n', '\n');
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (match === null) {
    throw new Error('в начале SKILL.md нет YAML между строками «---»');
  }
  const fields = readFields(match[1] ?? '');
  const validation = frontmatterSchema.safeParse(fields);
  if (!validation.success) {
    throw new Error(validation.error.issues.map((issue) => issue.message).join('; '));
  }
  return { ...validation.data, instructions: (match[2] ?? '').trim() };
}

function readFields(yaml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (field !== null) {
      fields[field[1] ?? ''] = unquote((field[2] ?? '').trim());
    }
  }
  return fields;
}

function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted === null ? value : (quoted[2] ?? '');
}
