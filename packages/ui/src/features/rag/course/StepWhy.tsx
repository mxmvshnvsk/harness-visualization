// Шаг 1. Зачем агенту искать: модель не видела документов компании — харнесс подкладывает куски.

import type { LabBase } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import styles from '../RagLab.module.css';
import { CourseTerm, Lab, StepShell } from './StepShell';

interface StepProps {
  base: LabBase;
  onStep: (index: number) => void;
}

const QUESTION = 'Сколько дней в неделю можно работать из дома?';

export function StepWhy({ base, onStep }: StepProps): ReactElement {
  const [found, setFound] = useState(false);
  const regulation = lineWith(base, 'regulations/remoteWork', 'до трёх дней');
  const faq = lineWith(base, 'faq/hrFaq', 'До двух дней');
  return (
    <StepShell
      index={0}
      onStep={onStep}
      question="Зачем агенту искать в документах?"
      prose={
        <>
          <p>
            Модель — программа, которая выучила язык по огромному количеству текстов из интернета.
            Она много знает «вообще», но документов «Кедр Софт» не видела никогда: их не было в
            интернете, когда её обучали.
          </p>
          <p>
            Похоже на умного новичка в первый день работы: о трудовом праве он знает, а о ваших
            правилах — нет. Ему надо дать почитать регламент. Агенту тоже: прежде чем спросить
            модель, харнесс находит в базе знаний подходящие куски документов и кладёт их в запрос.
          </p>
          <p>
            Этот приём называется{' '}
            <CourseTerm tip="Retrieval-Augmented Generation — «генерация, дополненная найденным»: сначала найти, потом ответить.">
              RAG
            </CourseTerm>
            : найти (retrieval) и ответить с опорой на найденное (generation).
          </p>
        </>
      }
      lab={
        <Lab
          title="Опыт: что модель получает в запросе"
          hint={`Вопрос сотрудника — «${QUESTION}» Слева — что уходит модели, справа — на что она может опереться.`}
        >
          <button
            type="button"
            className={styles.choice}
            aria-pressed={found}
            onClick={() => {
              setFound(!found);
            }}
          >
            {found ? 'Найдено и подложено' : 'Найти в базе и подложить в запрос'}
          </button>
          <PromptPreview found={found} regulation={regulation} />
        </Lab>
      }
      notice={
        found
          ? `В базе есть и старый FAQ: «${faq}». Если харнесс найдёт его вместо регламента, модель уверенно ответит «два дня» — и будет неправа. Какой кусок найдётся, решает поиск; об этом — следующие шаги.`
          : 'Без документов модель не молчит, а отвечает правдоподобно. Это опаснее молчания: ответ похож на правду, но взят не из ваших правил.'
      }
      takeaway="Модель знает только то, что ей дали в запросе. Найти и подложить нужное — работа харнесса, и от того, что он найдёт, зависит ответ."
    />
  );
}

function PromptPreview({
  found,
  regulation,
}: {
  found: boolean;
  regulation: string;
}): ReactElement {
  return (
    <div className={styles.twoColumns}>
      <div className={styles.stack}>
        <span className={styles.caption}>запрос к модели</span>
        <Message role="system">Ты — ассистент «Кедр Софт». Отвечай по документам компании.</Message>
        {found && (
          <Message role="найдено харнессом · regulations/remoteWork" tone="found">
            {regulation}
          </Message>
        )}
        <Message role="user">{QUESTION}</Message>
      </div>
      <div className={styles.stack}>
        <span className={styles.caption}>на что опирается ответ · пример</span>
        <Message role="ответ" tone="answer">
          {found
            ? 'По регламенту удалённой работы — до трёх дней в неделю, остальные дни в офисе (regulations/remoteWork).'
            : 'Только на общие знания: «У разных компаний по-разному — часто один-два дня в неделю. Уточните у HR». Звучит разумно, но про «Кедр Софт» это догадка.'}
        </Message>
      </div>
    </div>
  );
}

export function Message(props: {
  role: string;
  tone?: 'found' | 'stale' | 'answer';
  children: string;
}): ReactElement {
  return (
    <div className={styles.message} data-tone={props.tone}>
      <span className={styles.caption}>{props.role}</span>
      {props.children}
    </div>
  );
}

function lineWith(base: LabBase, documentId: string, needle: string): string {
  const document = base.documents.find((item) => item.id === documentId);
  const line = document?.chunks
    .flatMap((chunk) => chunk.text.split('\n'))
    .find((text) => text.includes(needle));
  return line?.trim() ?? needle;
}
