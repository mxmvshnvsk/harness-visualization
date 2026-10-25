// Приложение-плеер (этап 8c): шапка с открытым потоком, виды, плеер внизу и колонка «Диалог»
// справа (этап 6.1).
// Сессии, трейсы и запуск — в выезжающей панели, а пока ничего не открыто — на стартовом экране.
// Всё на экране выводится из списка событий потока — своего состояния сессии интерфейс не хранит.

import type { HarnessEvent } from '@harness-visualization/harness';
import type { TraceSummary } from '@harness-visualization/server';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { listSessions, listTraces, sessionEventsUrl, traceEventsUrl } from '../api/serverApi';
import { useEventStream, type EventStream } from '../api/useEventStream';
import { LiveDeltasContext } from '../api/liveDeltas';
import { useServerList } from '../api/useServerList';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { Menu } from '../components/Menu';
import { nextTheme, THEME_TEXT, ThemeToggle, ThemeToggleButton } from '../components/ThemeToggle';
import { Segmented } from '../components/Segmented';
import { EventList } from '../features/EventList';
import { ContextView } from '../features/context/ContextView';
import { FlowView } from '../features/flow/FlowView';
import { InspectorView } from '../features/inspector/InspectorView';
import { SkillsMemoryView } from '../features/skills/SkillsMemoryView';
import { TokenomicsLine } from '../features/TokenomicsLine';
import { DialogPanel } from '../features/dialog/DialogPanel';
import { DialogRail } from '../features/dialog/DialogRail';
import { PermissionCard } from '../features/PermissionCard';
import { StreamHeader, type StreamEnd } from '../features/StreamHeader';
import { usePendingPermission } from '../features/usePendingPermission';
import { AgentsView } from '../features/agents/AgentsView';
import { AgentLabelsContext, useAgentLabelsOf } from '../features/agents/agentLabels';
import { McpLab } from '../features/mcp/McpLab';
import { McpSessionView } from '../features/mcp/session/McpSessionView';
import { RagLab } from '../features/rag/RagLab';
import { RetrievalView } from '../features/rag/session/RetrievalView';
import { PlayerBar } from '../player/PlayerBar';
import { projectSession } from '../projections/projectSession';
import { buildActions, modelHostOf } from '../timeline/actions';
import { buildSchedule, type Schedule } from '../timeline/schedule';
import type { TimelineClock } from '../timeline/TimelineClock';
import { useTimeline } from '../timeline/useTimeline';
import styles from './App.module.css';
import { Sidebar } from './Sidebar';
import { useTheme } from './theme';
import { useSelection, type LabName, type OpenedSelection, type Selection } from './useSelection';
import { ViewLinksContext, type SearchLink, type ViewLinks } from './viewLinks';

export function App(): ReactElement {
  const [selection, select] = useSelection();
  const { drawerOpen, setDrawerOpen, closeDrawer, pick } = useDrawer(select);
  const sessions = useServerList(listSessions);
  const traces = useServerList(listTraces);
  const { opened, stream, sessionId, pending } = useOpenedStream(selection);

  const { openLab, closeLab } = useLabNavigation(select, pick, opened);
  useReloadOnEnd(stream.state, sessions.reload, traces.reload);

  const sources = (
    <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={pick} />
  );
  const lab =
    selection?.kind === 'lab' ? (
      <LabScreen lab={selection.lab} back={opened} onBack={closeLab} />
    ) : null;
  if (opened === null) {
    return lab ?? <StartScreen onOpenLab={openLab}>{sources}</StartScreen>;
  }
  return (
    <>
      {lab}
      {/* Пока открыта лаборатория, поток спрятан, но живёт: вид, плеер и диалог те же. */}
      <div hidden={lab !== null}>
        {/* key: другая сессия или трейс — повтор, выбор в инспекторе и диалог начинаются заново. */}
        <LiveDeltasContext.Provider value={stream.deltas}>
          <OpenStream
            key={streamUrl(opened)}
            events={stream.events}
            sessionId={sessionId}
            traceFile={opened.kind === 'trace' ? opened.file : null}
            live={opened.kind === 'session' && stream.state !== 'ended'}
            header={
              <Topbar
                {...describeSelection(opened, stream.events, traces.items)}
                stream={stream}
                onOpenSources={() => {
                  setDrawerOpen(true);
                }}
                onOpenLab={openLab}
              />
            }
            prompt={
              sessionId !== null && pending !== null ? (
                <PermissionCard
                  sessionId={sessionId}
                  pending={pending}
                  askedAt={findAskedAt(stream.events, pending.toolCallId)}
                />
              ) : null
            }
          />
        </LiveDeltasContext.Provider>
        <Drawer open={drawerOpen} label="Сессии и трейсы" onClose={closeDrawer}>
          {sources}
        </Drawer>
      </div>
    </>
  );
}

