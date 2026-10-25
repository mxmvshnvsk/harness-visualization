// Шаг 1. Что такое тул для модели: модель только просит, делает харнесс. Угадайка «кто на
// самом деле ищет» и четыре шага одного вызова из записанной сессии.

import { useState, type ReactElement } from 'react';
import { CourseTerm, Lab, StepShell } from '../rag/course/StepShell';
import { GuessButtons } from '../rag/course/StepMethods';
import shared from '../rag/RagLab.module.css';
import { MCP_ENDING, MCP_STEPS, pretty, type McpStepProps } from './mcpCourseContent';
import styles from './Mcp.module.css';

const WHO = [
  { value: 'model', label: 'модель (DeepSeek)' },
  { value: 'harness', label: 'харнесс' },
  { value: 'server', label: 'MCP-сервер «Кедр Софт»' },
  { value: 'web', label: 'поисковик в интернете' },
] as const;

type Who = (typeof WHO)[number]['value'];

export function StepTool({ course, onStep }: McpStepProps): ReactElement {
  const [guess, setGuess] = useState<Who | null>(null);
  return (
    <StepShell
      index={0}
      steps={MCP_STEPS}
      ending={MCP_ENDING}
      onStep={onStep}
      question="Что такое тул для модели?"
      prose={<ToolProse />}
      lab={
        <Lab
          title="Опыт: кто на самом деле ищет в базе?"
          hint={`Вопрос сотрудника — «${course.question}». Модель решила поискать в базе знаний. Кто выполняет поиск?`}
        >
          <GuessButtons options={WHO} value={guess} onChange={setGuess} />
          {guess === null ? (
            <p className={shared.hint}>
              Выберите ответ — покажем, как это было в настоящей сессии.
            </p>
          ) : (
            <>
              <p className={guess === 'server' ? shared.good : shared.bad}>
                {guess === 'server' ? 'Верно.' : 'Нет.'} Ищет MCP-сервер, а модель только попросила
                — вот четыре шага из записи:
              </p>
              <CallChain course={course} />
            </>
          )}
        </Lab>
      }
      notice={
        <>
          В одном ответе модель может попросить сразу несколько тулов — свои тулы харнесса и тулы
          MCP-сервера вперемешку. Для модели они ничем не отличаются: оба — строчка в списке.
          Разница только у харнесса — кто выполняет.
        </>
      }
      takeaway="Модель только просит, делает харнесс. Тул для модели — это имя, описание и схема параметров в запросе."
    />
  );
}

function ToolProse(): ReactElement {
  return (
    <>
      <p>
        Модель — программа, которая пишет текст. Искать, читать файлы, ходить в интернет она не
        умеет. Всё это делает харнесс, а модели он рассказывает, что умеет, — через{' '}
        <CourseTerm tip="Тул (tool) — действие, которое харнесс предлагает модели: имя, описание и параметры. Модель может попросить его выполнить.">
          тулы
        </CourseTerm>
        .
      </p>
      <p>
        Тул — договорённость: «есть действие search, ему нужен query». Если модели нужно действие,
        она отвечает просьбой, харнесс выполняет и возвращает результат. Это называют{' '}
        <CourseTerm tip="Вызов тулов: модель вместо текста возвращает имя тула и аргументы в JSON. В API DeepSeek — поле tool_calls.">
          tool calling
        </CourseTerm>
        .
      </p>
    </>
  );
}

function CallChain({ course }: { course: McpStepProps['course'] }): ReactElement {
  return (
    <ol className={styles.chain}>
      <ChainStep
        who="харнесс → модели"
        tone="harness"
        title="1. Описание тула"
        note="в каждом запросе к модели"
      >
        <p>
          Харнесс кладёт в запрос список тулов: имя, описание словами и параметры как{' '}
          <CourseTerm tip="Способ описать, какие поля есть у объекта и каких они типов: query — строка, limit — целое от 1 до 20.">
            JSON Schema
          </CourseTerm>
          . По описанию модель решает, когда тул нужен.
        </p>
        <pre className={styles.json}>{pretty(course.toolSchema)}</pre>
      </ChainStep>
      <ChainStep
        who="модель → харнессу"
        tone="model"
        title="2. Просьба"
        note="вместо текста ответа"
      >
        <p>
          Модель не умеет ничего делать — только писать. Поэтому она отвечает не текстом, а
          просьбой: имя тула и аргументы.
        </p>
        <pre className={styles.json}>{pretty(course.toolCalls)}</pre>
      </ChainStep>
      <PolicyAndResult course={course} />
    </ol>
  );
}

function PolicyAndResult({ course }: { course: McpStepProps['course'] }): ReactElement {
  const result = course.toolResult;
  return (
    <>
      <ChainStep
        who="харнесс"
        tone="harness"
        title="3. Проверка и вызов"
        note="политика, потом сервер"
      >
        <p>
          Харнесс проверяет просьбу политикой: «{course.permission?.reason ?? '—'}» →{' '}
          <span className={styles.decision} data-decision={course.permission?.decision}>
            {course.permission?.decision ?? '—'}
          </span>
          . Потом передаёт её тому, кто умеет: свои тулы выполняет сам, а{' '}
          <span className={shared.mono}>{course.calledTool}</span> — MCP-серверу (как именно — на
          шаге 2).
        </p>
      </ChainStep>
      <ChainStep
        who="харнесс → модели"
        tone="harness"
        title="4. Результат"
        note="в следующем запросе"
      >
        <p>
          Ответ сервера — обычный текст. Харнесс кладёт его в следующий запрос сообщением с ролью{' '}
          <span className={shared.mono}>tool</span> и номером просьбы — модель читает и решает, что
          дальше.
        </p>
        <pre className={styles.json}>
          {pretty({
            role: 'tool',
            tool_call_id: result?.toolCallId,
            content: `${(result?.content ?? '').slice(0, 260)}…`,
          })}
        </pre>
      </ChainStep>
    </>
  );
}

interface ChainStepProps {
  who: string;
  tone: 'model' | 'harness' | 'server';
  title: string;
  note: string;
  children: ReactElement | ReactElement[];
}

export function ChainStep({ who, tone, title, note, children }: ChainStepProps): ReactElement {
  return (
    <li>
      <div className={styles.who}>
        <span className={styles.badge} data-tone={tone}>
          {who}
        </span>
        <b>{title}</b>
        <span>{note}</span>
      </div>
      <div className={styles.body}>{children}</div>
    </li>
  );
}
