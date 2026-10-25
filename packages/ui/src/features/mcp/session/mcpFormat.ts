// Подписи вида «MCP»: время, размер, о чём сообщение протокола.

import type { McpPair } from '../../../projections/projectMcp';

export function formatMs(value: number): string {
  return value < 1000
    ? `${String(Math.round(value))} мс`
    : `${(value / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`;
}

export function formatKb(chars: number): string {
  return `${(chars / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} КБ`;
}

const ABOUT: Record<string, string> = {
  initialize: 'знакомство: кто я, версия протокола',
  'notifications/initialized': 'уведомление, без ответа',
  'tools/list': 'какие у тебя тулы?',
};

// Что спросили и что ответили — одной строкой.
export function describePair(pair: McpPair): string {
  const params = field(pair.request, 'params');
  const question =
    pair.method === 'tools/call'
      ? `${String(field(params, 'name'))} ${JSON.stringify(field(params, 'arguments') ?? {})}`
      : (ABOUT[pair.method] ?? '');
  const answer =
    pair.response === null ? '' : describeResult(field(pair.response.message, 'result'));
  return answer === '' ? question : `${question} ← ${answer}`;
}

function describeResult(result: unknown): string {
  const tools = field(result, 'tools');
  if (Array.isArray(tools)) {
    return `${String(tools.length)} тулов`;
  }
  const info = field(result, 'serverInfo');
  if (info !== undefined) {
    return `${String(field(info, 'name'))} ${String(field(info, 'version'))}`;
  }
  if (field(result, 'isError') === true) {
    return 'ошибка';
  }
  return field(result, 'content') === undefined ? '' : 'текст';
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}
