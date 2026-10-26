# Кадровые расчёты «Кедр Софт»

Маленький проект для Код-арены: правила из регламентов компании, записанные кодом.
Без зависимостей, только встроенные модули Node. Тесты — `node --test`.

## Модули

- `src/calendar.js` — даты «ГГГГ-ММ-ДД»: `parseDate`, `formatDate`, `addDays`, `daysBetween`,
  `isWeekend`, `isHoliday`, `isWorkingDay` (рабочий день по производственному календарю).
- `src/holidays.js` — нерабочие праздничные дни по годам; есть только 2026 год.
- `src/vacation.js` — отпуск: `vacationDays`, `hasLongPart`.
- `src/leave.js` — перенос неиспользованных дней: `carryOver`, `nextYearBalance`.
- `src/tripCosts.js` — расходы командировки: суточные, гостиница, такси.

## Регламенты

Тексты — в `docs/regulations/`. Номера пунктов — в комментариях к коду.

## Производственный календарь 2026

- [Skillbox Media: производственный календарь 2026](https://skillbox.ru/media/management/proizvodstvennyy-kalendar-2026-skolko-otdyhaem-i-rabotaem-v-sleduyuschem-godu/)
- [Хабр: праздничные дни на 2026 год](https://habr.com/ru/post/953618)
