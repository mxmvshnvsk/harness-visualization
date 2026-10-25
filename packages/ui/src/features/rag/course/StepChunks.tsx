// Шаг 2. Почему документ режут на куски: опыт с размером куска и перекрытием.

import type { LabBase } from '@harness-visualization/mcp-server/lab';
import { useState, type ReactElement } from 'react';
import { Segmented } from '../../../components/Segmented';
import { chunkParagraphs, paragraphsOf } from '../chunking';
import styles from '../RagLab.module.css';
import { CHUNK_DOCUMENTS, MODEL_READ_LIMIT } from './courseContent';
import { CourseTerm, Lab, StepShell } from './StepShell';

interface StepProps {
  base: LabBase;
  onStep: (index: number) => void;
}

type DocumentId = (typeof CHUNK_DOCUMENTS)[number]['id'];

export function StepChunks({ base, onStep }: StepProps): ReactElement {
  return (
    <StepShell
      index={1}
      onStep={onStep}
      question="Почему документ режут на куски?"
      prose={
        <>
          <p>
            В запрос к модели нельзя положить всю базу: каждое слово стоит денег и места, а 30
            документов — это десятки тысяч{' '}
            <CourseTerm tip="Токен — кусочек текста, которым считает модель: слово или его часть. Запрос измеряется и оплачивается в токенах.">
              токенов
            </CourseTerm>
            . Да и не нужно: на вопрос отвечает один абзац.
          </p>
          <p>
            Поэтому документы заранее режут на куски —{' '}
            <CourseTerm tip="Фрагмент (chunk) — кусок документа, который ищется и подкладывается целиком.">
              фрагменты
            </CourseTerm>{' '}
            по несколько абзацев. Ищет харнесс не документ, а лучший кусок, и в запрос кладёт только
            его. Как библиотечные карточки вместо целой книги.
          </p>
          <p>
            Размер куска — компромисс. Харнесс режет по абзацам до ~{base.chunkTargetLength}{' '}
            символов и повторяет последний абзац в начале следующего куска — это{' '}
            <CourseTerm tip="Перекрытие (overlap) — один и тот же абзац в конце одного куска и в начале следующего, чтобы мысль на стыке не порвалась.">
              перекрытие
            </CourseTerm>
            .
          </p>
        </>
      }
      lab={<ChunkLab base={base} />}
      notice="Сделайте куски маленькими (150–250): многие окажутся «без заголовка раздела». Кусок «1.2. Вопросы по регламенту — в отдел кадров, к Марии Орловой» уже не говорит, о каком регламенте речь, — его не найдёт вопрос «кому писать про отпуск». Поэтому харнесс добавляет к каждому куску название документа. Сделайте большими — весь документ станет одним куском: найти его легко, но в запрос уйдёт много лишнего. А в длинном документе кусок больше ~1400 символов перерос бы то, что модель эмбеддингов читает за раз (512 токенов), и конец молча отрезался бы."
      takeaway="Ищут не документы, а куски. Слишком мелкий кусок теряет смысл, слишком крупный — тащит лишнее; перекрытие страхует стыки."
    />
  );
}

function ChunkLab({ base }: { base: LabBase }): ReactElement {
  const [documentId, setDocumentId] = useState<DocumentId>('regulations/vacation');
  const [size, setSize] = useState(base.chunkTargetLength);
  const [overlap, setOverlap] = useState(true);
  const spec = CHUNK_DOCUMENTS.find((item) => item.id === documentId) ?? CHUNK_DOCUMENTS[0];
  const document = base.documents.find((item) => item.id === documentId);
  const chunks = chunkParagraphs(
    paragraphsOf(document?.chunks.map((chunk) => chunk.text) ?? []),
    size,
    overlap,
  );
  const answerIn = chunks.findIndex((chunk) => chunk.join('\n\n').includes(spec.answer));
  return (
    <Lab
      title="Опыт: порежьте документ сами"
      hint={`Вопрос — «${spec.question}». Ответ подсвечен; кусок, где он лежит, отмечен.`}
    >
      <ChunkControls
        documentId={documentId}
        size={size}
        overlap={overlap}
        onDocument={setDocumentId}
        onSize={setSize}
        onOverlap={setOverlap}
      />
      <p className={styles.hint}>
        {chunks.length} кусков · ответ в куске {answerIn + 1}
      </p>
      <div className={styles.stack}>
        {chunks.map((chunk, index) => (
          // Куски пересчитываются целиком при каждом изменении — номер годится как ключ.
          <ChunkCard
            key={index}
            chunk={chunk}
            index={index}
            total={chunks.length}
            answer={spec.answer}
          />
        ))}
      </div>
    </Lab>
  );
}

interface ChunkCardProps {
  chunk: string[];
  index: number;
  total: number;
  answer: string;
}

interface ChunkControlsProps {
  documentId: DocumentId;
  size: number;
  overlap: boolean;
  onDocument: (id: DocumentId) => void;
  onSize: (size: number) => void;
  onOverlap: (overlap: boolean) => void;
}

// Выбор документа, размера куска и перекрытия.
function ChunkControls(props: ChunkControlsProps): ReactElement {
  const { documentId, size, overlap } = props;
  return (
    <div className={styles.controls}>
      <Segmented
        label="Документ"
        options={CHUNK_DOCUMENTS.map((item) => ({ value: item.id, label: item.label }))}
        value={documentId}
        onChange={props.onDocument}
        size="small"
      />
      <label className={styles.range}>
        размер куска до <b className={styles.number}>{size}</b> симв.
        <input
          type="range"
          min={150}
          max={2000}
          step={50}
          value={size}
          onChange={(event) => {
            props.onSize(Number(event.target.value));
          }}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={overlap}
          onChange={(event) => {
            props.onOverlap(event.target.checked);
          }}
        />{' '}
        перекрытие
      </label>
    </div>
  );
}

function ChunkCard({ chunk, index, total, answer }: ChunkCardProps): ReactElement {
  const text = chunk.join('\n\n');
  const at = text.indexOf(answer);
  const long = text.length > MODEL_READ_LIMIT;
  return (
    <article
      className={styles.chunk}
      data-answer={at >= 0 ? 'true' : undefined}
      data-long={long ? 'true' : undefined}
    >
      <div className={styles.chunkMeta}>
        <span className={styles.mono}>
          кусок {index + 1} из {total}
        </span>
        <span className={styles.number}>{text.length} симв.</span>
        {long && (
          <span className={styles.bad}>
            длиннее, чем прочитает модель эмбеддингов — конец потеряется
          </span>
        )}
        {index > 0 && !(chunk[0] ?? '').startsWith('#') && <span>без заголовка раздела</span>}
      </div>
      <pre className={styles.chunkText}>
        {at < 0 ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <mark className={styles.mark}>{answer}</mark>
            {text.slice(at + answer.length)}
          </>
        )}
      </pre>
    </article>
  );
}
