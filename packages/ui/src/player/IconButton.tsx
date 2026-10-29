// Круглая кнопка с иконкой — для плеера и зума ленты.

import type { ReactElement } from 'react';
import styles from './PlayerBar.module.css';

interface IconButtonProps {
  label: string;
  path: string;
  onClick: () => void;
  primary?: boolean;
  // Метка для экскурсии: её «Попробуйте» подсвечивает этот элемент.
  tour?: string;
}

export function IconButton({
  label,
  path,
  onClick,
  primary = false,
  tour,
}: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={primary ? `${styles.icon} ${styles.primary}` : styles.icon}
      aria-label={label}
      title={label}
      data-tour-control={tour}
      onClick={onClick}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </button>
  );
}
