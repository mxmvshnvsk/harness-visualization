// Создаёт тул из одной zod-схемы аргументов.
// Эта схема и проверяет аргументы от модели, и превращается в JSON Schema
// для описания тула — поэтому описание и проверка никогда не расходятся.

import { z } from 'zod';
import { ToolError } from './ToolError.js';
import type { PreparedToolCall, Tool, ToolContext, ToolOutput } from './toolTypes.js';

export interface ToolSpecification<ArgumentsSchema extends z.ZodType> {
  name: string;
  description: string;
  argumentsSchema: ArgumentsSchema;
  // Если задано, харнесс спросит разрешения у пользователя перед выполнением.
  // Функция возвращает понятное человеку описание действия: «Удалить файл notes/a.md».
  confirmation?: (toolArguments: z.infer<ArgumentsSchema>) => string;
  // Проверка перед вопросом пользователю. Бросает ToolError, если действие невозможно.
  checkBeforeConfirmation?: (
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
  const confirmationText =
    specification.confirmation === undefined ? null : specification.confirmation(toolArguments);
  return {
    confirmationText,
    async checkBeforeConfirmation(context) {
      if (specification.checkBeforeConfirmation !== undefined) {
        await specification.checkBeforeConfirmation(toolArguments, context);
      }
    },
    async execute(context) {
      const result = await specification.execute(toolArguments, context);
      return typeof result === 'string' ? { content: result } : result;
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
