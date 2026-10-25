// Рисует кадр «Потока» в готовый SVG: меняет атрибуты, текст и классы у заранее созданных
// элементов. Никаких новых элементов в кадре — только переиспользуемые пулы точек и подписей.

import { laneRoute, type FlowAction } from '../../timeline/actions';
import type { Frame, WaitingNode } from '../../timeline/frame';
import {
  FLOW_NODES,
  hopsOf,
  LANES,
  routePoint,
  type FlowNode,
  type FlowNodeId,
  type Point,
} from './flowGraph';

export const DOT_POOL = 4;
export const LABEL_POOL = 6;
export const TRAIL = 6;
// Шаг шлейфа вдоль полосы: доля пути между соседними кружками.
const TRAIL_STEP = 0.03;

export interface FlowElements {
  lanes: Record<string, SVGPathElement | null>;
  nodes: Partial<Record<FlowNodeId, SVGGElement | null>>;
  labels: (SVGGElement | null)[];
  dots: (SVGGElement | null)[];
  what: HTMLSpanElement | null;
  detail: HTMLSpanElement | null;
}

// Плавный разгон и торможение: каждое действие начинается мягко, без рывка.
export function ease(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2;
}

export function drawFrame(elements: FlowElements, frame: Frame): void {
  drawLanes(elements, frame);
  drawNodes(elements, frame);
  drawLabels(elements, frame);
  drawDots(elements, frame);
  if (elements.what !== null && elements.detail !== null) {
    elements.what.textContent = frame.caption?.what ?? 'Сессия ещё не началась';
    elements.detail.textContent = frame.caption?.detail ?? 'нажмите «Воспроизвести»';
  }
}

function drawLanes(elements: FlowElements, frame: Frame): void {
  // Подсвечен весь маршрут действия: видно, через кого идёт вызов.
  const active = new Map<string, string>();
  for (const dot of frame.dots) {
    for (const hop of hopsOf(laneRoute(dot.action, dot.lane), dot.lane)) {
      active.set(hop, dot.action.group);
    }
  }
  for (const action of frame.parked) {
    for (const hop of hopsOf(action.route, 'out')) {
      active.set(hop, action.group);
    }
  }
  for (const [key, path] of Object.entries(elements.lanes)) {
    path?.setAttribute('data-active', String(active.has(key)));
    path?.setAttribute('data-group', active.get(key) ?? '');
  }
}

// Подпись стоит у адресата: «туда» — на последнем переходе, «обратно» — на первом.
function labelPoint(route: FlowAction['route'], lane: 'out' | 'back'): Point {
  const hops = hopsOf(route, lane);
  const hop = lane === 'out' ? hops.at(-1) : hops[0];
  return LANES[hop ?? '']?.label ?? { x: 0, y: 0 };
}

function drawNodes(elements: FlowElements, frame: Frame): void {
  for (const node of Object.values(FLOW_NODES)) {
    const group = elements.nodes[node.id];
    if (group !== undefined && group !== null) {
      drawNode(group, node, frame);
    }
  }
}

function drawNode(group: SVGGElement, node: FlowNode, frame: Frame): void {
  const waiting = frame.waiting.find((item) => item.node === node.id);
  const inside = frame.insideLabels.find((label) => label.action.to === node.id);
  const share = frame.busyShare[node.id] ?? 0;
  group.setAttribute('data-busy', String(waiting !== undefined));
  group.setAttribute('data-group', waiting?.group ?? inside?.action.group ?? '');
  group.setAttribute('data-heat', String(share >= 0.01));
  const sub = group.querySelector<SVGTextElement>('text:nth-of-type(2)');
  if (sub !== null) {
    sub.textContent =
      group.dataset.idle === 'true' ? 'в этой сессии не работал' : subtitleOf(node, waiting, share);
  }
  const heat = group.querySelector<SVGRectElement>('rect:last-of-type');
  heat?.setAttribute('width', ((node.width - 32) * share).toFixed(1));
}

