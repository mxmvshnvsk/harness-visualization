// Переключатель из нескольких вариантов («Поток / Инспектор / Сырые события»).
// Выбранный вариант подсвечен ползунком, который переезжает к нему.

import { useLayoutEffect, useRef, type ReactElement } from 'react';
import styles from './Segmented.module.css';

interface SegmentedProps<Value extends string> {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}

export function Segmented<Value extends string>(props: SegmentedProps<Value>): ReactElement {
  const { label, options, value, onChange } = props;
  const groupRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (group === null) {
      return undefined;
    }
    const place = (): void => {
      const pressed = group.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (pressed !== null && thumbRef.current !== null) {
        thumbRef.current.style.left = `${String(pressed.offsetLeft)}px`;
        thumbRef.current.style.width = `${String(pressed.offsetWidth)}px`;
      }
    };
    place();
    // Шрифт догружается и меняет ширину кнопок — пересчитываем.
    const observer = new ResizeObserver(place);
    observer.observe(group);
    return () => {
      observer.disconnect();
    };
  }, [value]);
  return (
    <div ref={groupRef} className={styles.group} role="group" aria-label={label}>
      <span ref={thumbRef} className={styles.thumb} aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={option.value === value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
