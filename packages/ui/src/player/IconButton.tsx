// Круглая кнопка с иконкой — для плеера и зума ленты.

import type { ReactElement } from 'react';
import styles from './PlayerBar.module.css';

interface IconButtonProps {
  label: string;
  path: string;
  onClick: () => void;
  primary?: boolean;
}

export function IconButton({
  label,
  path,
  onClick,
  primary = false,
}: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={primary ? `${styles.icon} ${styles.primary}` : styles.icon}
      aria-label={label}
      title={label}
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
