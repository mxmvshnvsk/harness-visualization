// Лаборатория MCP: учебный маршрут про тулы и MCP — что такое тул для модели, как харнесс
// говорит с MCP-сервером, сколько стоят тулы и можно ли верить серверу. Всё — на настоящих
// событиях записанной сессии (examples/traces).

import type { ReactElement } from 'react';
import type { CourseLabProps } from '../rag/RagLab';
import { useCourseStep } from '../useCourseStep';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/Button';
import type { McpCourse } from '../../projections/projectMcpCourse';
import { CourseNav } from '../rag/course/StepShell';
import styles from '../rag/RagLab.module.css';
import { MCP_STEPS } from './mcpCourseContent';
import { StepCost } from './StepCost';
import { StepProtocol } from './StepProtocol';
import { StepTool } from './StepTool';
import { StepTrust } from './StepTrust';
import { useMcpCourse } from './useMcpCourse';

export function McpLab({
  backLabel,
  onBack,
  step: initialStep,
  onStepChange,
}: CourseLabProps): ReactElement {
  const course = useMcpCourse();
  const [step, go] = useCourseStep(MCP_STEPS, initialStep, onStepChange);
  return (
    <div className={styles.screen}>
      <header className={styles.top}>
        <Button variant="quiet" onClick={onBack}>
          {backLabel}
        </Button>
        <ThemeToggle />
      </header>
      <div>
        <h1 className={styles.title}>Лаборатория MCP</h1>
        <p className={styles.lead} data-teaching>
          Как модель пользуется тулами, что меняет MCP и чем за это платят. Четыре шага на настоящих
          сообщениях протокола из записанной сессии
          {course.status === 'ready' && <span className={styles.mono}> {course.value.file}</span>}.
        </p>
      </div>
      <CourseNav steps={MCP_STEPS} current={step} onStep={go} />
      <div className={styles.card}>
        {course.status === 'ready' ? (
          <McpStep index={step} course={course.value} onStep={go} />
        ) : (
          <p className={course.status === 'error' ? styles.bad : styles.hint}>
            {course.status === 'loading' ? 'Загружаем запись сессии…' : course.message}
          </p>
        )}
      </div>
    </div>
  );
}

interface McpStepProps {
  index: number;
  course: McpCourse;
  onStep: (index: number) => void;
}

function McpStep({ index, course, onStep }: McpStepProps): ReactElement {
  switch (MCP_STEPS[index]?.id) {
    case 'protocol':
      return <StepProtocol course={course} onStep={onStep} />;
    case 'cost':
      return <StepCost course={course} onStep={onStep} />;
    case 'trust':
      return <StepTrust course={course} onStep={onStep} />;
    default:
      return <StepTool course={course} onStep={onStep} />;
  }
}
