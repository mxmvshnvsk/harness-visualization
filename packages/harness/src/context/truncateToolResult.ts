// Обрезка больших результатов тулов (этап 6.3). Результат тула попадает в историю и потом
// уходит модели в каждом следующем запросе — один большой поиск съедает бюджет на весь диалог.
// Поэтому харнесс оставляет начало, а в конце пишет, сколько обрезал и что делать, если нужна
// остальная часть. Сам тул вернул всё — это видно в tool_result; модель получает обрезанное.

export interface ToolResultTruncation {
  // Что получит модель: начало результата и пометка харнесса.
  content: string;
  originalChars: number;
  keptChars: number;
  // Оценка в токенах — той же формулой, что бюджет prompt (символы ÷ charsPerToken).
  originalTokens: number;
  keptTokens: number;
  limitTokens: number;
}

// Не резать посреди строки, если конец строки недалеко: так целые фрагменты поиска остаются целыми.
const LINE_BREAK_SEARCH = 0.8;

// null — результат помещается, обрезать нечего.
export function truncateToolResult(
  content: string,
  limitTokens: number,
  charsPerToken: number,
): ToolResultTruncation | null {
  const limitChars = Math.floor(limitTokens * charsPerToken);
  if (content.length <= limitChars) {
    return null;
  }
  const lineBreak = content.lastIndexOf('\n', limitChars);
  const cut = lineBreak >= limitChars * LINE_BREAK_SEARCH ? lineBreak : limitChars;
  const kept = content.slice(0, cut).trimEnd();
  const toTokens = (chars: number): number => Math.round(chars / charsPerToken);
  const originalTokens = toTokens(content.length);
  const keptTokens = toTokens(kept.length);
  const marker =
    `\n\n[Харнесс обрезал результат: показано ≈${String(keptTokens)} из ≈${String(originalTokens)} токенов ` +
    `(${String(kept.length)} из ${String(content.length)} символов). Если нужна остальная часть — ` +
    'уточните запрос или прочитайте источник по частям.]';
  return {
    content: kept + marker,
    originalChars: content.length,
    keptChars: kept.length,
    originalTokens,
    keptTokens,
    limitTokens,
  };
}
