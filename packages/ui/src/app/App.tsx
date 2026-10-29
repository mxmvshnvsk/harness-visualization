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
import { StepsView } from '../features/research/StepsView';
import { SkillsMemoryView } from '../features/skills/SkillsMemoryView';
import { TokenomicsLine } from '../features/TokenomicsLine';
import { DialogPanel } from '../features/dialog/DialogPanel';
import { DialogRail } from '../features/dialog/DialogRail';
import { PermissionCard } from '../features/PermissionCard';
import { StreamHeader, type StreamEnd } from '../features/StreamHeader';
import { usePendingPermission } from '../features/usePendingPermission';
import { CodeView } from '../features/code/CodeView';
import { ArenaLab } from '../features/arena/ArenaLab';
import { TokenLab } from '../features/tokens/TokenLab';
import { AgentsView } from '../features/agents/AgentsView';
import { AgentLabelsContext, useAgentLabelsOf } from '../features/agents/agentLabels';
import { McpLab } from '../features/mcp/McpLab';
import { EvalLab } from '../features/evals/EvalLab';
import { NavigationContext, type Navigation } from '../features/branch/BranchContext';
import { BranchesView } from '../features/branch/BranchesView';
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
import { labEntries } from './labEntries';
import { Sidebar } from './Sidebar';
import { useTheme, type ThemeChoice } from './theme';
import { setMode, useMode, type UiMode } from './mode';
import { ModeToggle } from '../components/ModeToggle';
import {
  cameFrom,
  labBackOf,
  openedOf,
  type LabOrigin,
  useSelection,
  type LabName,
  type OpenedSelection,
  type Selection,
} from './useSelection';
import { OpenLabContext, type OpenLab } from './labLinks';
import { LabsScreen } from './start/LabsScreen';
import { QUESTION_FIELD_ID } from '../features/SessionForm';
import { StartIntro } from './start/StartIntro';
import { ViewLinksContext, type SearchLink, type ViewLinks } from './viewLinks';

export function App(): ReactElement {
  const [selection, select, replace] = useSelection();
  const { drawerOpen, setDrawerOpen, closeDrawer, pick } = useDrawer(select);
  const sessions = useServerList(listSessions);
  const traces = useServerList(listTraces);
  const navigation = useNavigation(pick, traces.items);
  const { opened, stream, sessionId, pending } = useOpenedStream(selection);
  const { openLab, closeLab } = useLabNavigation(select, pick, selection);
  useReloadOnEnd(stream.state, sessions.reload, traces.reload);

  const sources = (
    <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={pick} />
  );
  const lab = labScreenOf(selection, { onBack: closeLab, onSelect: pick, replace });
  if (opened === null) {
    return (
      lab ??
      startScreenOf(
        selection,
        { select, pick, openLab, traces: traces.items },
        <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={pick} wide />,
      )
    );
  }
  return (
    <>
      {lab}
      {/* Пока открыта лаборатория, поток спрятан, но живёт: вид, плеер и диалог те же. */}
      <div hidden={lab !== null}>
        {/* key: другая сессия или трейс — повтор, выбор в инспекторе и диалог начинаются заново. */}
        <LiveDeltasContext.Provider value={stream.deltas}>
          <NavigationContext.Provider value={navigation}>
            <OpenLabContext.Provider value={openLab}>
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
                prompt={permissionPrompt(sessionId, pending, stream.events)}
              />
            </OpenLabContext.Provider>
          </NavigationContext.Provider>
        </LiveDeltasContext.Provider>
        <Drawer open={drawerOpen} label="Сессии и трейсы" onClose={closeDrawer}>
          {sources}
        </Drawer>
      </div>
    </>
  );
}

interface StartRoute {
  select: (next: Selection | null) => void;
  pick: (next: Selection | null) => void;
  openLab: OpenLab;
  traces: readonly TraceSummary[];
}

// Ничего не открыто: экран «Лаборатории» или стартовый экран со списками.
function startScreenOf(
  selection: Selection | null,
  route: StartRoute,
  sources: ReactNode,
): ReactElement {
  if (selection?.kind === 'labs') {
    return <LabsScreen onBack={() => goBack(route.select, null)} onOpenLab={route.openLab} />;
  }
  return (
    <StartScreen
      onOpenLab={route.openLab}
      onOpenLabs={() => route.select({ kind: 'labs' })}
      onOpenExample={exampleOpener(route.traces, route.pick)}
    >
      {sources}
    </StartScreen>
  );
}

interface LabRoute {
  onBack: () => void;
  onSelect: (next: Selection | null) => void;
  // Сменить шаг урока в адресе, не добавляя записи в историю.
  replace: (next: Selection | null) => void;
}

