// «Отпечаток» вектора: все его числа полосками. Цвет — знак (два полюса палитры
// лаборатории), насыщенность — величина относительно самого большого числа.

import type { ReactElement } from 'react';
import { formatSimilarity } from './retrievalLabels';
import styles from './Retrieval.module.css';

interface FingerprintProps {
  label: string;
  vector: readonly number[];
  similarity?: number;
}

export function Fingerprint({ label, vector, similarity }: FingerprintProps): ReactElement {
  const max = Math.max(...vector.map((value) => Math.abs(value)), 1e-9);
  return (
    <div className={styles.fingerprint}>
      <span className={styles.fingerprintLabel}>
        {label}
        {similarity !== undefined && (
          <span className={styles.number}>
            {' '}
            · косинус с запросом {formatSimilarity(similarity)}
          </span>
        )}
      </span>
      <svg
        viewBox={`0 0 ${String(vector.length)} 1`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: вектор из ${String(vector.length)} чисел`}
      >
        {vector.map((value, index) => (
          <rect
            key={index}
            x={index}
            y={0}
            width={1}
            height={1}
            fill={value >= 0 ? 'var(--rag-regulation)' : 'var(--rag-faq)'}
            opacity={0.15 + 0.85 * (Math.abs(value) / max)}
          />
        ))}
      </svg>
    </div>
  );
}
