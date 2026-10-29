// Маршрут новичка (онбординг, блок 3): пять шагов, которые отмечаются сами, когда человек это
// сделал. Хранится в браузере; без хранилища маршрут просто не отмечается. Отметки ставят те
// места, где шаг случается: конец экскурсии, запуск сессии, запуск ветки, лаборатория, трейс
// в режиме «Исследование».

import { useSyncExternalStore } from 'react';

export type RouteStep = 'tour' | 'question' | 'branch' | 'lab' | 'research';

export const ROUTE_STEPS: readonly { id: RouteStep; label: string }[] = [
  { id: 'tour', label: 'Экскурсия по примеру' },
  { id: 'question', label: 'Свой вопрос агенту' },
  { id: 'branch', label: 'Ветка от шага' },
  { id: 'lab', label: 'Одна лаборатория' },
  { id: 'research', label: 'Режим «Исследование»' },
];

const DONE_KEY = 'hv-route-done';
const HIDDEN_KEY = 'hv-route-hidden';
const listeners = new Set<() => void>();

export function markRouteStep(step: RouteStep): void {
  const done = readDone();
  if (done.includes(step)) {
    return;
  }
  write(DONE_KEY, JSON.stringify([...done, step]));
}

export function setRouteHidden(hidden: boolean): void {
  write(HIDDEN_KEY, hidden ? '1' : '0');
}

export interface RouteState {
  done: readonly RouteStep[];
  hidden: boolean;
}

// Снимок — строкой: useSyncExternalStore сравнивает снимки, а строка равна себе по значению.
export function useRoute(): RouteState {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => '[]|0');
  const [done = '[]', hidden = '0'] = snapshot.split('|');
  return { done: parseDone(done), hidden: hidden === '1' };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readSnapshot(): string {
  return `${read(DONE_KEY) ?? '[]'}|${read(HIDDEN_KEY) ?? '0'}`;
}

function readDone(): RouteStep[] {
  return parseDone(read(DONE_KEY) ?? '[]');
}

function parseDone(text: string): RouteStep[] {
  try {
    const value: unknown = JSON.parse(text);
    const known = new Set<string>(ROUTE_STEPS.map((step) => step.id));
    return Array.isArray(value)
      ? value.filter((item): item is RouteStep => typeof item === 'string' && known.has(item))
      : [];
  } catch {
    return [];
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Хранилище недоступно — маршрут не отмечается, остальное работает.
  }
  for (const listener of listeners) {
    listener();
  }
}
