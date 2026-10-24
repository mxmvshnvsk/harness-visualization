// Прячет секреты в заголовках перед записью в трейс и выводом на экран.

const SECRET_HEADER_NAMES = ['authorization', 'x-api-key', 'api-key'];
const MASKED_VALUE = '***';

export function maskSecretHeaders(headers: Record<string, string>): Record<string, string> {
  const maskedHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    maskedHeaders[name] = isSecretHeader(name) ? maskValue(value) : value;
  }
  return maskedHeaders;
}

function isSecretHeader(headerName: string): boolean {
  return SECRET_HEADER_NAMES.includes(headerName.toLowerCase());
}

// Схему авторизации оставляем видимой: «Bearer ***» понятнее, чем просто «***».
function maskValue(value: string): string {
  const [scheme] = value.split(' ');
  if (scheme === 'Bearer' || scheme === 'Basic') {
    return `${scheme} ${MASKED_VALUE}`;
  }
  return MASKED_VALUE;
}
