// Схема потока: участники и связи между ними. Координаты — в единицах viewBox SVG (1120 × 600),
// схема масштабируется вместе с контейнером.
//
// Харнесс — не один узел, а контейнер с частями: цикл агента, контекст и prompt, политика,
// retrieval, исполнение тулов. Рамка «агент» обводит цикл и модель: модель снаружи харнесса,
// цикл внутри — так видно, где кончается агент и начинается харнесс (docs/plan.md, этап 8c).

export type FlowNodeId =
  | 'user'
  | 'loop'
  | 'context'
  | 'policy'
  | 'retrieval'
  | 'tools'
  | 'model'
  | 'mcp'
  | 'network'
  | 'sandbox';

export interface FlowNode {
  id: FlowNodeId;
  title: string;
  // Подпись под названием: что это за участник.
  role: string;
  // Подсказка при наведении: что он делает в сессии.
  about: string;
  // Часть харнесса — рисуется внутри его контейнера.
  part: boolean;
  // Подпись и подсказка, когда участник в сессии не работал; нет — общая «в этой сессии не работал».
  idleRole?: string;
  idleAbout?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const VIEW_WIDTH = 1120;
export const VIEW_HEIGHT = 600;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const HARNESS_BOX: Box = { x: 220, y: 30, width: 590, height: 545 };
export const AGENT_BOX: Box = { x: 395, y: 98, width: 700, height: 124 };

type NodeSpec = Omit<FlowNode, 'id'>;

function place(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

const SPECS: Record<FlowNodeId, NodeSpec> = {
  user: {
    title: 'Пользователь',
    role: 'вопрос и разрешения',
    about: 'Задаёт вопрос, отвечает на запросы разрешения, получает ответ.',
    part: false,
    ...place(115, 300, 170, 72),
  },
  loop: {
    title: 'Цикл агента',
    role: 'решает, что делать с ответом',
    about:
      'Часть агента внутри харнесса: отправляет prompt модели, разбирает ответ, вызывает тулы, решает, когда закончить.',
    part: true,
    ...place(515, 150, 220, 72),
  },
  context: {
    title: 'Контекст и prompt',
    role: 'история, system, тулы',
    about: 'Собирает prompt: system, историю диалога, результаты тулов и описания тулов.',
    part: true,
    ...place(335, 315, 170, 66),
  },
  policy: {
    title: 'Политика',
    role: 'можно ли выполнить',
    about: 'Каждый вызов tool проходит через неё: выполнить, спросить пользователя или запретить.',
    part: true,
    ...place(515, 315, 150, 66),
  },
  retrieval: {
    title: 'Retrieval',
    role: 'ищет до вопроса модели',
    about: 'Ищет сам, до первого запроса к модели, и подмешивает найденное в контекст.',
    part: true,
    ...place(705, 315, 170, 66),
  },
  tools: {
    title: 'Исполнение тулов',
    role: 'свои тулы и MCP-клиент',
    about:
      'Выполняет вызовы: свои тулы (файлы, поиск, страницы) и тулы MCP-серверов через MCP-клиент.',
    part: true,
    ...place(515, 475, 190, 66),
  },
  model: {
    title: 'Модель',
    role: 'LLM по API',
    about: 'Часть агента снаружи харнесса: получает prompt, возвращает текст или tool_calls.',
    part: false,
    ...place(990, 150, 170, 72),
  },
  mcp: {
    title: 'MCP-сервер',
    role: 'отдельный процесс',
    about: 'Отдельный процесс со своими тулами; харнесс говорит с ним по JSON-RPC.',
    part: false,
    ...place(990, 380, 170, 72),
  },
  // Код-арена (этап 10): тесты — отдельный процесс Node на вашей машине. Снаружи харнесса:
  // харнесс его запускает, но код в нём написала модель.
  sandbox: {
    title: 'Запуск кода',
    role: 'node --permission',
    about:
      'Отдельный процесс Node: тесты (run_tests) и программы агента (run_node) в папке проекта, с моделью разрешений — файлы только в ней, без других программ и ключей. Код в нём написала модель.',
    part: false,
    idleRole: 'только в Код-арене',
    idleAbout:
      'Работает только в Код-арене — это режим в «Лаборатории → Код-арена»: агент правит проект, а тесты и его программы идут здесь, в отдельном процессе Node с моделью разрешений. В обычной сессии харнесс код не запускает.',
    ...place(115, 475, 170, 72),
  },
  network: {
    title: 'Интернет',
    role: 'поиск и сайты',
    about: 'Куда тулы ходят по сети: напрямую или через прокси.',
    part: false,
    ...place(990, 510, 170, 72),
  },
};

export const FLOW_NODES = Object.fromEntries(
  Object.entries(SPECS).map(([id, spec]) => [id, { id, ...spec }]),
) as Record<FlowNodeId, FlowNode>;

// Связи рисуются всегда — по ним видно, кто с кем вообще может говорить. Вызов tool идёт из
// цикла через политику к исполнению: политика — шлагбаум на этом пути.
export const FLOW_EDGES: readonly [FlowNodeId, FlowNodeId][] = [
  ['user', 'loop'],
  ['loop', 'model'],
  ['loop', 'context'],
  ['loop', 'policy'],
  ['loop', 'retrieval'],
  ['policy', 'tools'],
  ['retrieval', 'model'],
  ['retrieval', 'mcp'],
  ['tools', 'mcp'],
  ['tools', 'network'],
  ['tools', 'sandbox'],
];

export interface Point {
  x: number;
  y: number;
}

// Точка на краю узла в сторону другого узла: пакет вылетает из края и прилетает к краю,
// а не к центру — там название узла.
export function boundaryPoint(node: FlowNode, toward: FlowNode): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (dx === 0 && dy === 0) {
    return { x: node.x, y: node.y };
  }
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : node.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : node.height / 2 / Math.abs(dy),
  );
  return { x: node.x + dx * scale, y: node.y + dy * scale };
}

