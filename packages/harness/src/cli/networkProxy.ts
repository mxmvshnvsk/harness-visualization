// Прокси из переменных окружения (HTTPS_PROXY и т. п.).
// curl и многие программы используют их сами, а встроенный fetch в Node — только
// если задано NODE_USE_ENV_PROXY=1. Без этого запросы идут мимо прокси напрямую,
// и сервис, доступный через прокси (например, через VPN), отвечает отказом.
// Команда pnpm chat задаёт NODE_USE_ENV_PROXY=1 сама.

const PROXY_VARIABLES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

export interface ProxyStatus {
  // Адрес прокси из окружения, логин и пароль скрыты; null — прокси не задан.
  proxyUrl: string | null;
  // true — Node отправляет запросы через этот прокси.
  enabledForNode: boolean;
}

export function readProxyStatus(): ProxyStatus {
  const rawProxyUrl = PROXY_VARIABLES.map((name) => process.env[name]).find(
    (value) => value !== undefined && value !== '',
  );
  return {
    proxyUrl: rawProxyUrl === undefined ? null : hideCredentials(rawProxyUrl),
    enabledForNode: process.env['NODE_USE_ENV_PROXY'] === '1',
  };
}

function hideCredentials(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username !== '' || parsed.password !== '') {
      parsed.username = '***';
      parsed.password = '';
    }
    return parsed.toString();
  } catch {
    return '***';
  }
}
