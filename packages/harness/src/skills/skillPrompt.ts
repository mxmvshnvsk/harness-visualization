// Скиллы в prompt: каталог и инструкции always — в system prompt, «/имя» в вопросе — инструкция
// перед вопросом пользователя.

import type { SkillLibrary } from './SkillLibrary.js';
import type { Skill } from './skillTypes.js';

// Раздел system prompt. Каталог — только имя и описание: инструкции модель загрузит сама.
export function describeSkills(library: SkillLibrary): string[] {
  const catalog = library.onDemand();
  const always = library.always();
  const lines: string[] = [];
  if (catalog.length > 0) {
    lines.push(
      '',
      'Скиллы — инструкции для отдельных задач. Если задача подходит под описание скилла, ' +
        'сначала загрузи его тулом load_skill и следуй инструкции.',
      ...catalog.map((skill) => `- ${skill.name}: ${skill.description}`),
    );
  }
  for (const skill of always) {
    lines.push('', ...skillBlock(skill, 'загружен харнессом заранее'));
  }
  return lines;
}

export function skillBlock(skill: Skill, origin: string): string[] {
  return [`[Скилл ${skill.name} — ${origin}]`, skill.instructions, `[Конец скилла ${skill.name}]`];
}

export interface SkillCommand {
  skill: Skill;
  // Вопрос без команды.
  rest: string;
}

// «/meeting-summary про встречу 20 октября» — пользователь сам загружает скилл.
// Неизвестная команда — не команда: вопрос уходит модели как есть.
export function parseSkillCommand(text: string, library: SkillLibrary): SkillCommand | null {
  const match = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  const skill = match === null ? null : library.find(match[1] ?? '');
  if (match === null || skill === null) {
    return null;
  }
  return { skill, rest: (match[2] ?? '').trim() };
}

export function withSkillInstructions(skill: Skill, content: string): string {
  return [...skillBlock(skill, 'загружен по команде пользователя'), '', content].join('\n');
}
