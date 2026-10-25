# Токены и стоимость

Модель читает и пишет **токенами** — кусочками текста. За них и платят.

## Что считается

- **input tokens** — весь prompt этого запроса: system prompt, история, результаты tools, описания tools. Делится на **cache hit** (пришло из кэша, дешевле) и **cache miss** (обработано заново).
- **output tokens** — всё, что модель написала в ответ, включая **reasoning**.
- **reasoning** — рассуждения модели перед ответом. У DeepSeek в режиме thinking они приходят отдельным полем `reasoning_content`; их глубину задаёт `reasoning_effort` (`low`, `high`, `max`).

## Стоимость

Харнесс считает стоимость каждого ответа по таблице цен из `harness.config.json`: cache hit, cache miss и output — по своей цене, с тарифом по времени суток (у DeepSeek вне пиковых часов вдвое дешевле). У таблицы есть дата проверки: стоимость не точнее неё.

Валюты не складываются: запросы к модели — в долларах, поиск Яндекса — в рублях. Если цена модели неизвестна, интерфейс так и пишет, а не показывает ноль.

Проверено: 25.10.2026

## Источники

- [DeepSeek API — Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [DeepSeek API — Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
