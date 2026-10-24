// Сопоставление путей и адресов с шаблонами из правил политики.
//   Пути:   regulations/**    — всё внутри папки regulations, на любой глубине
//           notes/*.md        — md-файлы прямо в notes
//   Адреса: example.com       — ровно этот адрес
//           *.example.com     — любой поддомен example.com

import { posix } from 'node:path';

const ANY_DEPTH = '**';
const ANY_NAME = '*';
const SUBDOMAIN_PREFIX = '*.';

export function matchesPathPattern(path: string, pattern: string): boolean {
  return buildPathRegExp(normalizePath(pattern)).test(normalizePath(path));
}

export function matchesHostPattern(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.startsWith(SUBDOMAIN_PREFIX)) {
    const parentDomain = normalizedPattern.slice(SUBDOMAIN_PREFIX.length);
    return normalizedHost.endsWith(`.${parentDomain}`);
  }
  return normalizedHost === normalizedPattern;
}

// ./notes/a.md, notes/a.md и notes/../notes/a.md — один и тот же путь.
// Без нормализации правило «regulations/**» можно было бы обойти путём
// notes/../regulations/vacation.md: песочница его примет, а шаблон — нет.
function normalizePath(path: string): string {
  return posix.normalize(path.replaceAll('\\', '/'));
}

// Шаблон переводится в регулярное выражение по частям между слешами:
// ** — любое число папок, * — любые символы, кроме слеша, остальное — как есть.
function buildPathRegExp(pattern: string): RegExp {
  const parts = pattern.split('/').map((part) => {
    if (part === ANY_DEPTH) {
      return '.*';
    }
    return part.split(ANY_NAME).map(escapeRegExp).join('[^/]*');
  });
  return new RegExp(`^${parts.join('/')}$`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
