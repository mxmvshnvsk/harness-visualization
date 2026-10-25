// Тема одной кнопкой-иконкой: по клику авто → светлая → тёмная. Подпись — в подсказке и для
// экранного диктора. Тему меняют редко, поэтому в шапке ей хватает иконки.

import type { ReactElement } from 'react';
import { useTheme, type ThemeChoice } from '../app/theme';
import styles from './ThemeToggle.module.css';

const ORDER: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

export const THEME_TEXT: Record<ThemeChoice, string> = {
  auto: 'тема: как в системе',
  light: 'тема: светлая',
  dark: 'тема: тёмная',
};

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? 'auto';
}

export function ThemeToggle(): ReactElement {
  const [choice, setChoice] = useTheme();
  return <ThemeToggleButton choice={choice} onChange={setChoice} />;
}

// Та же кнопка, когда выбор темы держит родитель (шапка: ещё и пункт в меню «⋯»).
export function ThemeToggleButton(props: {
  choice: ThemeChoice;
  onChange: (choice: ThemeChoice) => void;
}): ReactElement {
  const { choice, onChange: setChoice } = props;
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={`${THEME_TEXT[choice]}, сменить`}
      title={`${THEME_TEXT[choice]} — нажмите, чтобы сменить`}
      onClick={() => {
        setChoice(nextTheme(choice));
      }}
    >
      <ThemeIcon choice={choice} />
    </button>
  );
}

export function ThemeIcon({ choice }: { choice: ThemeChoice }): ReactElement {
  if (choice === 'light') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
    </svg>
  );
}