// Под названием узла: что он делает сейчас, иначе сколько времени был занят, иначе его роль.
function subtitleOf(node: FlowNode, waiting: WaitingNode | undefined, share: number): string {
  if (waiting !== undefined) {
    return `${waiting.label} ${formatSeconds(waiting.elapsedMs)}`;
  }
  return share >= 0.01 ? `занят ${String(Math.round(share * 100))} % времени` : node.role;
}

function drawLabels(elements: FlowElements, frame: Frame): void {
  const labels = [
    ...frame.labels.map((label) => ({
      text: label.lane === 'out' ? label.action.out : (label.action.back ?? ''),
      group: label.action.group,
      at: labelPoint(laneRoute(label.action, label.lane), label.lane),
      opacity: label.opacity,
    })),
    ...frame.insideLabels.map((label) => {
      const node = FLOW_NODES[label.action.to];
      return {
        text: label.action.out,
        group: label.action.group,
        at: { x: node.x, y: node.y - node.height / 2 - 22 },
        opacity: label.opacity,
      };
    }),
  ];
  elements.labels.forEach((group, index) => {
    const label = labels[index];
    if (group === null) {
      return;
    }
    if (label === undefined) {
      group.setAttribute('opacity', '0');
      return;
    }
    placeLabel(group, label);
  });
}

interface PlacedLabel {
  text: string;
  group: string;
  at: Point;
  opacity: number;
}

function placeLabel(
  group: SVGGElement,
  { text, group: groupName, at, opacity }: PlacedLabel,
): void {
  const shown = text.length > 34 ? `${text.slice(0, 34)}…` : text;
  const width = Math.min(260, shown.length * 7.2 + 24);
  const rect = group.querySelector('rect');
  const label = group.querySelector('text');
  if (label !== null && label.textContent !== shown) {
    label.textContent = shown;
  }
  rect?.setAttribute('x', String(-width / 2));
  rect?.setAttribute('width', String(width));
  group.setAttribute('data-group', groupName);
  group.setAttribute('transform', `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
  group.setAttribute('opacity', opacity.toFixed(2));
}

interface DotSpec {
  route: FlowAction['route'];
  lane: 'out' | 'back';
  progress: number;
  group: string;
}

function drawDots(elements: FlowElements, frame: Frame): void {
  // Пользователь просил меньше движения — точки сразу у адресата, без полёта.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const all: DotSpec[] = [
    ...frame.dots.map((dot) => ({
      route: laneRoute(dot.action, dot.lane),
      lane: dot.lane,
      progress: reduced ? 1 : dot.progress,
      group: dot.action.group,
    })),
    ...frame.parked.map((action) => ({
      route: action.route,
      lane: 'out' as const,
      progress: 1,
      group: action.group,
    })),
  ];
  elements.dots.forEach((group, index) => {
    const dot = all[index];
    if (group === null) {
      return;
    }
    if (dot === undefined) {
      group.setAttribute('opacity', '0');
      return;
    }
    group.setAttribute('opacity', '1');
    group.setAttribute('data-group', dot.group);
    placeDot(group, dot);
  });
}

// Голова, ореол и шлейф: шлейф отстаёт по маршруту и виден только в полёте.
function placeDot(group: SVGGElement, dot: DotSpec): void {
  const circles = group.querySelectorAll('circle');
  const travelling = dot.progress < 1;
  const hops = Math.max(1, dot.route.length - 1);
  circles.forEach((circle, circleIndex) => {
    const isTrail = circle.dataset.part === 'trail';
    // Кружки шлейфа идут после ореола: первый отстаёт сильнее всех.
    const back = isTrail ? (TRAIL + 1 - circleIndex) * (TRAIL_STEP / hops) : 0;
    const point = routePoint(dot.route, dot.lane, ease(dot.progress) - back);
    circle.setAttribute('cx', point.x.toFixed(1));
    circle.setAttribute('cy', point.y.toFixed(1));
    if (isTrail) {
      circle.setAttribute('opacity', travelling ? (0.12 + circleIndex * 0.04).toFixed(2) : '0');
    }
  });
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
}
