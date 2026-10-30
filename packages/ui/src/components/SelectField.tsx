import { useId, type ReactElement } from 'react';
import styles from './SelectField.module.css';

interface SelectOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

interface SelectFieldProps<Value extends string> {
  label: string;
  accessibleLabel?: string;
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
  disabled?: boolean;
  hint?: string;
  width?: number;
  hideLabel?: boolean;
}

// Один вид и одна геометрия для селекторов модели, effort, поиска и оркестрации.
// Шеврон центрируется относительно самого select, отдельно от подписи поля.
export function SelectField<Value extends string>(props: SelectFieldProps<Value>): ReactElement {
  const id = useId();
  return (
    <label className={styles.field} style={{ width: props.width ?? 330 }} title={props.hint}>
      <span className={styles.label} hidden={props.hideLabel}>
        {props.label}
      </span>
      <span className={styles.control}>
        <select
          id={id}
          className={styles.select}
          aria-label={props.accessibleLabel ?? props.label}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => {
            const option = props.options.find((item) => item.value === event.target.value);
            if (option !== undefined && !option.disabled) {
              props.onChange(option.value);
            }
          }}
        >
          {props.options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className={styles.chevron}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}
