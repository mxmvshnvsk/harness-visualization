// Поле $schema нужно валидаторам JSON Schema, но не модели — убираем его,
// чтобы не тратить токены в каждом запросе.

export function withoutSchemaKeyword(jsonSchema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(jsonSchema)) {
    if (key !== '$schema') {
      result[key] = value;
    }
  }
  return result;
}
