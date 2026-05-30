import type { NodeState, SizeByState } from "../types";
import { CONSTANTS } from "../types";

export function isPointInPolygon(
  x: number,
  y: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

export function calculateBezierPath(
  source: NodeState,
  target: NodeState,
  curveStrength: number = 0.3
): string {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0) {
    return `M${source.x},${source.y}L${target.x},${target.y}`;
  }

  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  const offset = dist * curveStrength;
  const perpX = (-dy / dist) * offset;
  const perpY = (dx / dist) * offset;

  const controlX = midX + perpX;
  const controlY = midY + perpY;

  return `M${source.x},${source.y} Q${controlX},${controlY} ${target.x},${target.y}`;
}

export function calculateStraightPath(
  source: NodeState,
  target: NodeState
): string {
  return `M${source.x},${source.y}L${target.x},${target.y}`;
}

export function rectBoundaryExit(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) return from;

  const left   = bounds.x;
  const right  = bounds.x + bounds.width;
  const top    = bounds.y;
  const bottom = bounds.y + bounds.height;

  const candidates: number[] = [];

  if (dx > 0) candidates.push((right  - from.x) / dx);
  if (dx < 0) candidates.push((left   - from.x) / dx);
  if (dy > 0) candidates.push((bottom - from.y) / dy);
  if (dy < 0) candidates.push((top    - from.y) / dy);

  const t = Math.min(...candidates.filter((v) => v > 1e-6));

  if (!isFinite(t)) return from;

  return { x: from.x + t * dx, y: from.y + t * dy };
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeBaseRadius(node: NodeState, sizeBy: SizeByState): number {
  if (!sizeBy.method) return CONSTANTS.NODE_RADIUS;

  if (
    sizeBy.method === 'degree' ||
    sizeBy.method === 'clustering' ||
    sizeBy.method === 'betweenness'
  ) {
    const val = node.attributes[sizeBy.method];
    if (typeof val === 'number') {
      const maxVal = sizeBy.computedMax ?? 1;
      const norm = Math.min(1, val / Math.max(1, maxVal));
      return sizeBy.minSize + norm * (sizeBy.maxSize - sizeBy.minSize);
    }
    return CONSTANTS.NODE_RADIUS;
  }

  if (sizeBy.method === 'attribute' && sizeBy.attribute) {
    const v = node.attributes[sizeBy.attribute];
    if (typeof v === 'number') {
      const attrMin = sizeBy.attrMin ?? v;
      const attrMax = sizeBy.attrMax ?? v;
      if (attrMax === attrMin) return (sizeBy.minSize + sizeBy.maxSize) / 2;
      const norm = (v - attrMin) / (attrMax - attrMin);
      return sizeBy.minSize + norm * (sizeBy.maxSize - sizeBy.minSize);
    }
    return CONSTANTS.NODE_RADIUS;
  }

  return CONSTANTS.NODE_RADIUS;
}