// Полоса — кривая Безье от края одного узла к краю другого (как ребро в React Flow), сдвинутая
// вбок: у каждой связи две полосы, «туда» и «обратно», и точка идёт ровно по нарисованной.
export interface Lane {
  // Путь для атрибута d у <path>.
  path: string;
  at: (progress: number) => Point;
  // Где стоит подпись полосы: посередине, сбоку от неё — со своей стороны у каждой полосы.
  label: Point;
}

export const LANE_OFFSET = 6;
const LABEL_OFFSET = 22;
const CURVE = 0.45;

export function laneOf(fromId: FlowNodeId, toId: FlowNodeId): Lane {
  const from = FLOW_NODES[fromId];
  const to = FLOW_NODES[toId];
  const start = boundaryPoint(from, to);
  const end = boundaryPoint(to, from);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Сдвиг вбок — по нормали к хорде; у встречной полосы нормаль смотрит в другую сторону.
  const normal = { x: -dy / length, y: dx / length };
  const shift = (point: Point, distance: number): Point => ({
    x: point.x - normal.x * distance,
    y: point.y - normal.y * distance,
  });
  const vertical = Math.abs(dy) > Math.abs(dx);
  const control1 = vertical
    ? { x: start.x, y: start.y + dy * CURVE }
    : { x: start.x + dx * CURVE, y: start.y };
  const control2 = vertical
    ? { x: end.x, y: end.y - dy * CURVE }
    : { x: end.x - dx * CURVE, y: end.y };
  const points = [start, control1, control2, end].map((point) =>
    shift(point, LANE_OFFSET),
  ) as Bezier;
  const at = (progress: number): Point => cubic(points, progress);
  const [p0, p1, p2, p3] = points;
  return {
    path: `M ${format(p0)} C ${format(p1)}, ${format(p2)}, ${format(p3)}`,
    at,
    label: shift(at(0.5), LABEL_OFFSET),
  };
}

type Bezier = [Point, Point, Point, Point];

// Точка кубической кривой Безье: веса — многочлены Бернштейна.
function cubic(points: Bezier, progress: number): Point {
  const rest = 1 - progress;
  const weights = [
    rest ** 3,
    3 * rest * rest * progress,
    3 * rest * progress * progress,
    progress ** 3,
  ];
  return points.reduce(
    (sum, point, index) => ({
      x: sum.x + (weights[index] ?? 0) * point.x,
      y: sum.y + (weights[index] ?? 0) * point.y,
    }),
    { x: 0, y: 0 },
  );
}

function format(point: Point): string {
  return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
}

// Все полосы схемы, «откуда>куда», — посчитаны один раз.
export const LANES: Record<string, Lane | undefined> = Object.fromEntries(
  FLOW_EDGES.flatMap(([fromId, toId]) => [
    [`${fromId}>${toId}`, laneOf(fromId, toId)],
    [`${toId}>${fromId}`, laneOf(toId, fromId)],
  ]),
);

// Маршрут действия — цепочка участников: цикл → политика → исполнение → MCP-сервер.
// «Туда» точка идёт по маршруту, «обратно» — по нему же в обратную сторону.
export type Route = readonly FlowNodeId[];

export function hopsOf(route: Route, lane: 'out' | 'back'): string[] {
  const path = lane === 'out' ? route : [...route].reverse();
  return path.slice(1).map((node, index) => `${path[index] ?? node}>${node}`);
}

// Точка на маршруте: каждому переходу — равная доля пути.
export function routePoint(route: Route, lane: 'out' | 'back', progress: number): Point {
  const hops = hopsOf(route, lane);
  const clamped = Math.max(0, Math.min(1, progress));
  const scaled = clamped * hops.length;
  const index = Math.min(hops.length - 1, Math.floor(scaled));
  const point = LANES[hops[index] ?? '']?.at(scaled - index);
  return point ?? { x: 0, y: 0 };
}

// Подпись под названием и подсказка с учётом того, работал ли участник в этой сессии.
export function nodeRole(node: FlowNode, idle: boolean): string {
  return idle ? (node.idleRole ?? 'в этой сессии не работал') : node.role;
}

export function nodeAbout(node: FlowNode, idle: boolean): string {
  return idle ? (node.idleAbout ?? node.about) : node.about;
}
