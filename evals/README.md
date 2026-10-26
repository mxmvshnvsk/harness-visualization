# Наборы задач для evals

Этап 8e: `pnpm run eval` гоняет каждую задачу набора по k раз в каждой конфигурации и считает pass@k и pass^k. Термины и подход — из статьи Anthropic [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents).

- `kedr.json` — вопросы сотрудников «Кедр Софт» к базе знаний; у каждой задачи в `origin` — урок или трейс стенда, откуда она взялась.

Задача — вопрос и проверки. Проверки кодом смотрят на трейс попытки: `answerIncludes` / `answerExcludes` (текст ответа), `documentSeen` / `documentRead` / `documentCited` (что агент видел, прочитал целиком, назвал в обратных кавычках), `toolCalled` / `toolNotCalled`, `maxModelRequests`, `maxToolCalls`, `maxCostUsd`. Проверка `judge` — модель-судья читает вопрос, рубрику и ответ; судья недетерминирован, а документов не видит — «не выдумал ли» проверяет `pnpm check-grounding`.

Отчёт прогона — JSON в `traces/evals/`, рядом трейсы попыток и трейс судьи.