// Что за поток открыт. Лаборатория, открытая из сессии или трейса, лежит поверх него:
// поток не закрывается.
function useOpenedStream(selection: Selection | null) {
  const opened = selection?.kind === 'lab' ? selection.back : selection;
  const stream = useEventStream<StreamEnd>(streamUrl(opened));
  const sessionId = opened?.kind === 'session' ? opened.sessionId : null;
  const pending = usePendingPermission(sessionId, stream.events);
  return { opened, stream, sessionId, pending };
}

// Панель с сессиями и трейсами. Выбрали что-то — панель закрывается: дальше смотрим.
function useDrawer(select: (next: Selection | null) => void) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  const pick = useCallback(
    (next: Selection | null) => {
      select(next);
      setDrawerOpen(false);
      window.scrollTo({ top: 0 });
    },
    [select],
  );
  return { drawerOpen, setDrawerOpen, closeDrawer, pick };
}

function LabScreen(props: {
  lab: LabName;
  back: OpenedSelection | null;
  onBack: () => void;
}): ReactElement {
  const backLabel = BACK_LABELS[props.back?.kind ?? 'start'];
  return props.lab === 'rag' ? (
    <RagLab backLabel={backLabel} onBack={props.onBack} />
  ) : (
    <McpLab backLabel={backLabel} onBack={props.onBack} />
  );
}

const BACK_LABELS: Record<OpenedSelection['kind'] | 'start', string> = {
  session: '← К сессии',
  trace: '← К трейсу',
  start: '← К сессиям',
};

// Лаборатория открывается со стартового экрана и из шапки сессии или трейса. «Назад» ведёт
// туда, откуда пришли, — и на то же место страницы.
function useLabNavigation(
  select: (next: Selection | null) => void,
  pick: (next: Selection | null) => void,
  opened: OpenedSelection | null,
): { openLab: (lab: LabName) => void; closeLab: () => void } {
  const [scrollY, setScrollY] = useState(0);
  const openLab = useCallback(
    (lab: LabName) => {
      setScrollY(window.scrollY);
      pick({ kind: 'lab', lab, back: opened });
    },
    [pick, opened],
  );
  const closeLab = useCallback(() => {
    select(opened);
    requestAnimationFrame(() => {
      window.scrollTo({ top: opened === null ? 0 : scrollY });
    });
  }, [select, opened, scrollY]);
  return { openLab, closeLab };
}

// Сессия закончилась — её статус в списке поменялся, а в traces/ появился трейс.
function useReloadOnEnd(
  state: EventStream<StreamEnd>['state'],
  reloadSessions: () => void,
  reloadTraces: () => void,
): void {
  useEffect(() => {
    if (state === 'ended') {
      reloadSessions();
      reloadTraces();
    }
  }, [state, reloadSessions, reloadTraces]);
}

interface TopbarProps {
  title: string;
  source: string;
  synthetic: boolean;
  stream: EventStream<StreamEnd>;
  onOpenSources: () => void;
  onOpenLab: (lab: LabName) => void;
}

