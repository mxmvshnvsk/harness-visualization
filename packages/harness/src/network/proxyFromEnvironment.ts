// Прокси из переменных окружения (HTTPS_PROXY и т. п.).
// Харнесс читает адрес сам и применяет его только к запросам с маршрутом proxy
// (см. NetworkRouter), поэтому NODE_USE_ENV_PROXY для pnpm chat больше не нужен.

const PROXY_VARIABLES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];

// Адрес прокси как есть, с логином и паролем, если они заданы; null — прокси нет.
export function readProxyUrl(): string | null {
  const proxyUrl = PROXY_VARIABLES.map((name) => process.env[name]).find(
    (value) => value !== undefined && value !== '',
  );
  return proxyUrl ?? null;
}

// Для трейса и консоли: логин и пароль в адресе прокси скрываются.
export function maskProxyUrl(proxyUrl: string): string {
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
