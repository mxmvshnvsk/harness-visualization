// Что тул чужого харнесса сделал с файлом — в общий вид FileEffect (см. harnessEvents.ts).
// У каждого харнесса свои тулы и свой формат результата, поэтому разбор — здесь, в адаптерах,
// а вкладка «Код» знает только FileEffect.
//
// Claude Code пишет рядом с результатом тула toolUseResult — то, что видел интерфейс: у Read —
// текст файла без номеров строк, у Edit и Write — файл до правки (originalFile). Поэтому diff
// у него точный. OpenCode в экспорте даёт только аргументы и текст результата: Read — строки
// с номерами «12: …», правки — фрагментами, которые накладываем на последний известный текст.

import type { FileEffect } from '../events/harnessEvents.js';

type Fields = Record<string, unknown>;

export function claudeCodeFileEffect(
  toolName: string,
  input: unknown,
  result: unknown,
  cwd: string | null,
): FileEffect | null {
  const fields = asFields(result);
  if (fields === null) {
    return null;
  }
  if (toolName === 'Read') {
    return claudeCodeRead(asFields(fields.file), cwd);
  }
  const path = stringOf(fields.filePath);
  if (path === null || !(toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit')) {
    return null;
  }
  const before = typeof fields.originalFile === 'string' ? fields.originalFile : null;
  const after =
    toolName === 'Write' ? stringOf(fields.content) : applyEdits(before, editsOf(toolName, input));
  return after === null ? null : { kind: 'write', path: relativeTo(cwd, path), before, after };
}

function claudeCodeRead(file: Fields | null, cwd: string | null): FileEffect | null {
  const path = stringOf(file?.filePath);
  const content = stringOf(file?.content);
  if (file === null || path === null || content === null) {
    return null;
  }
  const start = numberOf(file.startLine) ?? 1;
  const lines = numberOf(file.numLines) ?? 0;
  const total = numberOf(file.totalLines) ?? lines;
  return {
    kind: 'read',
    path: relativeTo(cwd, path),
    content,
    partial: start > 1 || lines < total,
  };
}

interface Edit {
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

// Edit — одна замена в аргументах, MultiEdit — список edits; применяются по очереди.
function editsOf(toolName: string, input: unknown): Edit[] {
  const fields = asFields(input) ?? {};
  const raw = toolName === 'MultiEdit' && Array.isArray(fields.edits) ? fields.edits : [fields];
  return raw.flatMap((item) => {
    const edit = editOf(asFields(item) ?? {});
    return edit === null ? [] : [edit];
  });
}

// Имена полей — как у Claude Code (old_string) и как у OpenCode (oldString).
function editOf(fields: Fields): Edit | null {
  const oldString = stringOf(fields.old_string ?? fields.oldString);
  const newString = stringOf(fields.new_string ?? fields.newString);
  if (oldString === null || newString === null) {
    return null;
  }
  return { oldString, newString, replaceAll: (fields.replace_all ?? fields.replaceAll) === true };
}

export function applyEdits(text: string | null, edits: readonly Edit[]): string | null {
  if (text === null || edits.length === 0) {
    return null;
  }
  let current = text;
  for (const edit of edits) {
    if (!current.includes(edit.oldString)) {
      return null;
    }
    current = edit.replaceAll
      ? current.split(edit.oldString).join(edit.newString)
      : current.replace(edit.oldString, () => edit.newString);
  }
  return current;
}

const OPEN_CODE_READ_HEADER = /^Read file .*?(?:, lines \d+-\d+)?\n/;
const OPEN_CODE_LINE = /^\d+: ?/;

export function openCodeFileEffect(
  toolName: string,
  input: unknown,
  output: { text: string; truncated: boolean },
  cwd: string | null,
): FileEffect | null {
  const fields = asFields(input) ?? {};
  const rawPath = stringOf(fields.path ?? fields.filePath ?? fields.file_path);
  if (rawPath === null) {
    return null;
  }
  const path = relativeTo(cwd, rawPath);
  if (toolName === 'read') {
    return openCodeRead(path, fields, output);
  }
  if (toolName === 'write') {
    const content = stringOf(fields.content);
    return content === null ? null : { kind: 'write', path, after: content };
  }
  const edit = toolName === 'edit' ? editOf(fields) : null;
  return edit === null ? null : { kind: 'edit', path, ...edit };
}

// Строки «12: текст»; хвост «[Output truncated…]» и offset — признак, что прочитана часть.
function openCodeRead(
  path: string,
  fields: Fields,
  output: { text: string; truncated: boolean },
): FileEffect | null {
  if (!OPEN_CODE_READ_HEADER.test(output.text)) {
    return null;
  }
  const lines = output.text.replace(OPEN_CODE_READ_HEADER, '').split('\n');
  const cut = lines.at(-1)?.startsWith('[Output truncated') === true;
  const content = (cut ? lines.slice(0, -1) : lines)
    .map((line) => line.replace(OPEN_CODE_LINE, ''))
    .join('\n');
  const partial = cut || output.truncated || fields.offset !== undefined;
  return { kind: 'read', path, content, partial };
}

// Путь от папки проекта: так короче и не видно, где проект лежал у автора записи.
export function relativeTo(cwd: string | null, path: string): string {
  if (cwd !== null && cwd !== '' && path.startsWith(`${cwd}/`)) {
    return path.slice(cwd.length + 1);
  }
  return path;
}

function asFields(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
