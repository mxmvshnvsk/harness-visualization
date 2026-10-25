// Опция-«таблетка» с галочкой: нажата — включено. soon — опция появится позже: видно её
// и этап, но нажать нельзя. Пояснение — подсказкой при наведении и фокусе.

import type { ReactElement } from 'react';
import styles from './TogglePill.module.css';

interface TogglePillProps {
  label: string;
  hint: string;
  pressed: boolean;
  // Этап, на котором опция появится; есть — опция выключена.
  soon?: string;
  onChange?: (pressed: boolean) => void;
}

export function TogglePill({
  label,
  hint,
  pressed,
  soon,
  onChange,
}: TogglePillProps): ReactElement {
  const disabled = soon !== undefined;
  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.pill}
        aria-pressed={disabled ? undefined : pressed}
        disabled={disabled}
        onClick={() => {
          onChange?.(!pressed);
        }}
      >
        {!disabled && (
          <span className={styles.tick} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        {label}
        {disabled && <small className={styles.soon}>{soon}</small>}
      </button>
      <span className={styles.hint} role="tooltip">
        {hint}
      </span>
    </span>
  );
}
