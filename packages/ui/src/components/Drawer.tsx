// Выезжающая панель поверх экрана: закрывается фоном, кнопкой и Escape. Слева — «Сессии
// и трейсы»; справа — панель ветки (этап 9): трейс под ней остаётся виден.

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import styles from './Drawer.module.css';

interface DrawerProps {
  open: boolean;
  label: string;
  onClose: () => void;
  side?: 'left' | 'right';
  children: ReactNode;
}

export function Drawer({
  open,
  label,
  onClose,
  side = 'left',
  children,
}: DrawerProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  // Содержимое рисуем с первого открытия и дальше держим (сохраняется набранное), а до него —
  // нет: закрытая панель иначе перерисовывала бы, например, весь список трейсов при каждом
  // обновлении экрана под ней.
  const [opened, setOpened] = useState(open);
  if (open && !opened) {
    setOpened(true);
  }
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
        data-side={side}
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
        {opened && children}
      </div>
    </>
  );
}
