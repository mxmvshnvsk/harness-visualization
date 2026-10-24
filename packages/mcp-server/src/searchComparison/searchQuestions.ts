// Вопросы для сравнения способов поиска (этап 5.2) и документы, которые должны найтись.
// Вопросы подобраны на прогонах так, чтобы были видны все случаи: где выигрывает поиск
// по словам, где по смыслу, где оба справляются и где оба промахиваются.

export type QuestionGroup = 'term' | 'paraphrase' | 'sharedWords' | 'hard';

export const QUESTION_GROUP_TITLES: Record<QuestionGroup, string> = {
  term: 'термин или имя',
  paraphrase: 'своими словами',
  sharedWords: 'слова совпадают',
  hard: 'трудные',
};

export interface SearchQuestion {
  query: string;
  group: QuestionGroup;
  // Документы с ответом. Порядок не важен.
  expectedDocumentIds: string[];
  // Что проверяет вопрос — для человека, читающего вывод.
  checks: string;
}

export const SEARCH_QUESTIONS: SearchQuestion[] = [
  {
    query: 'удалёнка',
    group: 'term',
    expectedDocumentIds: ['regulations/remoteWork', 'faq/hrFaq'],
    checks: 'разговорное слово; в старом FAQ оно есть только в тегах',
  },
  {
    query: 'VPN',
    group: 'term',
    expectedDocumentIds: ['regulations/accessManagement', 'faq/itFaq'],
    checks: 'аббревиатура латиницей',
  },
  {
    query: 'Татьяна Соловьёва',
    group: 'term',
    expectedDocumentIds: ['team/contacts', 'regulations/businessTrips', 'regulations/onboarding'],
    checks: 'имя сотрудника в трёх документах',
  },
  {
    query: 'испытательный срок',
    group: 'term',
    expectedDocumentIds: ['regulations/onboarding', 'faq/newcomersFaq'],
    checks: 'короткий запрос из двух слов',
  },
  {
    query: 'сколько дней можно отдыхать в году',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/vacation'],
    checks: 'пример с демо «Компаса»: в регламенте нет слова «отдыхать»',
  },
  {
    query: 'сколько денег дают на самообразование',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/training'],
    checks: 'в регламенте «обучение и развитие», а не «самообразование»',
  },
  {
    query: 'кто отвечает за мобилку под айфон',
    group: 'paraphrase',
    expectedDocumentIds: ['team/contacts'],
    checks: 'жаргон: «мобилка», «айфон» вместо «приложение», «iOS»',
  },
  {
    query: 'почему клиенты не могли расплатиться',
    group: 'paraphrase',
    expectedDocumentIds: ['incidents/paymentsOutage'],
    checks: '«расплатиться» вместо «оплатить»',
  },
  {
    query: 'почему приложение долго пускало пользователей',
    group: 'paraphrase',
    expectedDocumentIds: ['incidents/loginLatency'],
    checks: '«долго пускало» вместо «медленный вход»',
  },
  {
    query: 'какой лимит на жильё в поездке по работе',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/businessTrips'],
    checks: '«жильё», «поездка» вместо «гостиница», «командировка»',
  },
  {
    query: 'можно ли купить стул для работы из квартиры за счёт фирмы',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/remoteWork'],
    checks: '«стул из квартиры» вместо «кресло для дома»',
  },
  {
    query: 'нужно ли ходить в контору во вторник',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/remoteWork'],
    checks: '«контора» вместо «офис», но день недели назван точно',
  },
  {
    query: 'можно ли поработать месяц с моря в Турции',
    group: 'paraphrase',
    expectedDocumentIds: ['regulations/remoteWork', 'meetings/allHandsOctober'],
    checks: '«с моря в Турции» вместо «из-за рубежа»',
  },
  {
    query: 'удалённая работа количество дней в неделю',
    group: 'sharedWords',
    expectedDocumentIds: ['regulations/remoteWork', 'faq/hrFaq'],
    checks: 'противоречие: свежий регламент и устаревший FAQ',
  },
  {
    query: 'сроки релиза Ракеты',
    group: 'sharedWords',
    expectedDocumentIds: ['projects/raketa', 'meetings/raketaRisks'],
    checks: 'название проекта и обычные слова',
  },
  {
    query: 'испытательный срок новичка',
    group: 'sharedWords',
    expectedDocumentIds: ['regulations/onboarding', 'faq/newcomersFaq'],
    checks: 'тот же вопрос, что «испытательный срок», на одно слово длиннее',
  },
  {
    query: 'как часто надо менять пароль',
    group: 'sharedWords',
    expectedDocumentIds: ['regulations/informationSecurity'],
    checks: 'слова вопроса есть в пункте регламента',
  },
  {
    query: 'сколько платят, если сидишь дома с температурой',
    group: 'hard',
    expectedDocumentIds: ['regulations/sickLeave'],
    checks: '«сидишь дома с температурой» — это больничный, но ни слова о болезни',
  },
  {
    query: 'отгул по самочувствию без справки',
    group: 'hard',
    expectedDocumentIds: ['regulations/sickLeave'],
    checks: '«день здоровья» другими словами',
  },
  {
    query: 'сколько длится испытание при приёме на работу',
    group: 'hard',
    expectedDocumentIds: ['regulations/onboarding', 'faq/newcomersFaq'],
    checks: '«испытание при приёме» вместо «испытательный срок»',
  },
];
