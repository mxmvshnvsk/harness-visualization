// Документ базы знаний: метаданные из начала файла и текст.

export interface KnowledgeDocument {
  // Путь от папки data без расширения: regulations/vacation.
  id: string;
  title: string;
  // regulation, project, meeting, faq, incident, team, glossary.
  type: string;
  // Дата обновления (для регламентов) или проведения (для встреч), ГГГГ-ММ-ДД.
  date: string | null;
  owner: string | null;
  tags: string[];
  // Текст документа без метаданных.
  body: string;
}
