// Переключатель из нескольких вариантов («Инспектор / Сырые события»).

import type { ReactElement } from 'react';
import styles from './Segmented.module.css';

interface SegmentedProps<Value extends string> {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}

export function Segmented<Value extends string>(props: SegmentedProps<Value>): ReactElement {
  const { label, options, value, onChange } = props;
  return (
    <div className={styles.group} role="group" aria-label={label}>
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
