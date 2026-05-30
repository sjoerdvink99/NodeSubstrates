import type { SimulationNodeDatum, SimulationLinkDatum } from "d3";

export interface WidgetModel {
  get<K extends keyof WidgetState>(key: K): WidgetState[K];
  set<K extends keyof WidgetState>(key: K, value: WidgetState[K]): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

export interface WidgetState {
  nodes: Node[];
  edges: Edge[];
  substrates: Substrate[];
  dr_method: DRMethod;
  dr_params: DRParams;
  suggested_regions: Suggestion[];
  width: number;
  height: number;
  selected_nodes: string[];
  command: Command;
  ready: boolean;
  layout: string;
  rerun_layout: number;
  layout_scale: number;
}

export interface Node extends SimulationNodeDatum {
  id: string;
  label: string;
  attributes: Record<string, unknown>;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  _substrateId?: string;
  _originalX?: number;
  _originalY?: number;
}

export interface Edge {
  source: string | Node | NodeState;
  target: string | Node | NodeState;
  weight: number;
}

export interface SimulationEdge extends SimulationLinkDatum<NodeState> {
  source: string | NodeState;
  target: string | NodeState;
  weight: number;
}

export interface Substrate {
  id: string;
  node_ids: string[];
  projections: Projection[];
  dr_method: DRMethod;
  label: string;
  bounds: SubstrateBounds | null;
  projection_attrs?: string[];
}

export interface Projection {
  id: string;
  x: number;
  y: number;
}

export interface SubstrateBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DRMethod = "pca" | "umap" | "tsne";

export interface DRParams {
  n_neighbors?: number;
  min_dist?: number;
  perplexity?: number;
  random_state?: number;
  svd_solver?: string;
}

export interface Suggestion {
  node_ids: string[];
  score: number;
  label: string;
  reason: string;
  recommended_dr: DRMethod;
}

export type Command =
  | { action: "create_substrate"; substrate_id: string }
  | { action: "dissolve_substrate"; substrate_id: string }
  | { action: "update_substrate"; substrate_id: string }
  | { action: "request_create_substrate"; node_ids: string[]; dr_method?: DRMethod; click_x?: number; click_y?: number }
  | { action: "request_rename"; substrate_id: string; label: string }
  | { action: "request_update_dr"; substrate_id: string; dr_method: DRMethod }
  | { action: "request_update_projection_attrs"; substrate_id: string; attribute_names: string[] }
  | { action: "request_dissolve"; substrate_id: string }
  | { action: "request_add_to_substrate"; substrate_id: string; node_id: string }
  | { action: "request_resize_substrate"; substrate_id: string; bounds: SubstrateBounds }
  | { action: "request_pin_highlight"; node_id?: string; node_ids?: string[] }
  | { action: "request_temp_highlight"; node_id?: string | null; node_ids?: string[] | null }
  | Record<string, never>;

export type EdgeType = "topological" | "intra" | "inter" | "cross";

export interface ClassifiedEdge extends Edge {
  type: EdgeType;
}

export interface RenderContext {
  width: number;
  height: number;
  nodes: Node[];
  edges: Edge[];
  substrates: Substrate[];
  nodeMap: Map<string, Node>;
  substrateNodeIds: Set<string>;
}

export type InteractionMode = 'idle' | 'lasso' | 'drag-node' | 'drag-substrate' | 'zooming';

export interface ColorByState {
  attribute: string | null;
  type: 'categorical' | 'numeric' | null;
  colorMap: Map<string, string>;
}

export type SizeMethod = 'attribute' | 'degree' | 'clustering' | 'betweenness' | null;

export interface SizeByState {
  attribute: string | null;
  method: SizeMethod;
  minSize: number;
  maxSize: number;
  attrMin?: number;
  attrMax?: number;
  computedMax?: number;
}

export type HighlightState =
  | { kind: 'none' }
  | { kind: 'active'; neighborIds: Set<string> };

export interface AppState {
  nodes: NodeState[];
  edges: SimulationEdge[];
  substrates: Substrate[];
  nodeMap: Map<string, NodeState>;
  substrateNodeIds: Set<string>;
  nodeToSubstrate: Map<string, string>;
  selection: Set<string>;
  hoveredNode: string | null;
  activeInteraction: InteractionMode;
  colorBy: ColorByState;
  sizeBy: SizeByState;
  highlight: HighlightState;
  pinnedHighlightNodeId: string | null;
  width: number;
  height: number;
  activeSubstrateId?: string | null;
  focusMode: boolean;
  visibleNodeIds: Set<string> | null;
}

export interface NodeState extends SimulationNodeDatum {
  readonly id: string;
  readonly label: string;
  readonly attributes: Record<string, unknown>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  isInSubstrate: boolean;
  substrateId: string | null;
}

export const CONSTANTS = {
  NODE_RADIUS: 6,
  EDGE_OPACITY: 0.4,
  SUBSTRATE_PADDING: 40,
  SUBSTRATE_MARGIN: 20,
  TRANSITION_DURATION: 2000,
  COLLISION_RADIUS_MULTIPLIER: 1.5,
  RESIZE_HANDLE_SIZE: 12,
} as const;
