import type {
  WidgetModel,
  Node,
  SimulationEdge,
  Substrate,
  NodeState,
  AppState,
  InteractionMode,
  ColorByState,
  HighlightState,
} from "../types";
import { CONSTANTS } from "../types";
import { computeKHopNeighborhood } from "../utils/graph";

type StateListener = (state: AppState, prevState: AppState | null) => void;

const CATEGORICAL_COLORS = [
  "#6366f1",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#ef4444",
  "#64748b",
  "#0ea5e9",
  "#a855f7",
];

export class StateManager {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private model: WidgetModel;

  constructor(model: WidgetModel) {
    this.model = model;
    this.state = this.createInitialState(model);
  }

  private createInitialState(model: WidgetModel): AppState {
    const width = model.get("width");
    const height = model.get("height");

    const nodes = this.createNodeStates(model.get("nodes"), width, height);
    const edges = model.get("edges") as SimulationEdge[];
    const substrates = model.get("substrates");

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const { substrateNodeIds, nodeToSubstrate } = this.computeSubstrateMappings(substrates);

    this.applySubstrateConstraints(nodes, substrates, nodeMap);

    return {
      nodes,
      edges,
      substrates,
      nodeMap,
      substrateNodeIds,
      nodeToSubstrate,
      selection: new Set(model.get("selected_nodes")),
      hoveredNode: null,
      activeInteraction: "idle",
      colorBy: {
        attribute: null,
        type: null,
        colorMap: new Map(),
      },
      sizeBy: {
        attribute: null,
        method: null,
        minSize: 4,
        maxSize: 18,
      },
      highlight: { kind: 'none' },
      pinnedHighlightNodeId: null,
      width,
      height,
      activeSubstrateId: null,
      focusMode: false,
      visibleNodeIds: null,
    };
  }

  private createNodeStates(
    modelNodes: Node[],
    width: number,
    height: number
  ): NodeState[] {
    return modelNodes.map((n) => ({
      id: n.id,
      label: n.label,
      attributes: n.attributes,
      x: n.x ?? width / 2,
      y: n.y ?? height / 2,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      isInSubstrate: false,
      substrateId: null,
    }));
  }

  private computeSubstrateMappings(substrates: Substrate[]): {
    substrateNodeIds: Set<string>;
    nodeToSubstrate: Map<string, string>;
  } {
    const substrateNodeIds = new Set<string>();
    const nodeToSubstrate = new Map<string, string>();

    for (const substrate of substrates) {
      for (const nodeId of substrate.node_ids) {
        substrateNodeIds.add(nodeId);
        nodeToSubstrate.set(nodeId, substrate.id);
      }
    }

    return { substrateNodeIds, nodeToSubstrate };
  }

