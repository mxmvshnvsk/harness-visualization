// Число со словом в нужной форме: 1 запрос, 2 запроса, 5 запросов.
// Форму выбирает Intl.PluralRules — правила русского языка встроены в браузер.

const RULES = new Intl.PluralRules('ru');

// one — 1, 21, 31…; few — 2–4, 22–24…; many — 0, 5–20, 25–30…
export interface WordForms {
  one: string;
  few: string;
  many: string;
}

export function plural(count: number, forms: WordForms): string {
  return `${count.toLocaleString('ru-RU')} ${pickForm(count, forms)}`;
}

function pickForm(count: number, forms: WordForms): string {
  const form = RULES.select(count);
  if (form === 'one') {
    return forms.one;
  }
  return form === 'few' ? forms.few : forms.many;
}
