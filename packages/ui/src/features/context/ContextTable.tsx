// Табличный вид тех же данных — для точных чисел и для тех, кому график читать неудобно.

import type { ReactElement } from 'react';
import { requestLabel, type ContextRequest } from '../../projections/projectContext';
import styles from './Context.module.css';
import {
  actionsOf,
  cachePercent,
  errorPercent,
  formatTokens,
  PARTS,
  partTokens,
} from './contextScale';

interface ContextTableProps {
  requests: readonly ContextRequest[];
  shown: number;
  selected: string | null;
  onSeek: (request: ContextRequest) => void;
}

export function ContextTable({
  requests,
  shown,
  selected,
  onSeek,
}: ContextTableProps): ReactElement {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>запрос</th>
            {PARTS.map((part) => (
              <th key={part.key}>{part.label}</th>
            ))}
            <th>оценка</th>
            <th>точно</th>
            <th>ошибка</th>
            <th>кэш</th>
            <th>харнесс перед запросом</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <Row
              key={request.requestId}
              request={request}
              future={request.index >= shown}
              selected={request.requestId === selected}
              onSeek={onSeek}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps {
  request: ContextRequest;
  future: boolean;
  selected: boolean;
  onSeek: (request: ContextRequest) => void;
}

function Row({ request, future, selected, onSeek }: RowProps): ReactElement {
  const { estimate } = request.budget;
  const error = errorPercent(request);
  const cache = cachePercent(request);
  return (
    <tr
      data-future={future ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      onClick={() => {
        onSeek(request);
      }}
    >
      <td>{requestLabel(request)}</td>
      {PARTS.map((part) => (
        <td key={part.key}>{formatTokens(partTokens(estimate, part.key))}</td>
      ))}
      <td>{formatTokens(estimate.total)}</td>
      <td>{request.exactTokens === null ? '—' : formatTokens(request.exactTokens)}</td>
      <td>{error === null ? '—' : `${String(error)} %`}</td>
      <td>{cache === null ? '—' : `${String(cache)} %`}</td>
      <td>{actionsOf(request).join('; ') || '—'}</td>
    </tr>
  );
}
