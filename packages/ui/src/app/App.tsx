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
  useRef,
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
  rewriteAddress,
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
import { Tour } from '../features/tour/Tour';
import { BRANCH_STOP, TOUR_STOPS, TOUR_TRACE, type TourStop } from '../features/tour/tourStops';
import { markRouteStep } from './start/route';

export function App(): ReactElement {
  const [selection, select, replace] = useSelection();
  const { drawerOpen, setDrawerOpen, closeDrawer, pick } = useDrawer(select);
  const sessions = useServerList(listSessions);
  const traces = useServerList(listTraces);
  const navigation = useNavigation(pick, traces.items);
  const { opened, stream, sessionId, pending } = useOpenedStream(selection);
  const { openLab, closeLab } = useLabNavigation(select, pick, selection);
  useReloadOnEnd(stream.state, sessions.reload, traces.reload);
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
                tour={tourOf(lab === null ? opened : null, replace, pick)}
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
          <Sidebar sessions={sessions} traces={traces} selection={selection} onSelect={pick} />
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
      onOpenBranch={exampleOpener(route.traces, route.pick, BRANCH_STOP)}
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
  useMarkToolLab(props.lab);
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

// У лабораторий без урока (выбор токена, Evals, код-арена) шаг маршрута «Одна лаборатория»
// отмечается, когда её открыли; у RAG и MCP — на последнем шаге урока.
function useMarkToolLab(lab: LabName): void {
  useEffect(() => {
    if (lab !== 'rag' && lab !== 'mcp') {
      markRouteStep('lab');
    }
  }, [lab]);
}

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

// Пока ничего не открыто — вопрос агенту и списки прямо на экране, без панели.
// Сверху вопрос и лаборатории во всю ширину, под ними сессии и записи — по половине.
function StartScreen(props: {
  children: ReactNode;
  onOpenLab: (lab: LabName) => void;
  onOpenLabs: () => void;
  onOpenExample: (() => void) | null;
  onOpenBranch: (() => void) | null;
}): ReactElement {
  const mode = useMode();
  return (
    <div className={styles.start}>
      <div className={styles.startTop}>
        {/* В «Обучении» заголовок экрана — во введении; в «Исследовании» введения нет. */}
        <div className={styles.startIntro}>
          <span className={styles.eyebrow}>Harness Visualization</span>
          {mode === 'research' && (
            <>
              <h1 className={styles.startTitle}>Сессии и записи</h1>
              <p className={styles.startText}>
                Свои сессии и записи Claude Code и OpenCode — по шагам: контекст, сырые запросы и
                ответы.
              </p>
            </>
          )}
        </div>
        <span className={styles.startControls}>
          <ModeToggle />
          <ThemeToggle />
        </span>
      </div>
      {mode === 'learn' && (
        <StartIntro
          onOpenBranch={props.onOpenBranch}
          onOpenExample={props.onOpenExample}
          onAsk={focusQuestion}
          onOpenLabs={props.onOpenLabs}
        />
      )}
      <div className={styles.startGrid}>
        {props.children}
        <StartLabs mode={mode} onOpenLab={props.onOpenLab} onOpenLabs={props.onOpenLabs} />
        {/* Свой заголовок у сессий — чтобы не читались частью лабораторий (мокап 29.10.2026). */}
        <h2 className={styles.sessionsTitle}>Ваши сессии</h2>
      </div>
    </div>
  );
}

// Лаборатории (в «Исследовании» — инструменты) плитками во всю ширину.
function StartLabs(props: {
  mode: UiMode;
  onOpenLab: (lab: LabName) => void;
  onOpenLabs: () => void;
}): ReactElement {
  const { mode } = props;
  return (
    <section className={styles.labs}>
      <div className={styles.labsHead}>
        <h2 className={styles.labsTitle}>{mode === 'research' ? 'Инструменты' : 'Лаборатории'}</h2>
        {mode === 'learn' && (
          <button type="button" className={styles.allLabs} onClick={props.onOpenLabs}>
            Все — с вопросами и временем →
          </button>
        )}
      </div>
      <div className={styles.labTiles}>
        {labEntries(mode).map((entry) => (
          <button
            key={entry.lab}
            type="button"
            className={styles.labTile}
            title={entry.question}
            onClick={() => {
              props.onOpenLab(entry.lab);
            }}
          >
            <b>{entry.name}</b>
            <span>{mode === 'learn' ? entry.hook : entry.short}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// Открыть пример с экскурсией на остановке stop; null — примера нет в списке (папку примеров
// убрали или список ещё грузится).
// Тот же файл может лежать и в traces/ — тогда сервер отдаёт его как свой трейс: годится и он.
function exampleOpener(
  traces: readonly TraceSummary[],
  pick: (next: Selection | null) => void,
  stop = 0,
): (() => void) | null {
  const found = traces.some((trace) => trace.file === TOUR_TRACE);
  return found ? () => pick({ kind: 'trace', file: TOUR_TRACE, tour: stop }) : null;
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

// Экскурсия по примеру «удалёнка»: на какой остановке (null — экскурсия не идёт) и переходы.
interface TourControl {
  stop: number | null;
  go: (stop: number | null) => void;
  finish: () => void;
}

// Экскурсия есть только у трейса примера и только пока не открыта лаборатория поверх.
function tourOf(
  opened: OpenedSelection | null,
  replace: (next: Selection | null) => void,
  pick: (next: Selection | null) => void,
): TourControl | null {
  if (opened?.kind !== 'trace' || opened.file !== TOUR_TRACE) {
    return null;
  }
  const { file } = opened;
  return {
    stop: opened.tour ?? null,
    // Листание внутри экскурсии — только адрес (остановку держит сама экскурсия); начало и выход —
    // через состояние: экскурсия появляется и пропадает.
    go: (stop) => {
      if (stop === TOUR_STOPS.length - 1) {
        markRouteStep('tour');
      }
      if (stop === null || opened.tour === undefined) {
        replace(stop === null ? { kind: 'trace', file } : { kind: 'trace', file, tour: stop });
      } else {
        rewriteAddress({ kind: 'trace', file, tour: stop });
      }
    },
    finish: () => {
      markRouteStep('tour');
      pick(null);
    },
  };
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
  tour: TourControl | null;
}

// Открытая сессия или трейс: слева шапка, виды и плеер, справа колонка «Диалог». Колонка
// свёрнута — вопрос о разрешении встаёт над видами, чтобы его не пропустить.
// Все виды показывают события до курсора повтора — повтор и перемотка работают в каждом.
function OpenStream(props: OpenStreamProps): ReactElement {
  const { events, sessionId, live, header, prompt } = props;
  const [dialogOpen, setDialogOpen, openDialog] = useDialogOpen();
  const replay = useReplay(events, live);
  const { clock, cursor, schedule, view } = replay;
  const [playerCollapsed, togglePlayer] = usePlayerCollapsed();
  const liveStartedAt = live && events[0] !== undefined ? Date.parse(events[0].timestamp) : null;
  const dialog = { events, shown: cursor, sessionId, live };
  const agentLabels = useAgentLabelsOf(events);
  const views = useViews(props.tour?.stop ?? null);
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
            {!dialogOpen && prompt}
            <TourStart tour={props.tour} onStart={views.showStop} />
            <ViewSwitch
              events={events}
              replay={replay}
              liveStartedAt={liveStartedAt}
              traceFile={props.traceFile}
              sessionId={sessionId}
              views={views}
            />
          </div>
          {/* Колонка и полоса живут обе: колонка раздвигается и сдвигается плавно, а текст в ней
            остаётся на месте и не прокручивается заново при каждом открытии. */}
          <div className={styles.dialogSlot} data-tour="dialog">
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
          <TourLayer tour={props.tour} replay={replay} events={events} views={views} />
        </div>
      </OpenDialogContext.Provider>
    </AgentLabelsContext.Provider>
  );
}

// Колонка «Диалог»: на узком экране ложится поверх — там по умолчанию свёрнута.
function useDialogOpen(): [boolean, (open: boolean) => void, () => void] {
  const [open, setOpen] = useState(() => window.innerWidth > 1000);
  const expand = useCallback(() => {
    setOpen(true);
  }, []);
  return [open, setOpen, expand];
}

interface ViewSwitchProps {
  events: HarnessEvent[];
  replay: ReturnType<typeof useReplay>;
  liveStartedAt: number | null;
  traceFile: string | null;
  sessionId: string | null;
  views: Views;
}

// Переключатель видов и сам выбранный вид. Выбор вида живёт выше — его переключает и экскурсия.
function ViewSwitch(props: ViewSwitchProps): ReactElement {
  const { viewName, setViewName, links, link } = props.views;
  const bodyRef = useViewFade(viewName);
  return (
    <ViewLinksContext.Provider value={links}>
      <div className={styles.views}>
        <Segmented label="Вид" options={VIEWS} value={viewName} onChange={setViewName} />
        <div ref={bodyRef} className={styles.viewBody} data-tour="view">
          {VIEW_RENDERERS[viewName]({ ...props, link })}
        </div>
      </div>
    </ViewLinksContext.Provider>
  );
}

// Сменили вкладку — новая мягко проявляется (Web Animations: без лишнего состояния и без
// пересоздания вида). Первую отрисовку и «уменьшить движение» не трогаем.
function useViewFade(viewName: ViewName) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(viewName);
  useEffect(() => {
    const element = ref.current;
    if (element === null || shown.current === viewName) {
      return;
    }
    shown.current = viewName;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    // Только прозрачность, без сдвига: сдвиг двигал бы цель подсветки экскурсии каждый кадр.
    element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  }, [viewName]);
  return ref;
}

type Views = ReturnType<typeof useViews>;

// Какой вид открыт и переходы между видами; showStop — вид и раскрытие остановки экскурсии.
function useViews(initialStop: number | null) {
  const initial = initialStop === null ? undefined : TOUR_STOPS[initialStop];
  const [viewName, setViewName] = useState<ViewName>(initial?.view ?? 'flow');
  const { links, link, show, pick } = useLinkedViews(setViewName, linkOfStop(initial));
  const showStop = useCallback(
    (stop: number) => {
      const data = TOUR_STOPS[stop];
      if (data !== undefined) {
        show(data.view, linkOfStop(data));
      }
    },
    [show],
  );
  // Вкладку выбрали сами — цель прошлой ссылки забыта: вернувшись в вид, не прыгаем к ней снова.
  return { viewName, setViewName: pick, links, link, showStop };
}

// Что раскрыть на остановке: запрос к модели или вызов тула; null — ничего.
function linkOfStop(stop: TourStop | undefined): SearchLink | null {
  if (stop?.focus === undefined) {
    return null;
  }
  return 'requestId' in stop.focus
    ? { toolCallId: null, query: '', requestId: stop.focus.requestId }
    : { toolCallId: stop.focus.toolCallId, query: '' };
}

// Кнопка начать экскурсию над видами — трейс примера открыт без неё (вышли или пришли из списка).
function TourStart(props: {
  tour: TourControl | null;
  onStart: (stop: number) => void;
}): ReactElement | null {
  const mode = useMode();
  const { tour } = props;
  if (tour === null || tour.stop !== null || mode !== 'learn') {
    return null;
  }
  return (
    <div className={styles.tourStart}>
      <span>Это пример для экскурсии: 14 остановок, около 6 минут.</span>
      <Button
        variant="ink"
        onClick={() => {
          props.onStart(0);
          tour.go(0);
        }}
      >
        Начать экскурсию
      </Button>
    </div>
  );
}

// Экскурсия поверх трейса — только в «Обучении»: в «Исследовании» инспектор другой.
function TourLayer(props: {
  tour: TourControl | null;
  replay: ReturnType<typeof useReplay>;
  events: HarnessEvent[];
  views: Views;
}): ReactElement | null {
  const mode = useMode();
  const { tour, views } = props;
  // Трейс открыт в «Исследовании» — шаг маршрута новичка пройден.
  useEffect(() => {
    if (mode === 'research') {
      markRouteStep('research');
    }
  }, [mode]);
  const { showStop } = views;
  const apply = useCallback(
    (stop: number) => {
      showStop(stop);
      tour?.go(stop);
    },
    [showStop, tour],
  );
  // Выход оставляет человека там, где он есть: та же вкладка, тот же момент плеера.
  const exit = useCallback(() => {
    tour?.go(null);
  }, [tour]);
  if (tour?.stop === undefined || tour.stop === null || mode !== 'learn') {
    return null;
  }
  return (
    <Tour
      initial={tour.stop}
      events={props.events}
      clock={props.replay.clock}
      schedule={props.replay.schedule}
      onApply={apply}
      onExit={exit}
      onFinish={tour.finish}
    />
  );
}

type ViewContext = ViewSwitchProps & { link: ReturnType<typeof useLinkedViews>['link'] };

// В «Исследовании» инспектор — экран шагов (решение автора 26.10.2026), в «Обучении» — этапы.
function InspectorOrSteps({ replay, events, traceFile, link }: ViewContext): ReactElement {
  const mode = useMode();
  if (mode === 'research') {
    return (
      <StepsView
        key={`steps-${String(link.nonce)}`}
        focus={link.focusFor('inspector')}
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
  code: ({ events, replay, link }) => (
    <CodeView
      key={`code-${String(link.nonce)}`}
      events={events}
      shown={replay.cursor}
      focus={link.focusFor('code')}
    />
  ),
  context: ({ events, replay, link }) => (
    <ContextView
      key={`context-${String(link.nonce)}`}
      events={events}
      shown={replay.cursor}
      clock={replay.clock}
      schedule={replay.schedule}
      focus={link.focusFor('context')}
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
  skills: ({ events, replay, link }) => (
    <SkillsMemoryView
      key={`skills-${String(link.nonce)}`}
      focus={link.focusFor('skills')}
      events={events}
      shown={replay.cursor}
      clock={replay.clock}
      schedule={replay.schedule}
    />
  ),
  events: ({ replay }) => <EventList events={replay.shown} />,
};

type LinkedView = 'rag' | 'mcp' | 'inspector' | 'context' | 'skills' | 'code';

// Переход из одного вида в другой с целью: какой поиск показать. nonce — новый переход,
// даже к той же цели: вид открывается заново и раскрывает нужное.
function useLinkedViews(setViewName: (view: ViewName) => void, initial: SearchLink | null) {
  const [link, setLink] = useState<{
    view: ViewName | null;
    target: SearchLink | null;
    nonce: number;
  }>(() => ({ view: initial === null ? null : 'inspector', target: initial, nonce: 0 }));
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
      toContext: (target) => {
        go('context', target);
      },
      toSkills: (target) => {
        go('skills', target);
      },
      toCode: (target) => {
        go('code', target);
      },
    };
  }, [setViewName]);
  // Открыть вид с целью или без неё (экскурсия). Заново — только когда цель другая: пересоздать
  // тяжёлый вид без нужды — заметная задержка при листании остановок.
  const show = useCallback(
    (view: ViewName, target: SearchLink | null) => {
      setLink((current) =>
        JSON.stringify(current.target) === JSON.stringify(target)
          ? current
          : { view, target, nonce: current.nonce + 1 },
      );
      setViewName(view);
    },
    [setViewName],
  );
  // Ручной выбор вкладки: цель ссылки сбрасывается. nonce прежний — вид и так открывается заново.
  const pick = useCallback(
    (view: ViewName) => {
      setLink((current) =>
        current.target === null ? current : { view: null, target: null, nonce: current.nonce },
      );
      setViewName(view);
    },
    [setViewName],
  );
  const focusFor = (view: LinkedView): SearchLink | null =>
    link.view === view ? link.target : null;
  return { links, link: { nonce: link.nonce, focusFor }, show, pick };
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
    <div className={styles.dock} data-tour-dock>
      <div className={styles.dockInner} data-tour="player">
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
