import type { SimulationEdge } from "../types";

export function computeKHopNeighborhood(
  startIds: string[],
  edges: SimulationEdge[],
  k: number
): Set<string> {
  const result = new Set<string>(startIds);
  for (let hop = 0; hop < k; hop++) {
    const frontier = new Set<string>(result);
    for (const edge of edges) {
      const src = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const tgt = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (frontier.has(src)) result.add(tgt);
      if (frontier.has(tgt)) result.add(src);
    }
  }
  return result;
}
