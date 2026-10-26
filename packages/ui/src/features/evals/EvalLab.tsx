// Лаборатория evals (этап 8e): как понять, что агент стал лучше, а не «вроде лучше».
// Четыре вкладки по мокапу, одобренному автором: из чего eval, набор задач, прогон и когда
// гоняют. Прогон — настоящий отчёт pnpm run eval из traces/evals/, без придуманных цифр.

import { useState, type ReactElement } from 'react';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { ThemeToggle } from '../../components/ThemeToggle';
import { HelpButton } from '../../help/HelpLinks';
import labStyles from '../rag/RagLab.module.css';
import { EvalAnatomy } from './EvalAnatomy';
import { EVAL_TABS, type EvalTab } from './evalContent';
import { EvalRun } from './EvalRun';
import { EvalTasks } from './EvalTasks';
import { EvalWhen } from './EvalWhen';
import { useEvals } from './useEvals';

interface EvalLabProps {
  backLabel: string;
  onBack: () => void;
  onOpenTrace: (file: string) => void;
}

export function EvalLab({ backLabel, onBack, onOpenTrace }: EvalLabProps): ReactElement {
  const [tab, setTab] = useState<EvalTab>('anatomy');
  const evals = useEvals();
  return (
    <div className={labStyles.screen}>
      <header className={labStyles.top}>
        <Button variant="quiet" onClick={onBack}>
          {backLabel}
        </Button>
        <ThemeToggle />
      </header>
      <div>
        <h1 className={labStyles.title}>Лаборатория Evals</h1>
        <p className={labStyles.lead} data-teaching>
          Как понять, что агент стал лучше, а не «вроде лучше»: набор задач, несколько попыток на
          каждую, проверки по трейсу и итог по конфигурациям. Задачи — из настоящих уроков стенда
          «Кедр Софт». <HelpButton topic="evals" />
        </p>
      </div>
      <div className={labStyles.tabs}>
        <Segmented label="Раздел" options={EVAL_TABS} value={tab} onChange={setTab} />
      </div>
      <EvalTabView tab={tab} evals={evals} onOpenTrace={onOpenTrace} />
    </div>
  );
}

function EvalTabView(props: {
  tab: EvalTab;
  evals: ReturnType<typeof useEvals>;
  onOpenTrace: (file: string) => void;
}): ReactElement {
  const { tab, evals, onOpenTrace } = props;
  switch (tab) {
    case 'anatomy':
      return <EvalAnatomy />;
    case 'when':
      return <EvalWhen />;
    default:
      break;
  }
  if (evals.status !== 'ready') {
    return (
      <div className={labStyles.card}>
        <p className={evals.status === 'error' ? labStyles.bad : labStyles.hint}>
          {evals.status === 'loading' ? 'Загружаем наборы задач и прогоны…' : evals.message}
        </p>
      </div>
    );
  }
  return tab === 'tasks' ? (
    <EvalTasks sets={evals.value.sets} />
  ) : (
    <EvalRun reports={evals.value.reports} onOpenTrace={onOpenTrace} />
  );
}
