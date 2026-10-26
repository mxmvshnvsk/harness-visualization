// Две свои фразы: насколько они близки для модели эмбеддингов. Та же шкала и тот же порог,
// что у проверки опоры ответа, — видно, что «про то же» не значит «то же самое».

import { useState, type FormEvent, type ReactElement } from 'react';
import { SimilarityScale } from '../course/StepClose';
import { useEmbeddings } from '../useRagData';
import { cosine } from '../vectors';
import styles from './Data.module.css';

export function TwoPhrases(): ReactElement {
  const [first, setFirst] = useState('отпуск 28 дней');
  const [second, setSecond] = useState('отпуск 35 дней');
  const [pair, setPair] = useState<[string, string]>([first, second]);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (first.trim() !== '' && second.trim() !== '') {
      setPair([first.trim(), second.trim()]);
    }
  };
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Две фразы</h2>
      <p className={styles.note} data-teaching>
        Впишите две фразы — сервер посчитает их векторы, а сходство — браузер. Попробуйте одинаковый
        смысл разными словами и разный смысл одинаковыми.
      </p>
      <form className={styles.pairForm} onSubmit={submit}>
        <input
          value={first}
          maxLength={300}
          aria-label="Первая фраза"
          onChange={(event) => {
            setFirst(event.target.value);
          }}
        />
        <input
          value={second}
          maxLength={300}
          aria-label="Вторая фраза"
          onChange={(event) => {
            setSecond(event.target.value);
          }}
        />
        <button type="submit">Сравнить</button>
      </form>
      <PairResult pair={pair} />
    </section>
  );
}

function PairResult({ pair }: { pair: [string, string] }): ReactElement {
  const vectors = useEmbeddings(pair);
  if (vectors.status !== 'ready') {
    return (
      <p className={vectors.status === 'error' ? styles.bad : styles.note}>
        {vectors.status === 'loading' ? 'Считаем векторы…' : vectors.message}
      </p>
    );
  }
  const similarity = cosine(vectors.value[0] ?? [], vectors.value[1] ?? []);
  return (
    <div className={styles.pairResult}>
      <span>
        «{pair[0]}» и «{pair[1]}»
      </span>
      <SimilarityScale value={similarity} />
    </div>
  );
}
