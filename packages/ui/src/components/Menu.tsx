// Выпадающее меню у кнопки: открывается по клику, закрывается выбором, кликом мимо и Escape.

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  hint?: string;
  // Выбор одного из вариантов: у выбранного — галочка.
  checked?: boolean;
  onSelect: () => void;
}

export interface MenuSection {
  title?: string;
  items: MenuItem[];
}

interface MenuProps {
  // Содержимое кнопки и подпись для экранного диктора.
  trigger: ReactNode;
  label: string;
  sections: MenuSection[];
  // icon — круглая кнопка без подписи; small — кнопка поменьше, для формы.
  shape?: 'pill' | 'icon' | 'small';
  // К какому краю кнопки прижато меню.
  align?: 'left' | 'right';
}

export function Menu(props: MenuProps): ReactElement {
  const { trigger, label, sections, shape = 'pill', align = 'right' } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        data-shape={shape}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={shape === 'icon' ? label : undefined}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open && (
        <MenuList
          label={label}
          align={align}
          sections={sections}
          onDone={() => {
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MenuList(props: {
  label: string;
  align: 'left' | 'right';
  sections: MenuSection[];
  onDone: () => void;
}): ReactElement {
  return (
    <div className={styles.menu} data-align={props.align} role="menu" aria-label={props.label}>
      {props.sections.map((section, index) => (
        <div key={section.title ?? index} className={styles.section}>
          {section.title !== undefined && <span className={styles.title}>{section.title}</span>}
          {section.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              data-checkable={item.checked !== undefined}
              onClick={() => {
                props.onDone();
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint !== undefined && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
