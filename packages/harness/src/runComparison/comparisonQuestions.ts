// Вопросы для повторных прогонов (pnpm compare-runs): один вопрос — несколько сессий
// в каждом режиме поиска. Взяты из набора сравнения поиска (этап 5.2) так, чтобы
// были все случаи: поиск по смыслу справляется, промахивается и находит противоречие.

export interface ComparisonQuestion {
  query: string;
  // Документ с ответом: назвала ли его модель и что из него видела.
  expectedDocumentId: string;
  // true — в базе есть противоречие по этому вопросу (свежий регламент против старого FAQ),
  // и считаем, сказала ли о нём модель.
  hasContradiction: boolean;
}

export const COMPARISON_QUESTIONS: ComparisonQuestion[] = [
  {
    query: 'сколько дней можно отдыхать в году',
    expectedDocumentId: 'regulations/vacation',
    hasContradiction: false,
  },
  {
    query: 'удалённая работа количество дней в неделю',
    expectedDocumentId: 'regulations/remoteWork',
    hasContradiction: true,
  },
  {
    query: 'удалёнка',
    expectedDocumentId: 'regulations/remoteWork',
    hasContradiction: true,
  },
  {
    query: 'сколько платят, если сидишь дома с температурой',
    expectedDocumentId: 'regulations/sickLeave',
    hasContradiction: false,
  },
  {
    query: 'испытательный срок',
    expectedDocumentId: 'regulations/onboarding',
    hasContradiction: false,
  },
  {
    query: 'кто отвечает за мобилку под айфон',
    expectedDocumentId: 'team/contacts',
    hasContradiction: false,
  },
];
