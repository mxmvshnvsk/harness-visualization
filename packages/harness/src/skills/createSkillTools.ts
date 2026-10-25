// Тулы скиллов: load_skill — инструкция скилла, read_skill_file — его дополнительный файл.
// Поэтапная загрузка: каталог (имя и описание) уже в system prompt, инструкция — по выбору
// модели, файлы — только когда инструкция на них ссылается.

import { z } from 'zod';
import { defineTool } from '../tools/defineTool.js';
import type { Tool } from '../tools/toolTypes.js';
import type { SkillLibrary } from './SkillLibrary.js';

export function createSkillTools(library: SkillLibrary): Tool[] {
  if (library.onDemand().length === 0) {
    // Загружать нечего — тулы модели не предлагаем.
    return [];
  }
  return [loadSkillTool(library), readSkillFileTool(library)];
}

function loadSkillTool(library: SkillLibrary): Tool {
  return defineTool({
    name: 'load_skill',
    description:
      'Загружает инструкцию скилла из каталога. Загружай скилл, прежде чем ' +
      'выполнять задачу, которая подходит под его описание, и следуй инструкции.',
    argumentsSchema: z.object({
      name: z.string().min(1).describe('Имя скилла из каталога, например policy-answer'),
    }),
    effects: ['read'],
    describeAction: (toolArguments) => `Загрузить скилл ${toolArguments.name}`,
    execute(toolArguments) {
      const skill = library.requireForModel(toolArguments.name);
      library.load(skill, 'model');
      const files =
        skill.files.length === 0
          ? ''
          : `\n\nФайлы скилла (читать тулом read_skill_file, когда инструкция на них ссылается): ${skill.files.join(', ')}`;
      return Promise.resolve({
        content: `Скилл ${skill.name}:\n\n${skill.instructions}${files}`,
        details: { skill: skill.name, files: skill.files },
      });
    },
  });
}

function readSkillFileTool(library: SkillLibrary): Tool {
  return defineTool({
    name: 'read_skill_file',
    description:
      'Читает дополнительный файл загруженного скилла: шаблон, справку, пример. ' +
      'Путь — как в инструкции скилла.',
    argumentsSchema: z.object({
      name: z.string().min(1).describe('Имя скилла'),
      path: z.string().min(1).describe('Путь к файлу от папки скилла, например TEMPLATE.md'),
    }),
    effects: ['read'],
    describeAction: (toolArguments) =>
      `Прочитать ${toolArguments.path} скилла ${toolArguments.name}`,
    async execute(toolArguments) {
      const skill = library.requireForModel(toolArguments.name);
      return {
        content: await library.readFile(skill, toolArguments.path),
        details: { skill: skill.name, path: toolArguments.path },
      };
    },
  });
}
