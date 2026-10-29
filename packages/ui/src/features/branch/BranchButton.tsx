// «⑂ Ветка отсюда» в заголовке карточки шага инспектора.

import type { ReactElement } from 'react';
import { useBranching } from './BranchContext';
import styles from './Branch.module.css';

export function BranchButton({ requestId }: { requestId: string | null }): ReactElement | null {
  const branching = useBranching();
  const step = branching?.stepOf(requestId) ?? null;
  if (branching === null || step === null) {
    return null;
  }
  return (
    <button
      type="button"
      className={styles.fork}
      data-branch-request={requestId}
      title="Шаги до этого — replay из трейса, с этого — новый прогон"
      onClick={(event) => {
        event.stopPropagation();
        branching.open(step);
      }}
    >
      ⑂ Ветка отсюда
    </button>
  );
}
