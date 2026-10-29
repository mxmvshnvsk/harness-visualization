// Ссылки из сессии на шаг лаборатории: «как устроена такая проверка — шаг 7 лаборатории RAG».
// Внутри приложения ссылка открывает лабораторию без перезагрузки — с возвратом туда, откуда
// пришли, — а адрес у неё настоящий (?lab=rag&step=check&trace=…): её можно открыть в новой
// вкладке или переслать.

import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { LabName } from './useSelection';

export type OpenLab = (lab: LabName, step?: string) => void;

export const OpenLabContext = createContext<OpenLab | null>(null);

interface LabLinkProps {
  lab: LabName;
  // id шага урока: check, vectors, tool…
  step?: string;
  className?: string;
  children: ReactNode;
}

export function LabLink({ lab, step, className, children }: LabLinkProps): ReactElement {
  const open = useContext(OpenLabContext);
  return (
    <a
      className={className}
      href={labHref(lab, step)}
      onClick={(event) => {
        // Cmd/Ctrl/Shift-клик и средняя кнопка — как у обычной ссылки: новая вкладка или окно.
        if (
          open === null ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        open(lab, step);
      }}
    >
      {children}
    </a>
  );
}

// Адрес лаборатории поверх текущего: открытая сессия или трейс остаются в нём.
function labHref(lab: LabName, step: string | undefined): string {
  const params = new URLSearchParams(window.location.search);
  params.delete('lab');
  params.delete('step');
  const query = new URLSearchParams({ lab, ...(step === undefined ? {} : { step }) });
  for (const [key, value] of params) {
    query.set(key, value);
  }
  return `?${query.toString()}`;
}
