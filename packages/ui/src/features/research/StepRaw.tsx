// Сырое: ровно то, что ушло и пришло по сети. Тело запроса — model_request.body, ответ —
// model_response.body (поток собран в один объект), заголовки — с ключом, скрытым ещё при записи.
// Длинные строки по умолчанию свёрнуты; «копировать» берёт JSON целиком.

import { useState, type ReactElement } from 'react';
import { Segmented } from '../../components/Segmented';
import type { ResearchStep } from '../../projections/projectResearch';
import { formatSeconds } from './StepsView';
import styles from './Research.module.css';

const PARTS = [
  { value: 'request', label: 'запрос' },
  { value: 'response', label: 'ответ' },
  { value: 'headers', label: 'заголовки и сеть' },
] as const;

type Part = (typeof PARTS)[number]['value'];

// Строки длиннее — свёрнуты до начала и пометки, сколько символов спрятано.
const FOLD_AT = 240;

export function StepRaw({ step }: { step: ResearchStep }): ReactElement {
  const [part, setPart] = useState<Part>('request');
  const [folded, setFolded] = useState(true);
  const value = valueOf(step, part);
  const full = JSON.stringify(value, null, 2);
  return (
    <div className={styles.body}>
      <div className={styles.rawBar}>
        <Segmented label="Часть" size="small" options={PARTS} value={part} onChange={setPart} />
        <span className={styles.compare}>
          <button
            type="button"
            className={styles.chip}
            aria-pressed={folded}
            onClick={() => setFolded(!folded)}
          >
            свернуть длинное
          </button>
          <CopyButton text={full} />
        </span>
      </div>
      <pre className={styles.json}>{folded ? JSON.stringify(value, foldLong, 2) : full}</pre>
      <p className={styles.muted}>
        {part === 'response' && step.response?.timing
          ? `Поток: первый токен ${formatSeconds(step.response.timing.firstTokenMs ?? 0)}, ответ с ${formatSeconds(step.response.timing.firstAnswerTokenMs ?? 0)}, кусков ${String(step.response.timing.chunks)}. `
          : ''}
        Поиск по тексту — поиском браузера (⌘F): свёрнутое не ищется, разверните.
      </p>
    </div>
  );
}

function valueOf(step: ResearchStep, part: Part): unknown {
  if (part === 'request') {
    return step.request.body;
  }
  if (part === 'response') {
    return step.response?.body ?? step.error?.body ?? null;
  }
  return headersOf(step);
}

// Заголовки, маршрут по сети и итог запроса — одним объектом.
function headersOf(step: ResearchStep): Record<string, unknown> {
  const { network } = step;
  const outcome = step.response ?? step.error;
  return {
    method: step.request.method,
    url: step.request.url,
    headers: step.request.headers,
    network:
      network === null
        ? null
        : {
            host: network.host,
            route: network.route,
            viaProxy: network.viaProxy,
            rule: network.rule,
            proxyUrl: network.proxyUrl,
          },
    status: outcome?.status ?? null,
    durationMs: outcome?.durationMs ?? null,
  };
}

function foldLong(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.length > FOLD_AT) {
    return `${value.slice(0, FOLD_AT)}… [+${String(value.length - FOLD_AT)} симв.]`;
  }
  return value;
}

function CopyButton({ text }: { text: string }): ReactElement {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={styles.chip}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'скопировано' : 'копировать JSON'}
    </button>
  );
}
