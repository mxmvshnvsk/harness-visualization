// Ссылка на другой сайт — всегда в новой вкладке: открытая сессия, плеер и лаборатория не теряются.
// rel="noopener noreferrer": новая вкладка не получает доступа к этой через window.opener.
// Голый <a> в интерфейсе запрещён правилом ESLint — внешние ссылки только через этот компонент,
// переходы внутри приложения — через LabLink.

import type { ReactElement, ReactNode } from 'react';

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function ExternalLink({ href, children, className }: ExternalLinkProps): ReactElement {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
