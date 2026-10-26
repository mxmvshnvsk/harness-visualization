// Прячет ключи в тексте чужой записи: в Claude Code в результаты тулов попадает всё,
// что модель прочитала, — в том числе .env, если она его открывала. Наш харнесс маскирует
// заголовки при записи, а чужую запись приходится чистить при импорте.

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\btvly-[A-Za-z0-9_-]{16,}/g,
  /\bAQVN[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/g,
  /((?:API_KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*\s*[=:]\s*)["']?[^\s"']{8,}/gi,
];

export function maskSecretText(text: string): string {
  let masked = text;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, (match: string, prefix?: string) =>
      typeof prefix === 'string' && match.startsWith(prefix) ? `${prefix}***` : '***',
    );
  }
  return masked;
}

// Домашняя папка в путях: /Users/имя/… и /home/имя/… → ~/…
export function maskHomePaths(text: string): string {
  return text.replace(/\/(?:Users|home)\/[^/\s"']+/g, '~');
}
