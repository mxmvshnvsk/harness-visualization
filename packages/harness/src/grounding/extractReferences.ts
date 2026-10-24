// Достаёт из текста ответа ссылки на источники. Модель ссылается двумя способами:
// id документа или путь к файлу в обратных кавычках (`regulations/vacation`)
// и адрес страницы (https://…). Этого достаточно для учебной проверки;
// ссылку в свободном тексте без кавычек проверка намеренно не ищет, чтобы не угадывать.

// Содержимое обратных кавычек: `regulations/vacation`, `projects/raketa.md`.
const BACKTICK_PATTERN = /`([^`]+)`/g;
// Адрес страницы до первого пробела или закрывающей скобки.
const URL_PATTERN = /https?:\/\/[^\s)]+/g;
// Похоже на id документа или путь: сегменты из букв, цифр, _ . - через слеш.
const REFERENCE_PATTERN = /^[A-Za-z][\w-]*(?:\/[\w.-]+)+$/;

export function extractReferences(answer: string): string[] {
  const references = new Set<string>();
  for (const match of answer.matchAll(BACKTICK_PATTERN)) {
    const token = match[1]?.trim() ?? '';
    if (REFERENCE_PATTERN.test(token)) {
      references.add(token);
    }
  }
  for (const match of answer.matchAll(URL_PATTERN)) {
    references.add(stripTrailingPunctuation(match[0]));
  }
  return [...references];
}

// Адрес в тексте часто заканчивается точкой или запятой предложения — она не часть адреса.
function stripTrailingPunctuation(url: string): string {
  return url.replace(/[.,;]+$/, '');
}