  private applySubstrateConstraints(
    nodes: NodeState[],
    substrates: Substrate[],
    nodeMap: Map<string, NodeState>
  ): void {
    for (const node of nodes) {
      node.fx = null;
      node.fy = null;
      node.isInSubstrate = false;
      node.substrateId = null;
    }

    for (const substrate of substrates) {
      if (!substrate.bounds) continue;

      for (const proj of substrate.projections) {
        const node = nodeMap.get(proj.id);
        if (!node) continue;

        const fx =
          substrate.bounds.x +
          CONSTANTS.SUBSTRATE_PADDING +
          ((proj.x + 1) / 2) *
            (substrate.bounds.width - CONSTANTS.SUBSTRATE_PADDING * 2);
        const fy =
          substrate.bounds.y +
          CONSTANTS.SUBSTRATE_PADDING +
          ((proj.y + 1) / 2) *
            (substrate.bounds.height - CONSTANTS.SUBSTRATE_PADDING * 2);

        node.fx = fx;
        node.fy = fy;
        node.x = fx;
        node.y = fy;
        node.isInSubstrate = true;
        node.substrateId = substrate.id;
      }
    }
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  getActiveSubstrateId(): string | null {
    return this.state.activeSubstrateId ?? null;
  }

  setActiveSubstrateId(id: string | null): void {
    const prevState = this.state;
    this.state = { ...this.state, activeSubstrateId: id };
    this.notify(prevState);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(prevState: AppState | null): void {
    for (const listener of this.listeners) {
      listener(this.state, prevState);
    }
  }

  updateFromModel(): void {
    const prevState = this.state;
    const model = this.model;

    const newModelNodes = model.get("nodes");
    const nodes = newModelNodes.map((modelNode) => {
      const existing = this.state.nodeMap.get(modelNode.id);
      if (existing) {
        const posChanged =
          modelNode.x !== undefined &&
          modelNode.y !== undefined &&
          (Math.abs((existing.x ?? 0) - modelNode.x) > 1 ||
           Math.abs((existing.y ?? 0) - modelNode.y) > 1);

        const useNewPosition = posChanged && !existing.isInSubstrate;

        return {
          ...existing,
          label: modelNode.label,
          attributes: modelNode.attributes,
          x: useNewPosition ? modelNode.x : existing.x,
          y: useNewPosition ? modelNode.y : existing.y,
          vx: useNewPosition ? 0 : existing.vx,
          vy: useNewPosition ? 0 : existing.vy,
        };
      }
      return {
        id: modelNode.id,
        label: modelNode.label,
        attributes: modelNode.attributes,
        x: modelNode.x ?? Math.random() * this.state.width,
        y: modelNode.y ?? Math.random() * this.state.height,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        isInSubstrate: false,
        substrateId: null,
      };
    });

    const edges = model.get("edges") as SimulationEdge[];
    const substrates = model.get("substrates");

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const { substrateNodeIds, nodeToSubstrate } = this.computeSubstrateMappings(substrates);

    this.computeSubstrateBounds(substrates);
    this.applySubstrateConstraints(nodes, substrates, nodeMap);

    this.state = {
      ...this.state,
      nodes,
      edges,
      substrates,
      nodeMap,
      substrateNodeIds,
      nodeToSubstrate,
      visibleNodeIds: this.computeVisibleNodeIds(this.state.focusMode, substrateNodeIds, edges),
    };

    this.notify(prevState);
  }

  private computeVisibleNodeIds(
    focusMode: boolean,
    substrateNodeIds: Set<string>,
    edges: SimulationEdge[]
  ): Set<string> | null {
    if (!focusMode || substrateNodeIds.size === 0) return null;
    return computeKHopNeighborhood(Array.from(substrateNodeIds), edges, 1);
  }

  toggleFocusMode(): void {
    const prevState = this.state;
    const focusMode = !this.state.focusMode;
    const visibleNodeIds = this.computeVisibleNodeIds(focusMode, this.state.substrateNodeIds, this.state.edges);
    this.state = { ...this.state, focusMode, visibleNodeIds };
    this.notify(prevState);
  }

  private computeSubstrateBounds(substrates: Substrate[]): void {
    if (substrates.length === 0) return;

    const { width, height } = this.state;
    const availableWidth = width - CONSTANTS.SUBSTRATE_MARGIN * 2;
    const substrateWidth = Math.min(
      250,
      availableWidth / substrates.length - CONSTANTS.SUBSTRATE_MARGIN
    );
    const substrateHeight = Math.min(200, height * 0.4);

    substrates.forEach((substrate, i) => {
      if (!substrate.bounds) {
        substrate.bounds = {
          x: width - CONSTANTS.SUBSTRATE_MARGIN - (i + 1) * (substrateWidth + CONSTANTS.SUBSTRATE_MARGIN),
          y: CONSTANTS.SUBSTRATE_MARGIN,
          width: substrateWidth,
          height: substrateHeight,
        };
      }
    });
  }

  setSelection(nodeIds: string[]): void {
    const prevState = this.state;
    const newSelection = new Set(nodeIds);

    if (nodeIds.length > 1) {
      this.state = {
        ...this.state,
        selection: newSelection,
        highlight: { kind: 'active', neighborIds: newSelection },
      };
    } else if (nodeIds.length === 1) {
      this.state = {
        ...this.state,
        selection: newSelection,
      };
    } else {
      if (this.state.pinnedHighlightNodeId) {
        this.state = {
          ...this.state,
          selection: newSelection,
          highlight: { kind: 'active', neighborIds: this.computeNeighbors(this.state.pinnedHighlightNodeId) },
        };
      } else {
        this.state = {
          ...this.state,
          selection: newSelection,
          highlight: { kind: 'none' },
        };
      }
    }

    this.notify(prevState);
  }

  setInteractionMode(mode: InteractionMode): void {
    if (this.state.activeInteraction === mode) return;

    const prevState = this.state;
    this.state = { ...this.state, activeInteraction: mode };
    this.notify(prevState);
  }

  updateNodePositions(updates: Map<string, { x: number; y: number }>): void {
    for (const [nodeId, pos] of updates) {
      const node = this.state.nodeMap.get(nodeId);
      if (node && node.fx === null) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }
  }

  moveSubstrate(substrateId: string, dx: number, dy: number): void {
    const substrate = this.state.substrates.find((s) => s.id === substrateId);
    if (!substrate || !substrate.bounds) return;

    substrate.bounds.x += dx;
    substrate.bounds.y += dy;

    for (const nodeId of substrate.node_ids) {
      const node = this.state.nodeMap.get(nodeId);
      if (node && node.fx !== null && node.fy !== null) {
        node.fx += dx;
        node.fy += dy;
        node.x = node.fx;
        node.y = node.fy;
      }
    }
  }

  setSubstrateBounds(substrateId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const prevState = this.state;
    const substrates = this.state.substrates.map((s) => {
      if (s.id === substrateId) {
        return { ...s, bounds: { ...bounds } };
      }
      return s;
    });

    const nodeMap = new Map(this.state.nodes.map((n) => [n.id, n]));
    this.applySubstrateConstraints(this.state.nodes, substrates, nodeMap);

    this.state = { ...this.state, substrates, nodeMap };
    this.notify(prevState);
  }

  setColorBy(attribute: string, type: 'categorical' | 'numeric'): void {
    const prevState = this.state;

    const uniqueValues = new Set<string>();
    for (const node of this.state.nodes) {
      const val = node.attributes[attribute];
      if (val !== undefined && val !== null) {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        uniqueValues.add(strVal);
      }
    }

    const colorMap = new Map<string, string>();

    const specialColors: Record<string, string> = {
      "Accident": "#ef4444",
      "Participant": "#7da6c7",
    };

    const sortedValues = Array.from(uniqueValues).sort();
    let colorIndex = 0;
    sortedValues.forEach((val) => {
      if (attribute === 'type' && specialColors[val]) {
        colorMap.set(val, specialColors[val]);
      } else {
        colorMap.set(val, CATEGORICAL_COLORS[colorIndex % CATEGORICAL_COLORS.length]);
        colorIndex++;
      }
    });

    this.state = {
      ...this.state,
      colorBy: { attribute, type, colorMap },
    };

    this.notify(prevState);
  }

  clearColorBy(): void {
    const prevState = this.state;
    this.state = {
      ...this.state,
      colorBy: { attribute: null, type: null, colorMap: new Map() },
    };
    this.notify(prevState);
  }

  setSizeBy(attribute: string | null, method: 'attribute' | 'degree' | 'clustering' | 'betweenness' | null, minSize = 4, maxSize = 18): void {
    const prevState = this.state;
    this.state = {
      ...this.state,
      sizeBy: { attribute, method, minSize, maxSize },
    };
    this.notify(prevState);
  }

  clearSizeBy(): void {
    const prevState = this.state;
    this.state = {
      ...this.state,
      sizeBy: { attribute: null, method: null, minSize: 4, maxSize: 18 },
    };
    this.notify(prevState);
  }

  private computeNeighbors(nodeId: string): Set<string> {
    return computeKHopNeighborhood([nodeId], this.state.edges, 1);
  }

  setHighlightedNode(nodeId: string | null): void {
    const prevState = this.state;

    if (this.state.pinnedHighlightNodeId !== null) return;
    if (this.state.selection.size > 0) return;

    const highlight: HighlightState = nodeId === null
      ? { kind: 'none' }
      : { kind: 'active', neighborIds: this.computeNeighbors(nodeId) };

    this.state = { ...this.state, highlight };
    this.notify(prevState);
  }

  setHighlightedNodes(nodeIds: string[] | null): void {
    const prevState = this.state;
    if (this.state.selection.size > 0) return;

    const highlight: HighlightState = (!nodeIds || nodeIds.length === 0)
      ? { kind: 'none' }
      : { kind: 'active', neighborIds: new Set(nodeIds) };

    this.state = { ...this.state, highlight };
    this.notify(prevState);
  }

  pinHighlightedNode(nodeId: string): void {
    const prevState = this.state;

    this.state = {
      ...this.state,
      highlight: { kind: 'active', neighborIds: this.computeNeighbors(nodeId) },
      pinnedHighlightNodeId: nodeId,
    };

    this.notify(prevState);
  }

  clearNodeHighlight(): void {
    const prevState = this.state;

    this.state = {
      ...this.state,
      highlight: { kind: 'none' },
      pinnedHighlightNodeId: null,
    };

    this.notify(prevState);
  }

  findSubstrateAtPoint(x: number, y: number): Substrate | null {
    for (const substrate of this.state.substrates) {
      if (!substrate.bounds) continue;
      const b = substrate.bounds;
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return substrate;
      }
    }
    return null;
  }
}