// Шапка в один ряд: что открыто — слева, справа тема иконкой, «Лаборатории ▾», «Сессии и трейсы»
// и главное действие «Новый вопрос». На узком экране всё, кроме него, — в меню «⋯».
// Свёрнутый диалог — полоса у правого края; на узком экране полосы нет, «Диалог» — в «⋯».
function Topbar({ onOpenSources, onOpenLab, ...header }: TopbarProps): ReactElement {
  const [theme, setTheme] = useTheme();
  const openDialog = useContext(OpenDialogContext);
  const dialog =
    openDialog === null
      ? []
      : [{ label: 'Диалог', hint: 'развернуть колонку', onSelect: openDialog }];
  const labs = LAB_ENTRIES.map((entry) => ({
    label: entry.title,
    hint: entry.short,
    onSelect: () => {
      onOpenLab(entry.lab);
    },
  }));
  return (
    <header className={styles.topbar}>
      <StreamHeader {...header} />
      <div className={styles.toolbar}>
        <span className={styles.wideOnly}>
          <ThemeToggleButton choice={theme} onChange={setTheme} />
        </span>
        <span className={styles.wideOnly}>
          <Menu label="Лаборатории" trigger={<>Лаборатории ▾</>} sections={[{ items: labs }]} />
        </span>
        <span className={styles.wideOnly}>
          <Button variant="quiet" onClick={onOpenSources}>
            Сессии и трейсы
          </Button>
        </span>
        <Button variant="accent" onClick={onOpenSources}>
          Новый вопрос
        </Button>
        <span className={styles.narrowOnly}>
          <Menu
            label="Ещё"
            shape="icon"
            trigger={<MoreIcon />}
            sections={[
              { items: [...dialog, { label: 'Сессии и трейсы', onSelect: onOpenSources }] },
              { title: 'лаборатории', items: labs },
              {
                items: [
                  {
                    label: THEME_TEXT[theme],
                    hint: 'нажмите, чтобы сменить',
                    onSelect: () => {
                      setTheme(nextTheme(theme));
                    },
                  },
                ],
              },
            ]}
          />
        </span>
      </div>
    </header>
  );
}

// Диалог свёрнут — как его развернуть: для пункта «Диалог» в меню «⋯» узкого экрана.
const OpenDialogContext = createContext<(() => void) | null>(null);

function MoreIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const LAB_ENTRIES: readonly { lab: LabName; title: string; short: string; text: string }[] = [
  {
    lab: 'rag',
    title: 'Лаборатория RAG',
    short: 'поиск, векторы, проверка ответа',
    text: 'Как агент ищет в базе знаний, что такое векторы и почему найденное не гарантирует верный ответ.',
  },
  {
    lab: 'mcp',
    title: 'Лаборатория MCP',
    short: 'тулы, протокол, цена, доверие',
    text: 'Что такое тул для модели, как харнесс говорит с MCP-сервером, сколько стоят тулы и можно ли верить серверу.',
  },
];

// Пока ничего не открыто — вопрос агенту и списки прямо на экране, без панели.
function StartScreen(props: {
  children: ReactNode;
  onOpenLab: (lab: LabName) => void;
}): ReactElement {
  return (
    <div className={styles.start}>
      <div className={styles.startIntro}>
        <div className={styles.startTop}>
          <span className={styles.eyebrow}>Harness Visualization</span>
          <ThemeToggle />
        </div>
        <h1 className={styles.startTitle}>Как вопрос проходит через харнесс</h1>
        <p className={styles.startText}>
          Задайте вопрос агенту или откройте записанный трейс — и посмотрите по шагам: prompt,
          модель, политика, тулы, ответ.
        </p>
      </div>
      <div className={styles.labs}>
        {LAB_ENTRIES.map((entry) => (
          <button
            key={entry.lab}
            type="button"
            className={styles.labEntry}
            onClick={() => {
              props.onOpenLab(entry.lab);
            }}
          >
            <b>{entry.title} →</b>
            <span>{entry.text}</span>
          </button>
        ))}
      </div>
      {props.children}
    </div>
  );
}

const VIEWS = [
  { value: 'flow', label: 'Поток' },
  { value: 'inspector', label: 'Инспектор' },
  { value: 'context', label: 'Контекст' },
  { value: 'rag', label: 'RAG' },
  { value: 'mcp', label: 'MCP' },
  { value: 'agents', label: 'Агенты' },
  { value: 'skills', label: 'Скиллы и память' },
  { value: 'events', label: 'Сырые события' },
] as const;

type ViewName = (typeof VIEWS)[number]['value'];

// «Агенты» — только у сессии с поручениями субагентам (этап 6c).
function viewsFor(events: readonly HarnessEvent[]): readonly (typeof VIEWS)[number][] {
  const delegated = events.some((event) => event.type === 'subagent_started');
  return delegated ? VIEWS : VIEWS.filter((view) => view.value !== 'agents');
}

interface OpenStreamProps {
  events: HarnessEvent[];
  // Сессия сервера — у неё есть диалог; null — трейс.
  sessionId: string | null;
  // Записанный трейс — для разбора опоры ответа в виде «RAG»; null — живая сессия.
  traceFile: string | null;
  live: boolean;
  header: ReactNode;
  // Чего сессия ждёт от человека прямо сейчас: разрешения на действие.
  prompt: ReactNode;
}

