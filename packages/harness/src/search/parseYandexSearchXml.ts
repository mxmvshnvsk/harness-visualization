// Разбирает XML-выдачу Яндекса в наш нейтральный список результатов.
// Внутри заголовков и фрагментов Яндекс выделяет слова запроса тегом <hlword>,
// поэтому берём весь текст элемента — выделение пропадает, слова остаются.

import { DOMParser } from 'linkedom';
import { ToolError } from '../tools/ToolError.js';
import type { SearchResult } from './searchProvider.js';

// Код 15 значит «ничего не найдено» — это не сбой, а пустая выдача.
const NOTHING_FOUND_ERROR_CODE = '15';

export function parseYandexSearchXml(xml: string): SearchResult[] {
  const document = parseXmlDocument(xml);
  const errorElement = document.querySelector('response > error');
  if (errorElement !== null) {
    if (errorElement.getAttribute('code') === NOTHING_FOUND_ERROR_CODE) {
      return [];
    }
    throw new ToolError(`Яндекс вернул ошибку: ${readText(errorElement)}`);
  }
  return [...document.querySelectorAll('doc')].map(toSearchResult);
}

// Ровно те возможности XML-элемента, которыми мы пользуемся.
// Свой маленький тип проще и честнее, чем подгонять типы linkedom под браузерный Document.
interface XmlSearchable {
  querySelector(selector: string): XmlElement | null;
  querySelectorAll(selector: string): Iterable<XmlElement>;
}

interface XmlElement extends XmlSearchable {
  getAttribute(name: string): string | null;
  readonly textContent: string | null;
}

function parseXmlDocument(xml: string): XmlSearchable {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function toSearchResult(documentElement: XmlElement): SearchResult {
  const passages = [...documentElement.querySelectorAll('passages > passage')].map(readText);
  const headline = readChildText(documentElement, 'headline');
  return {
    title: readChildText(documentElement, 'title'),
    url: readChildText(documentElement, 'url'),
    snippet: passages.length > 0 ? passages.join(' … ') : headline,
    score: null,
  };
}

function readChildText(parent: XmlElement, tagName: string): string {
  const child = parent.querySelector(tagName);
  return child === null ? '' : readText(child);
}

function readText(element: XmlElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}
