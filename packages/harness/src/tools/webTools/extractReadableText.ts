// Превращает HTML-страницу в текст, удобный модели.
// Readability (та же библиотека, что в режиме чтения Firefox) находит основной текст
// и отбрасывает меню, рекламу и подвал, а node-html-markdown переводит его в Markdown —
// заголовки и ссылки сохраняются, а токенов уходит во много раз меньше, чем на HTML.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { NodeHtmlMarkdown } from 'node-html-markdown';

export interface ReadablePage {
  title: string | null;
  text: string;
  // false — Readability не нашла основной текст, взят весь текст страницы.
  mainContentExtracted: boolean;
}

export function extractReadableText(html: string): ReadablePage {
  const { document } = parseHTML(html);
  const pageTitle = document.title.trim() === '' ? null : document.title.trim();
  const article = new Readability(document).parse();
  const articleHtml = article?.content ?? '';
  if (articleHtml !== '') {
    return {
      title: article?.title ?? pageTitle,
      text: NodeHtmlMarkdown.translate(articleHtml).trim(),
      mainContentExtracted: true,
    };
  }
  const bodyText = document.body.textContent ?? '';
  return {
    title: pageTitle,
    text: bodyText.replace(/\s+/g, ' ').trim(),
    mainContentExtracted: false,
  };
}