// Открытая сессия или трейс: слева шапка, виды и плеер, справа колонка «Диалог».
// Все виды показывают события до курсора повтора — повтор и перемотка работают в каждом.
function OpenStream(props: OpenStreamProps): ReactElement {
  const { events, sessionId, live, header, prompt } = props;
  // На узком экране колонка диалога ложится поверх — там она по умолчанию свёрнута.
  const [dialogOpen, setDialogOpen] = useState(() => window.innerWidth > 1000);
  const replay = useReplay(events, live);
  const { clock, cursor, schedule, view } = replay;
  const [playerCollapsed, togglePlayer] = usePlayerCollapsed();
  const liveStartedAt = live && events[0] !== undefined ? Date.parse(events[0].timestamp) : null;
  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);
  const dialog = { events, shown: cursor, sessionId, live };
  const agentLabels = useAgentLabelsOf(events);
  return (
    <AgentLabelsContext.Provider value={agentLabels}>
      <OpenDialogContext.Provider value={dialogOpen ? null : openDialog}>
        <div
          className={styles.shell}
          data-dialog={dialogOpen ? 'open' : 'closed'}
          data-player={playerCollapsed ? 'collapsed' : 'open'}
        >
          <div className={styles.page}>
            {header}
            {/* Колонка свёрнута — вопрос о разрешении над видами, чтобы его не пропустить. */}
            {!dialogOpen && prompt}
            <ViewSwitch
              events={events}
              replay={replay}
              liveStartedAt={liveStartedAt}
              traceFile={props.traceFile}
            />
          </div>
          {/* Колонка и полоса живут обе: колонка раздвигается и сдвигается плавно, а текст в ней
            остаётся на месте и не прокручивается заново при каждом открытии. */}
          <div className={styles.dialogSlot}>
            <DialogPanel
              {...dialog}
              open={dialogOpen}
              clock={clock}
              schedule={schedule}
              request={dialogOpen ? prompt : null}
              onCollapse={() => {
                setDialogOpen(false);
              }}
            />
            <DialogRail {...dialog} hidden={dialogOpen} onExpand={openDialog} />
          </div>
          <PlayerDock
            view={view}
            clock={clock}
            schedule={schedule}
            live={live}
            collapsed={playerCollapsed}
            onToggle={togglePlayer}
          />
        </div>
      </OpenDialogContext.Provider>
    </AgentLabelsContext.Provider>
  );
}

interface ViewSwitchProps {
  events: HarnessEvent[];
  replay: ReturnType<typeof useReplay>;
  liveStartedAt: number | null;
  traceFile: string | null;
}

// Переключатель видов и сам выбранный вид.
function ViewSwitch({ events, replay, liveStartedAt, traceFile }: ViewSwitchProps): ReactElement {
  const [viewName, setViewName] = useState<ViewName>('flow');
  const { clock, cursor, schedule, shown, view } = replay;
  const { links, link } = useLinkedViews(setViewName);
  return (
    <ViewLinksContext.Provider value={links}>
      <div className={styles.views}>
        <Segmented label="Вид" options={viewsFor(events)} value={viewName} onChange={setViewName} />
        {viewName === 'flow' && (
          <FlowView clock={clock} schedule={schedule} liveStartedAt={liveStartedAt} />
        )}
        {viewName === 'inspector' && (
          <InspectorView
            key={`inspector-${String(link.nonce)}`}
            focus={link.focusFor('inspector')}
            view={view}
            events={events}
            shown={cursor}
            clock={clock}
            schedule={schedule}
          />
        )}
        {viewName === 'context' && (
          <ContextView events={events} shown={cursor} clock={clock} schedule={schedule} />
        )}
        {viewName === 'rag' && (
          <RetrievalView
            key={`rag-${String(link.nonce)}`}
            events={events}
            shown={cursor}
            traceFile={traceFile}
            focus={link.focusFor('rag')}
          />
        )}
        {viewName === 'mcp' && (
          <McpSessionView
            key={`mcp-${String(link.nonce)}`}
            events={events}
            shown={cursor}
            focus={link.focusFor('mcp')}
          />
        )}
        {viewName === 'agents' && <AgentsView events={events} shown={cursor} />}
        {viewName === 'skills' && (
          <SkillsMemoryView events={events} shown={cursor} clock={clock} schedule={schedule} />
        )}
        {viewName === 'events' && <EventList events={shown} />}
      </div>
    </ViewLinksContext.Provider>
  );
}