// Открыта лаборатория — её экран; иначе null.
function labScreenOf(selection: Selection | null, route: LabRoute): ReactElement | null {
  if (selection?.kind !== 'lab') {
    return null;
  }
  return (
    <LabScreen
      lab={selection.lab}
      step={selection.step}
      back={backKindOf(selection)}
      onBack={route.onBack}
      onSelect={route.onSelect}
      onStepChange={(step) => {
        route.replace({ ...selection, step });
      }}
    />
  );
}

// Ветки (этап 9): открыть запущенную ветку, трейс из дерева веток; список трейсов — для дерева.
function useNavigation(
  pick: (next: Selection | null) => void,
  traces: readonly TraceSummary[],
): Navigation {
  return useMemo(
    () => ({
      openSession: (sessionId: string) => {
        pick({ kind: 'session', sessionId });
      },
      openTrace: (file: string) => {
        pick({ kind: 'trace', file });
      },
      traces,
    }),
    [pick, traces],
  );
}

// Чего сессия ждёт от человека прямо сейчас: разрешения на действие.
function permissionPrompt(
  sessionId: string | null,
  pending: ReturnType<typeof usePendingPermission>,
  events: readonly HarnessEvent[],
): ReactNode {
  if (sessionId === null || pending === null) {
    return null;
  }
  return (
    <PermissionCard
      sessionId={sessionId}
      pending={pending}
      askedAt={findAskedAt(events, pending.toolCallId)}
    />
  );
}

// Что за поток открыт. Лаборатория, открытая из сессии или трейса, лежит поверх него:
// поток не закрывается.
function useOpenedStream(selection: Selection | null) {
  const opened = openedOf(selection);
  const stream = useEventStream<StreamEnd>(streamUrl(opened), opened?.kind === 'trace');
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
  // Шаг урока из адреса — у RAG и MCP; null — с начала.
  step: string | null;
  onStepChange: (step: string) => void;
  back: BackKind;
  onBack: () => void;
  // Лаборатория evals открывает трейс попытки.
  onSelect: (next: Selection) => void;
}): ReactElement {
  const backLabel = BACK_LABELS[props.back];
  const openTrace = (file: string): void => {
    props.onSelect({ kind: 'trace', file });
  };
  switch (props.lab) {
    case 'rag':
      return (
        <RagLab
          backLabel={backLabel}
          onBack={props.onBack}
          step={props.step}
          onStepChange={props.onStepChange}
        />
      );
    case 'mcp':
      return (
        <McpLab
          backLabel={backLabel}
          onBack={props.onBack}
          step={props.step}
          onStepChange={props.onStepChange}
        />
      );
    case 'evals':
      return <EvalLab backLabel={backLabel} onBack={props.onBack} onOpenTrace={openTrace} />;
    case 'tokens':
      return <TokenLab backLabel={backLabel} onBack={props.onBack} onOpenTrace={openTrace} />;
    case 'arena':
      return (
        <ArenaLab
          backLabel={backLabel}
          onBack={props.onBack}
          onStarted={(sessionId) => {
            props.onSelect({ kind: 'session', sessionId });
          }}
        />
      );
  }
}

type BackKind = OpenedSelection['kind'] | LabOrigin;

const BACK_LABELS: Record<BackKind, string> = {
  session: '← К сессии',
  trace: '← К трейсу',
  start: '← На старт',
  labs: '← К лабораториям',
};

function backKindOf(selection: Selection & { kind: 'lab' }): BackKind {
  return selection.back?.kind ?? selection.from;
}

// «Назад» с экрана приложения: пришли с target — шаг назад в истории браузера, чтобы его кнопки
// «назад / вперёд» вели себя так же; иначе (прямая ссылка) — открыть target новой записью.
function goBack(select: (next: Selection | null) => void, target: Selection | null): void {
  if (cameFrom(target)) {
    window.history.back();
  } else {
    select(target);
  }
}

