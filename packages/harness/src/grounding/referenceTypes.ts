// Проверка опоры ответа (этап 4c): на какие источники сослался ответ модели
// и что из них модель на самом деле видела в этой сессии.
//
// Проверка детерминированная и без модели: источник правды — трейс сессии,
// то есть ровно то, что харнесс показал модели. Если ответ ссылается на
// документ, который модель не читала, это видно сразу.

import type { ClaimCheck } from './claimTypes.js';

// Чем сильнее уровень, тем надёжнее опора. Порядок важен: при сравнении
// выигрывает самый сильный уровень, с которым источник встретился в трейсе.
export const SOURCE_LEVELS = ['full', 'fragment', 'catalog', 'notSeen'] as const;

export type SourceLevel = (typeof SOURCE_LEVELS)[number];

// Что модель видела по конкретному источнику и в каком событии трейса впервые.
export interface SeenSource {
  level: SourceLevel;
  // Номер события трейса (sequence), где источник впервые достиг этого уровня.
  // null — для уровня notSeen: такого события нет.
  eventSequence: number | null;
}

// Ссылка из ответа вместе с тем, что по ней известно из трейса.
export interface CheckedReference {
  // Как источник назван в ответе: id документа, путь к файлу или адрес страницы.
  reference: string;
  seen: SeenSource;
}

export interface GroundingReport {
  // Текст ответа, который проверяли (последнее сообщение модели пользователю).
  answer: string;
  references: CheckedReference[];
  // Claims (утверждения) ответа и на что каждый опирается — этап 5b.
  claims: ClaimCheck[];
}
