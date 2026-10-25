// Кнопка-«таблетка». accent — главное действие экрана (одно!), ink — второстепенное,
// danger — отказ, quiet — справка и мелочи.

import type { ButtonHTMLAttributes, ReactElement } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'accent' | 'ink' | 'danger' | 'quiet';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'quiet', className, ...props }: ButtonProps): ReactElement {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return <button type="button" className={classes} {...props} />;
}
