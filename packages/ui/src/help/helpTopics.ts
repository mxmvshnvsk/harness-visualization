// Темы справки — Markdown-файлы из docs/help/, собираются Vite при сборке (import.meta.glob):
// добавили файл — тема появилась. Идентификатор темы — имя файла без .md.

const FILES = import.meta.glob<string>('../../../../docs/help/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const HELP_TOPICS = [
  'agent-loop',
  'prompt-cache',
  'tokens',
  'tool-calls',
  'permissions',
  'mcp',
  'retrieval',
  'flow',
  'context-budget',
  'skills-memory',
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];

export function helpText(topic: HelpTopic): string | null {
  return FILES[`../../../../docs/help/${topic}.md`] ?? null;
}
