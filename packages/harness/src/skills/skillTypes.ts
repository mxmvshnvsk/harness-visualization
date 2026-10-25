// Скиллы (этап 6b): инструкции для отдельных задач. Формат — как у Agent Skills Anthropic:
// папка с SKILL.md (YAML с name и description, дальше инструкция) и дополнительными файлами.
// https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

// always — инструкция в system prompt с самого начала; on_demand — в prompt только каталог,
// модель загружает инструкцию тулом load_skill; manual — в каталоге нет, загружает
// пользователь командой «/имя» в начале вопроса.
export const SKILL_MODES = ['always', 'on_demand', 'manual'] as const;
export type SkillMode = (typeof SKILL_MODES)[number];

// Кто загрузил скилл: харнесс при старте (always), модель (load_skill), пользователь (/имя).
export type SkillTrigger = 'always' | 'model' | 'user';

export interface Skill {
  name: string;
  description: string;
  mode: SkillMode;
  // Инструкция — SKILL.md без YAML в начале.
  instructions: string;
  // Дополнительные файлы — пути от папки скилла, с прямыми слешами.
  files: string[];
  // Абсолютный путь к папке скилла.
  directory: string;
}

// Папка, которую харнесс не смог прочитать как скилл, и почему.
export interface SkillProblem {
  folder: string;
  message: string;
}
