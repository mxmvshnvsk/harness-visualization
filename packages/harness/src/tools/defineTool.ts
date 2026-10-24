// Создаёт тул из одной zod-схемы аргументов.
// Эта схема и проверяет аргументы от модели, и превращается в JSON Schema
// для описания тула — поэтому описание и проверка никогда не расходятся.

import { z } from 'zod';
import type { ActionTarget, ToolEffect } from '../permissions/permissionTypes.js';
import { ToolError } from './ToolError.js';
import type { PreparedToolCall, Tool, ToolContext, ToolOutput } from './toolTypes.js';

const MAX_DEFAULT_DESCRIPTION_LENGTH = 120;

export interface ToolSpecification<ArgumentsSchema extends z.ZodType> {
  name: string;
  description: string;
  argumentsSchema: ArgumentsSchema;
  // Что делает тул. Тул не решает, опасно ли это, — решает политика харнесса.
  effects: readonly ToolEffect[];
  // Описание действия для человека: «Удалить файл notes/a.md».
  // Без него используется имя тула и аргументы.
  describeAction?: (toolArguments: z.infer<ArgumentsSchema>) => string;
  // С чем работает вызов: пути в песочнице и адреса сайтов.
  targets?: (toolArguments: z.infer<ArgumentsSchema>) => ActionTarget[];
  // Проверка до решения о разрешении. Бросает ToolError, если действие невозможно.
  checkBeforeExecution?: (
    toolArguments: z.infer<ArgumentsSchema>,
    context: ToolContext,
  ) => Promise<void>;
  // Можно вернуть просто текст для модели или текст вместе с подробностями для трейса.
  execute(
    toolArguments: z.infer<ArgumentsSchema>,
    context: ToolContext,
  ): Promise<string | ToolOutput>;
}

export function defineTool<ArgumentsSchema extends z.ZodType>(
  specification: ToolSpecification<ArgumentsSchema>,
): Tool {
  return {
    name: specification.name,
    description: specification.description,
    parametersSchema: buildParametersSchema(specification.argumentsSchema),
    effects: specification.effects,
    prepare(rawArguments) {
      const validation = specification.argumentsSchema.safeParse(rawArguments);
      if (!validation.success) {
        throw new ToolError(`Неверные аргументы:\n${z.prettifyError(validation.error)}`);
      }
      return prepareCall(specification, validation.data);
    },
  };
}

function prepareCall<ArgumentsSchema extends z.ZodType>(
  specification: ToolSpecification<ArgumentsSchema>,
  toolArguments: z.infer<ArgumentsSchema>,
): PreparedToolCall {
  return {
    actionDescription: describeAction(specification, toolArguments),
    targets: specification.targets === undefined ? [] : specification.targets(toolArguments),
    async checkBeforeExecution(context) {
      if (specification.checkBeforeExecution !== undefined) {
        await specification.checkBeforeExecution(toolArguments, context);
      }
    },
    async execute(context) {
      const result = await specification.execute(toolArguments, context);
      return typeof result === 'string' ? { content: result } : result;
    },
  };
}

function describeAction<ArgumentsSchema extends z.ZodType>(
  specification: ToolSpecification<ArgumentsSchema>,
  toolArguments: z.infer<ArgumentsSchema>,
): string {
  if (specification.describeAction !== undefined) {
    return specification.describeAction(toolArguments);
  }
  const argumentsText = JSON.stringify(toolArguments).slice(0, MAX_DEFAULT_DESCRIPTION_LENGTH);
  return `${specification.name} ${argumentsText}`;
}

// io: 'input' — описываем то, что модель должна прислать, а не то, что получится
// после подстановки значений по умолчанию: поле с default становится необязательным.
// Поле $schema нужно валидаторам JSON Schema, но не модели — убираем его,
// чтобы не тратить токены в каждом запросе.
function buildParametersSchema(argumentsSchema: z.ZodType): Record<string, unknown> {
  const jsonSchema: Record<string, unknown> = z.toJSONSchema(argumentsSchema, { io: 'input' });
  const parametersSchema: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(jsonSchema)) {
    if (key !== '$schema') {
      parametersSchema[key] = value;
    }
  }
  return parametersSchema;
}
