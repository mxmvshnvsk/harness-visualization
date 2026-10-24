// Скачивает страницу с ограничениями: таймаут, размер, число перенаправлений.
// Перенаправления проходим сами (redirect: 'manual'), чтобы проверить каждый адрес:
// иначе безобидная страница могла бы перенаправить на localhost.

import { describeFetchFailure } from '../../http/describeFetchFailure.js';
import type { WebFetchSettings } from '../../settings/settingsSchema.js';
import { ToolError } from '../ToolError.js';
import { assertAllowedUrl } from './assertAllowedUrl.js';

const USER_AGENT =
  'HarnessVisualization/0.1 (learning project; +https://github.com/mxmvshnvsk/harness-visualization)';
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

export interface DownloadedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  downloadedBytes: number;
  // true — страница больше лимита, скачано только начало.
  truncated: boolean;
  redirects: number;
}

export async function downloadPage(
  startUrl: string,
  settings: WebFetchSettings,
): Promise<DownloadedPage> {
  let currentUrl = startUrl;
  for (let redirects = 0; redirects <= settings.maxRedirects; redirects += 1) {
    const allowedUrl = await assertAllowedUrl(currentUrl, settings.allowPrivateNetwork);
    const response = await fetchOnce(allowedUrl, settings.requestTimeoutMs);
    if (REDIRECT_STATUSES.includes(response.status)) {
      currentUrl = resolveRedirectTarget(response, allowedUrl);
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ToolError(`Страница ответила HTTP ${response.status}: ${allowedUrl.toString()}`);
    }
    return readPage(response, allowedUrl, redirects, settings.maxDownloadBytes);
  }
  throw new ToolError(`Слишком много перенаправлений: больше ${settings.maxRedirects}`);
}

async function fetchOnce(url: URL, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ToolError(`Не удалось загрузить ${url.toString()}: ${describeFetchFailure(error)}`);
  }
}

function resolveRedirectTarget(response: Response, currentUrl: URL): string {
  const location = response.headers.get('location');
  if (location === null) {
    throw new ToolError(`Перенаправление без адреса: ${currentUrl.toString()}`);
  }
  // Адрес в Location может быть относительным: /new-page.
  return new URL(location, currentUrl).toString();
}

async function readPage(
  response: Response,
  url: URL,
  redirects: number,
  maxBytes: number,
): Promise<DownloadedPage> {
  const contentType = response.headers.get('content-type') ?? 'unknown';
  const body = await readLimitedBody(response, maxBytes);
  return {
    finalUrl: url.toString(),
    status: response.status,
    contentType,
    text: decodeText(body.bytes, contentType),
    downloadedBytes: body.bytes.byteLength,
    truncated: body.truncated,
    redirects,
  };
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Buffer; truncated: boolean }> {
  if (response.body === null) {
    return { bytes: Buffer.alloc(0), truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let truncated = false;
  let chunk = await reader.read();
  while (!chunk.done) {
    chunks.push(chunk.value);
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
    chunk = await reader.read();
  }
  return { bytes: Buffer.concat(chunks).subarray(0, maxBytes), truncated };
}

// Кодировка берётся из Content-Type (charset=windows-1251 и т. п.), по умолчанию — UTF-8.
function decodeText(bytes: Buffer, contentType: string): string {
  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charset = charsetMatch?.[1]?.trim().replaceAll('"', '') ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
