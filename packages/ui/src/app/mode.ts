// Режим интерфейса: «Обучение» — с вводными, справкой и выводами; «Исследование» — без учебного
// слоя, для разбора своих сессий и записей других харнессов (по мокапу, одобренному автором
// 26.10.2026). Переключается без перезагрузки и запоминается в браузере; data-mode на <html>
// ставит ещё скрипт в index.html до первой отрисовки — учебные блоки не мигают.
// Учебный блок помечается атрибутом data-teaching: в «Исследовании» его прячет global.css.

import { useSyncExternalStore } from 'react';

export type UiMode = 'learn' | 'research';

const STORAGE_KEY = 'hv-mode';
const listeners = new Set<() => void>();
let current: UiMode = readMode();

function readMode(): UiMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'research' ? 'research' : 'learn';
  } catch {
    return 'learn';
  }
}

export function setMode(mode: UiMode): void {
  current = mode;
  document.documentElement.dataset.mode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Хранилище недоступно — режим живёт до перезагрузки.
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMode(): UiMode {
  return useSyncExternalStore(subscribe, () => current);
}
