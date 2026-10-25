// Выезжающая слева панель поверх экрана: закрывается фоном, кнопкой и Escape.

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import styles from './Drawer.module.css';

interface DrawerProps {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function Drawer({ open, label, onClose, children }: DrawerProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    // Фокус — в панель, чтобы клавиатура сразу работала внутри неё.
    panelRef.current?.querySelector<HTMLElement>('textarea, button, [href], input')?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <>
      <div className={styles.scrim} data-open={open} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        inert={!open}
      >
        <div className={styles.head}>
          <span className={styles.label}>{label}</span>
          <button type="button" className={styles.close} onClick={onClose}>
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