// Лаборатория открывается со стартового экрана и из шапки сессии или трейса. «Назад» ведёт
// туда, откуда пришли, — и на то же место страницы.
function useLabNavigation(
  select: (next: Selection | null) => void,
  pick: (next: Selection | null) => void,
  selection: Selection | null,
): { openLab: OpenLab; closeLab: () => void } {
  const [scrollY, setScrollY] = useState(0);
  const opened = openedOf(selection);
  const from: LabOrigin = selection?.kind === 'labs' ? 'labs' : 'start';
  const openLab = useCallback(
    (lab: LabName, step?: string) => {
      setScrollY(window.scrollY);
      pick({ kind: 'lab', lab, back: opened, from, step: step ?? null });
    },
    [pick, opened, from],
  );
  const closeLab = useCallback(() => {
    const target = selection?.kind === 'lab' ? labBackOf(selection) : null;
    const top = target?.kind === 'session' || target?.kind === 'trace' ? scrollY : 0;
    const restore = (): void => {
      requestAnimationFrame(() => {
        window.scrollTo({ top });
      });
    };
    // Пришли из приложения — экран сменится по popstate; по прямой ссылке — сразу.
    if (cameFrom(target)) {
      window.addEventListener('popstate', restore, { once: true });
      window.history.back();
    } else {
      select(target);
      restore();
    }
  }, [select, selection, scrollY]);
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
  const mode = useMode();
  const labs = labEntries(mode).map((entry) => ({
    label: entry.title,
    hint: entry.question,
    onSelect: () => {
      onOpenLab(entry.lab);
    },
  }));
  return (
    <header className={styles.topbar}>
      <StreamHeader {...header} />
      <div className={styles.toolbar}>
        <span className={styles.wideOnly}>
          <ModeToggle />
        </span>
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
                items: settingsItems(mode, theme, setTheme),
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

// Режим и тема — в меню «⋯» на узком экране, где переключателей в шапке нет.
function settingsItems(
  mode: UiMode,
  theme: ThemeChoice,
  setTheme: (choice: ThemeChoice) => void,
): { label: string; hint: string; onSelect: () => void }[] {
  return [
    {
      label: mode === 'research' ? 'режим: исследование' : 'режим: обучение',
      hint: 'нажмите, чтобы сменить',
      onSelect: () => {
        setMode(mode === 'research' ? 'learn' : 'research');
      },
    },
    {
      label: THEME_TEXT[theme],
      hint: 'нажмите, чтобы сменить',
      onSelect: () => {
        setTheme(nextTheme(theme));
      },
    },
  ];
}

const START_TEXT: Record<UiMode, { title: string; text: string }> = {
  learn: {
    title: 'Как запрос проходит через харнесс',
    text: 'Ниже — что здесь к чему и три способа начать: готовая запись, свой вопрос или одна тема.',
  },
  research: {
    title: 'Сессии и записи',
    text: 'Свои сессии и записи Claude Code и OpenCode — по шагам: контекст, сырые запросы и ответы.',
  },
};

// Пока ничего не открыто — вопрос агенту и списки прямо на экране, без панели.
// Сверху вопрос и лаборатории во всю ширину, под ними сессии и записи — по половине.
function StartScreen(props: {
  children: ReactNode;
  onOpenLab: (lab: LabName) => void;
  onOpenLabs: () => void;
  onOpenExample: (() => void) | null;
}): ReactElement {
  const mode = useMode();
  return (
    <div className={styles.start}>
      <div className={styles.startTop}>
        {/* Заголовок и подпись есть в обоих режимах, в одну строку: шапка не скачет. */}
        <div className={styles.startIntro}>
          <span className={styles.eyebrow}>Harness Visualization</span>
          <h1 className={styles.startTitle}>{START_TEXT[mode].title}</h1>
          <p className={styles.startText}>{START_TEXT[mode].text}</p>
        </div>
        <span className={styles.startControls}>
          <ModeToggle />
          <ThemeToggle />
        </span>
      </div>
      {mode === 'learn' && (
        <StartIntro
          onOpenExample={props.onOpenExample}
          onAsk={focusQuestion}
          onOpenLabs={props.onOpenLabs}
        />
      )}
      <div className={styles.startGrid}>
        {props.children}
        <aside className={`${styles.card} ${styles.labs}`}>
          <h2 className={styles.labsTitle}>
            {mode === 'research' ? 'Инструменты' : 'Лаборатории'}
          </h2>
          {labEntries(mode).map((entry) => (
            <button
              key={entry.lab}
              type="button"
              className={styles.labEntry}
              title={entry.question}
              onClick={() => {
                props.onOpenLab(entry.lab);
              }}
            >
              <b>{entry.title}</b>
              <span>{entry.short}</span>
            </button>
          ))}
          {mode === 'learn' && (
            <button type="button" className={styles.allLabs} onClick={props.onOpenLabs}>
              Все лаборатории — с вопросами и временем →
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

// Пример для первого знакомства: «удалёнка» — короткая сессия с поиском по документам и тулами.
const FIRST_EXAMPLE = '2026-10-26T08-03-22_040414ea.jsonl';

// Открыть пример; null — его нет в списке (папку примеров убрали или список ещё грузится).
// Тот же файл может лежать и в traces/ — тогда сервер отдаёт его как свой трейс: годится и он.
function exampleOpener(
  traces: readonly TraceSummary[],
  pick: (next: Selection | null) => void,
): (() => void) | null {
  const found = traces.some((trace) => trace.file === FIRST_EXAMPLE);
  return found ? () => pick({ kind: 'trace', file: FIRST_EXAMPLE }) : null;
}

// «Спросить агента самому»: прокрутить к полю вопроса и поставить в него курсор.
function focusQuestion(): void {
  const field = document.getElementById(QUESTION_FIELD_ID);
  field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field?.focus({ preventScroll: true });
}

const VIEWS = [
  { value: 'flow', label: 'Поток' },
  { value: 'inspector', label: 'Инспектор' },
  { value: 'code', label: 'Код' },
  { value: 'context', label: 'Контекст' },
  { value: 'rag', label: 'RAG' },
  { value: 'mcp', label: 'MCP' },
  { value: 'agents', label: 'Агенты' },
  { value: 'branches', label: 'Ветки' },
  { value: 'skills', label: 'Скиллы и память' },
  { value: 'events', label: 'Сырые события' },
] as const;

type ViewName = (typeof VIEWS)[number]['value'];

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
              sessionId={sessionId}
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
  sessionId: string | null;
}

// Переключатель видов и сам выбранный вид.
function ViewSwitch(props: ViewSwitchProps): ReactElement {
  const [viewName, setViewName] = useState<ViewName>('flow');
  const { links, link } = useLinkedViews(setViewName);
  return (
    <ViewLinksContext.Provider value={links}>
      <div className={styles.views}>
        <Segmented label="Вид" options={VIEWS} value={viewName} onChange={setViewName} />
        {VIEW_RENDERERS[viewName]({ ...props, link })}
      </div>
    </ViewLinksContext.Provider>
  );
}

type ViewContext = ViewSwitchProps & { link: ReturnType<typeof useLinkedViews>['link'] };

// В «Исследовании» инспектор — экран шагов (решение автора 26.10.2026), в «Обучении» — этапы.
function InspectorOrSteps({ replay, events, traceFile, link }: ViewContext): ReactElement {
  const mode = useMode();
  if (mode === 'research') {
    return (
      <StepsView
        events={events}
        shown={replay.cursor}
        clock={replay.clock}
        schedule={replay.schedule}
      />
    );
  }
  return (
    <InspectorView
      key={`inspector-${String(link.nonce)}`}
      focus={link.focusFor('inspector')}
      view={replay.view}
      events={events}
      shown={replay.cursor}
      clock={replay.clock}
      schedule={replay.schedule}
      traceFile={traceFile}
    />
  );
}

// Каждый вид — по событиям до курсора повтора.
const VIEW_RENDERERS: Record<ViewName, (context: ViewContext) => ReactNode> = {
  flow: ({ replay, liveStartedAt }) => (
    <FlowView clock={replay.clock} schedule={replay.schedule} liveStartedAt={liveStartedAt} />
  ),
  inspector: (context) => <InspectorOrSteps {...context} />,
  code: ({ events, replay }) => <CodeView events={events} shown={replay.cursor} />,
  context: ({ events, replay }) => (
    <ContextView
      events={events}
      shown={replay.cursor}
      clock={replay.clock}
      schedule={replay.schedule}
    />
  ),
  rag: ({ events, replay, traceFile, link }) => (
    <RetrievalView
      key={`rag-${String(link.nonce)}`}
      events={events}
      shown={replay.cursor}
      traceFile={traceFile}
      focus={link.focusFor('rag')}
    />
  ),
  mcp: ({ events, replay, link }) => (
    <McpSessionView
      key={`mcp-${String(link.nonce)}`}
      events={events}
      shown={replay.cursor}
      focus={link.focusFor('mcp')}
    />
  ),
  agents: ({ events, replay }) => <AgentsView events={events} shown={replay.cursor} />,
  branches: ({ events, traceFile, sessionId }) => (
    <BranchesView events={events} traceFile={traceFile} sessionId={sessionId} />
  ),
  skills: ({ events, replay }) => (
    <SkillsMemoryView
      events={events}
      shown={replay.cursor}
      clock={replay.clock}
      schedule={replay.schedule}
    />
  ),
  events: ({ replay }) => <EventList events={replay.shown} />,
};

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
  const title = question?.type === 'user_message' ? questionTitle(question.text) : null;
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

// Вопрос-документ (задача арены — TASK.md с заголовком «# …») — заголовком, а не целиком.
// То же правило у сервера в списке трейсов (TraceCatalog).
export function questionTitle(text: string): string {
  const firstLine = text.trimStart().split('\n', 1)[0] ?? '';
  return firstLine.startsWith('# ') && text.includes('\n') ? firstLine.slice(2).trim() : text;
}

function findAskedAt(events: readonly HarnessEvent[], toolCallId: string): string {
  const request = events.find(
    (event) => event.type === 'permission_requested' && event.toolCallId === toolCallId,
  );
  return request?.timestamp ?? new Date().toISOString();
}
