// Оплата больничного — по порядку оформления больничного (docs/regulations/sickLeave.md).

import { addDays, daysBetween } from './calendar.js';

// П. 3: первые три дня каждого больничного оплачивает компания, остальные — фонд.
export const COMPANY_DAYS = 3;
// П. 3: доплата до полной зарплаты — за первые 10 дней больничного в календарном году.
export const TOP_UP_DAYS_PER_YEAR = 10;

export function sickPaySplit(leaves) {
  const usedTopUp = new Map();
  return leaves.map(({ start, end }) => {
    const days = daysBetween(start, end) + 1;
    if (days < 1) {
      throw new RangeError('Конец больничного раньше начала');
    }
    let topUp = 0;
    for (let index = 0; index < days; index += 1) {
      const year = addDays(start, index).slice(0, 4);
      const used = usedTopUp.get(year) ?? 0;
      if (used < TOP_UP_DAYS_PER_YEAR) {
        usedTopUp.set(year, used + 1);
        topUp += 1;
      }
    }
    const company = Math.min(days, COMPANY_DAYS);
    return { company, fund: days - company, topUp };
  });
}