type LinkedView = 'rag' | 'mcp' | 'inspector';

// Переход из одного вида в другой с целью: какой поиск показать. nonce — новый переход,
// даже к той же цели: вид открывается заново и раскрывает нужное.
function useLinkedViews(setViewName: (view: ViewName) => void) {
  const [link, setLink] = useState<{
    view: LinkedView | null;
    target: SearchLink | null;
    nonce: number;
  }>({ view: null, target: null, nonce: 0 });
  const links = useMemo<ViewLinks>(() => {
    const go = (view: LinkedView, target: SearchLink): void => {
      setLink((current) => ({ view, target, nonce: current.nonce + 1 }));
      setViewName(view);
    };
    return {
      toRag: (target) => {
        go('rag', target);
      },
      toMcp: (target) => {
        go('mcp', target);
      },
      toInspector: (target) => {
        go('inspector', target);
      },
    };
  }, [setViewName]);
  const focusFor = (view: LinkedView): SearchLink | null =>
    link.view === view ? link.target : null;
  return { links, link: { nonce: link.nonce, focusFor } };
}

interface PlayerDockProps {
  view: ReturnType<typeof projectSession>;
  clock: TimelineClock;
  schedule: Schedule;
  live: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

// Док внизу слева: строка токеномики и плеер. Свёрнутый — одна строка без токеномики.
function PlayerDock(props: PlayerDockProps): ReactElement {
  const { view, collapsed } = props;
  return (
    <div className={styles.dock}>
      <div className={styles.dockInner}>
        {!collapsed && <TokenomicsLine totals={view.totals} />}
        <PlayerBar
          clock={props.clock}
          schedule={props.schedule}
          live={props.live}
          collapsed={collapsed}
          onToggle={props.onToggle}
        />
      </div>
    </div>
  );
}

const PLAYER_KEY = 'hv-player-collapsed';

// Свёрнут ли плеер — запоминается в браузере; хранилище недоступно — просто не запомним.
function usePlayerCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(PLAYER_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const toggle = (): void => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(PLAYER_KEY, String(!value));
      } catch {
        // Не запомнили — не страшно.
      }
      return !value;
    });
  };
  return [collapsed, toggle];
}

// Повтор: действия, расписание, часы и сколько событий показано; вид сессии — на этот момент.
function useReplay(events: HarnessEvent[], live: boolean) {
  const modelHost = useMemo(() => modelHostOf(events), [events]);
  const actions = useMemo(() => buildActions(events, { modelHost }), [events, modelHost]);
  const schedule = useMemo(() => buildSchedule(actions), [actions]);
  const { clock, cursor } = useTimeline(events, schedule, live);
  const shown = useMemo(() => events.slice(0, cursor), [events, cursor]);
  // Проекция — чистая функция событий: пересчитываем, только когда изменился срез.
  const view = useMemo(() => projectSession(shown), [shown]);
  return { clock, cursor, schedule, shown, view };
}

function streamUrl(selection: OpenedSelection | null): string | null {
  if (selection === null) {
    return null;
  }
  return selection.kind === 'session'
    ? sessionEventsUrl(selection.sessionId)
    : traceEventsUrl(selection.file);
}

function describeSelection(
  selection: OpenedSelection,
  events: HarnessEvent[],
  traces: TraceSummary[],
): { title: string; source: string; synthetic: boolean } {
  const question = events.find((event) => event.type === 'user_message');
  const title = question?.type === 'user_message' ? question.text : null;
  if (selection.kind === 'session') {
    return { title: title ?? 'Сессия', source: selection.sessionId, synthetic: false };
  }
  const trace = traces.find((item) => item.file === selection.file);
  return {
    title: title ?? trace?.title ?? selection.file,
    source: selection.file,
    synthetic: trace?.synthetic ?? false,
  };
}

function findAskedAt(events: HarnessEvent[], toolCallId: string): string {
  const request = events.find(
    (event) => event.type === 'permission_requested' && event.toolCallId === toolCallId,
  );
  return request?.timestamp ?? new Date().toISOString();
}
