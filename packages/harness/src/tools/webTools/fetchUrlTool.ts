// Тул fetch_url: загружает страницу по ссылке и возвращает её основной текст.

import { z } from 'zod';
import type { WebFetchSettings } from '../../settings/settingsSchema.js';
import { defineTool } from '../defineTool.js';
import { ToolError } from '../ToolError.js';
import type { Tool } from '../toolTypes.js';
import { downloadPage, type DownloadedPage } from './downloadPage.js';
import { extractReadableText } from './extractReadableText.js';

const PLAIN_TEXT_TYPES = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];

interface PageText {
  title: string | null;
  text: string;
  mainContentExtracted: boolean;
}

export function createFetchUrlTool(settings: WebFetchSettings): Tool {
  return defineTool({
    name: 'fetch_url',
    description:
      'Загружает страницу по ссылке и возвращает её основной текст в Markdown. ' +
      `Длинные страницы обрезаются до ${settings.maxCharacters} символов. ` +
      'Адреса локальной сети загружать нельзя.',
    argumentsSchema: z.object({
      url: z.url().describe('Полный адрес страницы, например https://example.com/article'),
    }),
    effects: ['network'],
    describeAction: (toolArguments) => `Загрузить страницу ${toolArguments.url}`,
    targets: (toolArguments) => [{ kind: 'host', host: new URL(toolArguments.url).hostname }],
    async execute(toolArguments) {
      const page = await downloadPage(toolArguments.url, settings);
      const pageText = convertToText(page);
      const fullText = composeContent(page, pageText);
      const content = truncate(fullText, settings.maxCharacters);
      return {
        content,
        details: {
          finalUrl: page.finalUrl,
          httpStatus: page.status,
          contentType: page.contentType,
          redirects: page.redirects,
          downloadedBytes: page.downloadedBytes,
          downloadTruncated: page.truncated,
          mainContentExtracted: pageText.mainContentExtracted,
          extractedCharacters: fullText.length,
          returnedCharacters: content.length,
        },
      };
    },
  });
}

function convertToText(page: DownloadedPage): PageText {
  const mimeType = page.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') {
    return extractReadableText(page.text);
  }
  if (PLAIN_TEXT_TYPES.includes(mimeType)) {
    return { title: null, text: page.text, mainContentExtracted: false };
  }
  throw new ToolError(
    `Тип содержимого ${page.contentType} не поддерживается — это не текстовая страница`,
  );
}

function composeContent(page: DownloadedPage, pageText: PageText): string {
  const header = [`Источник: ${page.finalUrl}`];
  if (pageText.title !== null) {
    header.unshift(`# ${pageText.title}`);
  }
  if (page.truncated) {
    header.push('[Страница слишком большая: скачано только начало]');
  }
  return `${header.join('\n')}\n\n${pageText.text}`;
}

function truncate(text: string, maxCharacters: number): string {
  if (text.length <= maxCharacters) {
    return text;
  }
  return `${text.slice(0, maxCharacters)}\n\n[Текст обрезан: показано ${maxCharacters} из ${text.length} символов]`;
}
