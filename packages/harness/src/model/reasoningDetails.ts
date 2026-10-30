// OpenRouter передаёт подписанные блоки частями. Возвращаем их в историю в том же
// порядке, соединяя текст/подпись по index, а не теряя подпись при каждом delta.
// Формат: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
export function appendReasoningDetails(
  accumulated: Record<string, unknown>[],
  parts: Record<string, unknown>[],
): void {
  for (const part of parts) {
    const previous = accumulated.find((detail) =>
      typeof part['index'] === 'number'
        ? detail['index'] === part['index']
        : typeof part['id'] === 'string' && detail['id'] === part['id'],
    );
    if (previous === undefined) {
      accumulated.push({ ...part });
      continue;
    }
    for (const [key, value] of Object.entries(part)) {
      if (['text', 'summary', 'signature', 'data'].includes(key) && typeof value === 'string') {
        const prefix = previous[key];
        previous[key] = (typeof prefix === 'string' ? prefix : '') + value;
      } else if (value !== null) {
        previous[key] = value;
      }
    }
  }
}
