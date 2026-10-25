// Выбор темы: авто (по системе), светлая, тёмная. Хранится в браузере; data-theme на <html>
// ставит ещё скрипт в index.html до первой отрисовки, здесь — при смене выбора и смене системной.

import { useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'hv-theme';
const SYSTEM_DARK = '(prefers-color-scheme: dark)';

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'auto' && window.matchMedia(SYSTEM_DARK).matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState(readChoice);
  useEffect(() => {
    apply(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Хранилище недоступно — выбор живёт до перезагрузки.
    }
    if (choice !== 'auto') {
      return undefined;
    }
    // «Авто» следует за системой и тогда, когда её переключили при открытой странице.
    const media = window.matchMedia(SYSTEM_DARK);
    const onChange = (): void => {
      apply('auto');
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [choice]);
  return [choice, setChoice];
}
