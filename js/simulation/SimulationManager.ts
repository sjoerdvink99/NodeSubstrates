import * as d3 from "https://esm.sh/d3@7";
import type { NodeState, SimulationEdge } from "../types";
import { CONSTANTS } from "../types";
import type { StateManager } from "../state/StateManager";
import type { SizeByState } from "../types";
import { computeBaseRadius } from "../utils/geometry";

function forceSubstrateAvoidance(stateManager: StateManager) {
  let nodes: NodeState[] = [];
  const padding = 20;

  function force(_alpha: number) {
    const substrates = stateManager.getState().substrates;

    for (const node of nodes) {
      if (node.isInSubstrate || node.fx !== null) continue;
      if (node.x === undefined || node.y === undefined) continue;

      for (const substrate of substrates) {
        if (!substrate.bounds) continue;

        const b = substrate.bounds;
        const left = b.x - padding;
        const right = b.x + b.width + padding;
        const top = b.y - padding;
        const bottom = b.y + b.height + padding;

        if (node.x > left && node.x < right && node.y > top && node.y < bottom) {
          const distLeft = node.x - left;
          const distRight = right - node.x;
          const distTop = node.y - top;
          const distBottom = bottom - node.y;

          const minDist = Math.min(distLeft, distRight, distTop, distBottom);

          if (minDist === distLeft) {
            node.x = left - 1;
            node.vx = Math.min(node.vx ?? 0, -5);
          } else if (minDist === distRight) {
            node.x = right + 1;
            node.vx = Math.max(node.vx ?? 0, 5);
          } else if (minDist === distTop) {
            node.y = top - 1;
            node.vy = Math.min(node.vy ?? 0, -5);
          } else {
            node.y = bottom + 1;
            node.vy = Math.max(node.vy ?? 0, 5);
          }
        }
      }
    }
  }

  force.initialize = function(_nodes: NodeState[]) {
    nodes = _nodes;
  };

  return force;
}

export class SimulationManager {
  private simulation: d3.Simulation<NodeState, SimulationEdge>;
  private collisionForce: d3.ForceCollide<NodeState> | null = null;
  private stateManager: StateManager;
  private onTick: () => void;
  private width: number;
  private height: number;

  constructor(
    stateManager: StateManager,
    width: number,
    height: number,
    onTick: () => void
  ) {
    this.stateManager = stateManager;
    this.width = width;
    this.height = height;
    this.onTick = onTick;

    const state = stateManager.getState();
    this.simulation = this.createSimulation(state.nodes, state.edges);
  }

  private createSimulation(
    nodes: NodeState[],
    edges: SimulationEdge[]
  ): d3.Simulation<NodeState, SimulationEdge> {
    this.collisionForce = d3.forceCollide<NodeState>()
      .radius(() => CONSTANTS.NODE_RADIUS * CONSTANTS.COLLISION_RADIUS_MULTIPLIER);

    return d3
      .forceSimulation<NodeState>(nodes)
      .force(
        "link",
        d3
          .forceLink<NodeState, SimulationEdge>(edges)
          .id((d) => d.id)
          .distance(80)
          .strength(0)
      )
      .force("charge", d3.forceManyBody<NodeState>().strength(0))
      .force("collision", this.collisionForce as d3.ForceCollide<NodeState>)
      .force("substrateAvoidance", forceSubstrateAvoidance(this.stateManager))
      .alphaDecay(0.1)
      .velocityDecay(0.6)
      .on("tick", this.handleTick)
      .stop();
  }

  relayoutForSizeChange(nodes: NodeState[], sizeBy: SizeByState): void {
    if (!this.collisionForce) return;

    let attrMin = Number.POSITIVE_INFINITY;
    let attrMax = Number.NEGATIVE_INFINITY;
    let computedMax = 0;

    if (sizeBy.method === 'attribute' && sizeBy.attribute) {
      for (const n of nodes) {
        const v = n.attributes[sizeBy.attribute];
        if (typeof v === 'number') {
          if (v < attrMin) attrMin = v;
          if (v > attrMax) attrMax = v;
        }
      }
      if (attrMin === Number.POSITIVE_INFINITY) {
        attrMin = sizeBy.minSize;
        attrMax = sizeBy.maxSize;
      }
    }

    if (
      sizeBy.method === 'degree' ||
      sizeBy.method === 'clustering' ||
      sizeBy.method === 'betweenness'
    ) {
      for (const n of nodes) {
        const v = n.attributes[sizeBy.method as string];
        if (typeof v === 'number' && v > computedMax) computedMax = v;
      }
      if (computedMax <= 0) computedMax = 1;
    }

    const enrichedSizeBy: SizeByState = {
      ...sizeBy,
      attrMin: attrMin === Number.POSITIVE_INFINITY ? undefined : attrMin,
      attrMax: attrMax === Number.NEGATIVE_INFINITY ? undefined : attrMax,
      computedMax: computedMax > 0 ? computedMax : undefined,
    };

    this.collisionForce.radius(
      (n: NodeState) => computeBaseRadius(n, enrichedSizeBy) * CONSTANTS.COLLISION_RADIUS_MULTIPLIER
    );

    this.simulation.nodes(nodes);
    this.simulation.alpha(0.3).restart();
  }

  private handleTick = (): void => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of this.simulation.nodes()) {
      if (node.x !== undefined && node.y !== undefined) {
        positions.set(node.id, { x: node.x, y: node.y });
      }
    }
    this.stateManager.updateNodePositions(positions);
    this.onTick();
  };

  updateData(nodes: NodeState[], edges: SimulationEdge[]): void {
    this.simulation.nodes(nodes);

    const linkForce = this.simulation.force("link") as d3.ForceLink<
      NodeState,
      SimulationEdge
    >;
    if (linkForce) {
      linkForce.links(edges);
    }

    if (this.simulation.alpha() < 0.01) {
      this.simulation.alpha(0.03).restart();
    }
  }

  forceRestart(nodes: NodeState[], edges: SimulationEdge[]): void {
    this.simulation.nodes(nodes);

    const linkForce = this.simulation.force("link") as d3.ForceLink<
      NodeState,
      SimulationEdge
    >;
    if (linkForce) {
      linkForce.links(edges);
    }

    this.simulation.alpha(0.05).restart();
  }

  updateConstraints(): void {}

  startNodeDrag(): void {
    this.simulation.alphaTarget(0.3).restart();
  }

  startSubstrateDrag(): void {
    const chargeForce = this.simulation.force("charge") as d3.ForceManyBody<NodeState>;
    if (chargeForce) {
      chargeForce.strength(-50);
    }
    this.simulation.alphaTarget(0.5).restart();
  }

  endNodeDrag(): void {
    this.simulation.alphaTarget(0);
  }

  endSubstrateDrag(): void {
    const chargeForce = this.simulation.force("charge") as d3.ForceManyBody<NodeState>;
    if (chargeForce) {
      chargeForce.strength(0);
    }
    this.simulation.alphaTarget(0);
  }

  releaseNodes(): void {
    this.simulation.alpha(0.5).restart();
  }

  gentleRestart(): void {
    if (this.simulation.alpha() < 0.05) {
      this.simulation.alpha(0.1).restart();
    }
  }

  pause(): void {
    this.simulation.stop();
  }

  resume(): void {
    this.simulation.alpha(0.01).restart();
  }

  stop(): void {
    this.simulation.stop();
  }

  setDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.gentleRestart();
  }

  getAlpha(): number {
    return this.simulation.alpha();
  }

  getSimulation(): d3.Simulation<NodeState, SimulationEdge> {
    return this.simulation;
  }
}
