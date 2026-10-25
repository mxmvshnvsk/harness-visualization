// Рисует кадр «Потока» в готовый SVG: меняет атрибуты, текст и классы у заранее созданных
// элементов. Никаких новых элементов в кадре — только переиспользуемые пулы точек и подписей.

import type { Frame, WaitingNode } from '../../timeline/frame';
import { FLOW_NODES, LANES, type FlowNode, type FlowNodeId, type Point } from './flowGraph';

export const DOT_POOL = 4;
export const LABEL_POOL = 6;
export const TRAIL = 6;
// Шаг шлейфа вдоль полосы: доля пути между соседними кружками.
const TRAIL_STEP = 0.022;

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

function laneKey(from: FlowNodeId, to: FlowNodeId, lane: 'out' | 'back'): string {
  return lane === 'out' ? `${from}>${to}` : `${to}>${from}`;
}

function drawLanes(elements: FlowElements, frame: Frame): void {
  const active = new Map<string, string>();
  for (const dot of frame.dots) {
    active.set(laneKey(dot.action.from, dot.action.to, dot.lane), dot.action.group);
  }
  for (const action of frame.parked) {
    active.set(laneKey(action.from, action.to, 'out'), action.group);
  }
  for (const [key, path] of Object.entries(elements.lanes)) {
    path?.setAttribute('data-active', String(active.has(key)));
    path?.setAttribute('data-group', active.get(key) ?? '');
  }
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
  group.setAttribute('data-heat', String(share > 0));
  const sub = group.querySelector<SVGTextElement>('text:nth-of-type(2)');
  if (sub !== null) {
    sub.textContent = subtitleOf(node, waiting, share);
  }
  const heat = group.querySelector<SVGRectElement>('rect:last-of-type');
  heat?.setAttribute('width', ((node.width - 32) * share).toFixed(1));
}

// Под названием узла: что он делает сейчас, иначе сколько времени был занят, иначе его роль.
function subtitleOf(node: FlowNode, waiting: WaitingNode | undefined, share: number): string {
  if (waiting !== undefined) {
    return `${waiting.label} ${formatSeconds(waiting.elapsedMs)}`;
  }
  return share > 0 ? `занят ${String(Math.round(share * 100))} % времени` : node.role;
}

function drawLabels(elements: FlowElements, frame: Frame): void {
  const labels = [
    ...frame.labels.map((label) => ({
      text: label.lane === 'out' ? label.action.out : (label.action.back ?? ''),
      group: label.action.group,
      at: LANES[laneKey(label.action.from, label.action.to, label.lane)]?.label ?? { x: 0, y: 0 },
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

function drawDots(elements: FlowElements, frame: Frame): void {
  const moving = frame.dots.map((dot) => ({
    lane: LANES[laneKey(dot.action.from, dot.action.to, dot.lane)],
    progress: dot.progress,
    group: dot.action.group,
  }));
  const parked = frame.parked.map((action) => ({
    lane: LANES[`${action.from}>${action.to}`],
    progress: 1,
    group: action.group,
  }));
  // Пользователь просил меньше движения — точки сразу у адресата, без полёта.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const all = [...moving, ...parked].map((dot) => (reduced ? { ...dot, progress: 1 } : dot));
  elements.dots.forEach((group, index) => {
    const dot = all[index];
    if (group === null) {
      return;
    }
    if (dot?.lane === undefined) {
      group.setAttribute('opacity', '0');
      return;
    }
    group.setAttribute('opacity', '1');
    group.setAttribute('data-group', dot.group);
    const circles = group.querySelectorAll('circle');
    const travelling = dot.progress < 1;
    circles.forEach((circle, circleIndex) => {
      const isHead = circleIndex === circles.length - 1;
      const back = isHead ? 0 : (TRAIL - circleIndex) * TRAIL_STEP;
      const point = dot.lane?.at(Math.max(0, ease(dot.progress) - back)) ?? { x: 0, y: 0 };
      circle.setAttribute('cx', point.x.toFixed(1));
      circle.setAttribute('cy', point.y.toFixed(1));
      if (!isHead) {
        circle.setAttribute('opacity', travelling ? (0.12 + circleIndex * 0.04).toFixed(2) : '0');
      }
    });
  });
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
}
