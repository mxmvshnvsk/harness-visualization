// Шаг 2. Что добавляет MCP: подслушанный разговор харнесса с сервером — знакомство, список
// тулов, вызов — и что из присланного сервером доходит до модели.

import { useState, type ReactElement } from 'react';
import type { McpCourse } from '../../projections/projectMcpCourse';
import { CourseTerm, Lab, StepShell } from '../rag/course/StepShell';
import shared from '../rag/RagLab.module.css';
import {
  describeMessage,
  MCP_ENDING,
  MCP_STEPS,
  pretty,
  type McpStepProps,
} from './mcpCourseContent';
import styles from './Mcp.module.css';

export function StepProtocol({ course, onStep }: McpStepProps): ReactElement {
  return (
    <StepShell
      index={1}
      steps={MCP_STEPS}
      ending={MCP_ENDING}
      onStep={onStep}
      question="Что добавляет MCP?"
      prose={
        <>
          <p>
            Свои тулы — list_files, read_file — харнесс написал сам. А базу знаний «Кедр Софт»
            сделал другой человек, отдельной программой. Чтобы любой харнесс мог взять тулы любой
            такой программы, не переписывая их, есть общий протокол —{' '}
            <CourseTerm tip="Model Context Protocol — открытый протокол, который Anthropic опубликовала в ноябре 2024 года. Его поддерживают многие приложения и харнессы.">
              MCP
            </CourseTerm>
            , Model Context Protocol.
          </p>
          <p>
            Харнесс —{' '}
            <CourseTerm tip="Тот, кто подключается и спрашивает. Здесь — харнесс.">
              клиент
            </CourseTerm>
            , программа с тулами —{' '}
            <CourseTerm tip="Тот, кто отвечает. Здесь — отдельный процесс node с базой знаний.">
              сервер
            </CourseTerm>
            . Харнесс запускает сервер как процесс и обменивается с ним сообщениями{' '}
            <CourseTerm tip="Формат «вопрос — ответ» в JSON: у вопроса есть method и id, у ответа — тот же id и result. Сообщение без id — уведомление, ответа на него нет.">
              JSON-RPC
            </CourseTerm>{' '}
            через его стандартный ввод и вывод.
          </p>
        </>
      }
      lab={<Conversation course={course} />}
      notice={
        <>
          Модель с MCP-сервером не разговаривает никогда: всё идёт через харнесс. Она не знает, что
          сервер существует, — видит только тулы с приставкой {course.serverName}__. Эти сообщения
          харнесс пишет в трейс как события <span className={shared.mono}>mcp_message</span> — их
          видно в «Сырых событиях».
        </>
      }
      takeaway="MCP — общий разъём: харнесс подключает чужие тулы, не переписывая их. Знакомство, список тулов, вызов — трёх видов сообщений хватает для работы."
    />
  );
}

function Conversation({ course }: { course: McpCourse }): ReactElement {
  const [current, setCurrent] = useState(0);
  const [seen, setSeen] = useState(0);
  const message = course.messages[current];
  const listSeen = course.messages.some(
    (item, index) => index <= seen && item.kind === 'response' && item.answers === 'list',
  );
  return (
    <Lab
      title="Опыт: подслушайте разговор харнесса с сервером"
      hint={`${String(course.messages.length)} настоящих сообщений из начала сессии. Нажимайте по порядку — следующее откроется.`}
    >
      <div className={styles.conversation}>
        <ol className={styles.messages}>
          {course.messages.map((item, index) => (
            <li key={index}>
              <button
                type="button"
                aria-pressed={index === current}
                disabled={index > seen + 1}
                onClick={() => {
                  setCurrent(index);
                  setSeen(Math.max(seen, index));
                }}
              >
                <span className={styles.direction}>
                  {item.direction === 'to_server' ? 'харнесс → сервер' : 'сервер → харнесс'}
                </span>
                <span>
                  {describeMessage(item.kind, item.answers, course.serverTools.length).title}
                </span>
              </button>
            </li>
          ))}
        </ol>
        {message !== undefined && (
          <div className={styles.messageBody}>
            <p>
              <b>
                {current + 1}.{' '}
                {describeMessage(message.kind, message.answers, course.serverTools.length).title}.
              </b>{' '}
              {describeMessage(message.kind, message.answers, course.serverTools.length).text}
            </p>
            <pre className={styles.json}>{pretty(message.message)}</pre>
          </div>
        )}
      </div>
      {listSeen && <WhatModelSees course={course} />}
    </Lab>
  );
}

// Что из присланного сервером видит модель: имена с приставкой, схема, скрытые тулы.
function WhatModelSees({ course }: { course: McpCourse }): ReactElement {
  const visible = course.serverTools.filter((tool) => !tool.hiddenFromModel);
  const hidden = course.serverTools.filter((tool) => tool.hiddenFromModel);
  const called = course.serverTools.find((tool) => tool.name === course.calledTool);
  return (
    <div className={shared.tableWrap}>
      <table className={shared.table}>
        <thead>
          <tr>
            <th>что прислал сервер</th>
            <th>что увидит модель</th>
            <th>зачем</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={shared.mono}>{called?.mcpName}</td>
            <td className={shared.mono}>{called?.name}</td>
            <td>приставка — имя сервера: у двух серверов могут быть тулы с одним именем</td>
          </tr>
          <tr>
            <td>описание тула</td>
            <td>«MCP-сервер {course.serverName}.» + то же описание</td>
            <td>модель знает, чей это тул</td>
          </tr>
          <tr>
            <td className={shared.mono}>inputSchema</td>
            <td className={shared.mono}>parameters</td>
            <td>та же схема под именем, которое ждёт API модели; служебное поле $schema убрано</td>
          </tr>
          <tr>
            <td className={shared.mono}>annotations</td>
            <td>—</td>
            <td>пометки модели не нужны, их читает политика харнесса (шаг 4)</td>
          </tr>
          <tr>
            <td>{course.serverTools.length} тулов</td>
            <td>{visible.length}</td>
            <td>
              {hidden.length === 0
                ? 'все тулы сервера видны модели'
                : `${hidden.map((tool) => tool.mcpName).join(', ')} скрыт настройкой hiddenTools в harness.config.json`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
