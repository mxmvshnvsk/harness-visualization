// Создаёт тул из одной zod-схемы аргументов.
// Эта схема и проверяет аргументы от модели, и превращается в JSON Schema
// для описания тула — поэтому описание и проверка никогда не расходятся.

import { z } from 'zod';
import { ToolError } from './ToolError.js';
import type { Tool, ToolContext } from './toolTypes.js';

export interface ToolSpecification<ArgumentsSchema extends z.ZodType> {
  name: string;
  description: string;
  argumentsSchema: ArgumentsSchema;
  execute(toolArguments: z.infer<ArgumentsSchema>, context: ToolContext): Promise<string>;
}

export function defineTool<ArgumentsSchema extends z.ZodType>(
  specification: ToolSpecification<ArgumentsSchema>,
): Tool {
  return {
    name: specification.name,
    description: specification.description,
    parametersSchema: buildParametersSchema(specification.argumentsSchema),
    async run(rawArguments, context) {
      const validation = specification.argumentsSchema.safeParse(rawArguments);
      if (!validation.success) {
        throw new ToolError(`Неверные аргументы:\n${z.prettifyError(validation.error)}`);
      }
      return specification.execute(validation.data, context);
    },
  };
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
