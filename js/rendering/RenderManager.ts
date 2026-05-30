import * as d3 from "https://esm.sh/d3@7";
import type { AppState, NodeState, Substrate } from "../types";
import { CONSTANTS } from "../types";
import { NodeRenderer } from "./NodeRenderer";
import { EdgeRenderer } from "./EdgeRenderer";
import { SubstrateRenderer } from "./SubstrateRenderer";

export interface RenderLayers {
  interaction: d3.Selection<SVGGElement, unknown, null, undefined>;
  crossEdges: d3.Selection<SVGGElement, unknown, null, undefined>;
  substrates: d3.Selection<SVGGElement, unknown, null, undefined>;
  edges: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: d3.Selection<SVGGElement, unknown, null, undefined>;
  substrateHandles: d3.Selection<SVGGElement, unknown, null, undefined>;
}

export class RenderManager {
  private nodeRenderer: NodeRenderer;
  private edgeRenderer: EdgeRenderer;
  private substrateRenderer: SubstrateRenderer;
  private layers: RenderLayers;

  constructor(mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
    this.layers = {
      interaction: mainGroup.append("g").attr("class", "interaction-layer"),
      substrates: mainGroup.append("g").attr("class", "substrates-layer"),
      edges: mainGroup.append("g").attr("class", "edges-layer"),
      nodes: mainGroup.append("g").attr("class", "nodes-layer"),
      substrateHandles: mainGroup.append("g").attr("class", "substrate-handles-layer"),
      crossEdges: mainGroup.append("g").attr("class", "cross-edges-layer"),
    };

    this.nodeRenderer = new NodeRenderer(this.layers.nodes);
    this.edgeRenderer = new EdgeRenderer(this.layers.edges, this.layers.crossEdges);
    this.substrateRenderer = new SubstrateRenderer(this.layers.substrates);
    this.substrateRenderer.setHandlesLayer(this.layers.substrateHandles);
  }

  getNodeRenderer(): NodeRenderer {
    return this.nodeRenderer;
  }

  getEdgeRenderer(): EdgeRenderer {
    return this.edgeRenderer;
  }

  getSubstrateRenderer(): SubstrateRenderer {
    return this.substrateRenderer;
  }

  getInteractionLayer(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return this.layers.interaction;
  }

  render(state: AppState): void {
    this.nodeRenderer.setColorBy(state.colorBy);
    this.nodeRenderer.setSizeBy(state.sizeBy, state.nodes);
    this.nodeRenderer.setNeighborHighlight(state.highlight);
    this.nodeRenderer.setFocusMode(state.visibleNodeIds);
    this.edgeRenderer.setFocusMode(state.visibleNodeIds);

    this.substrateRenderer.render(state.substrates);
    this.edgeRenderer.render(state.edges, state.nodeMap, state.substrates);
    this.nodeRenderer.render(state.nodes, state.selection);
  }

  updateColors(state: AppState): void {
    this.nodeRenderer.setColorBy(state.colorBy);
    this.nodeRenderer.updateColors();
  }

  updateNeighborHighlight(state: AppState): void {
    this.nodeRenderer.setNeighborHighlight(state.highlight);
    this.nodeRenderer.updateColors();
    this.edgeRenderer.setNeighborHighlight(state.highlight);
  }

  tick(state: AppState): void {
    this.nodeRenderer.updatePositions(state.nodes);
    this.edgeRenderer.updatePositions(state.edges, state.nodeMap, state.substrates);
    this.substrateRenderer.updatePositions(state.substrates);
  }

  async animateLayoutChange(state: AppState): Promise<void> {
    const animatingNodeMap = new Map(state.nodeMap);

    this.substrateRenderer.render(state.substrates);

    await this.nodeRenderer.animateAllToPositionsWithCallback(
      state.nodes,
      () => {
        for (const node of state.nodes) {
          const animNode = animatingNodeMap.get(node.id);
          if (animNode) {
            const pos = this.nodeRenderer.getNodePosition(node.id);
            if (pos) {
              animNode.x = pos.x;
              animNode.y = pos.y;
            }
          }
        }
        this.edgeRenderer.updatePositions(state.edges, animatingNodeMap, state.substrates);
      }
    );

    this.render(state);
  }

  async animateToTargetPositions(
    targetPositions: Map<string, { x: number; y: number }>,
    currentState: AppState
  ): Promise<void> {
    const animatingNodeMap = new Map(currentState.nodeMap);

    await this.nodeRenderer.animateToExternalPositions(
      targetPositions,
      () => {
        for (const [nodeId] of targetPositions) {
          const animNode = animatingNodeMap.get(nodeId);
          if (animNode) {
            const pos = this.nodeRenderer.getNodePosition(nodeId);
            if (pos) {
              animNode.x = pos.x;
              animNode.y = pos.y;
            }
          }
        }
        this.edgeRenderer.updatePositions(currentState.edges, animatingNodeMap, currentState.substrates);
      }
    );
  }

  updateSelection(selection: Set<string>): void {
    this.nodeRenderer.updateSelection(selection);
  }

  updateSubstratePosition(substrateId: string, x: number, y: number): void {
    this.substrateRenderer.updateTransform(substrateId, x, y);
  }

  animateToSubstrate(
    substrate: Substrate,
    nodeMap: Map<string, NodeState>
  ): void {
    if (!substrate.bounds) return;

    const targetPositions = new Map<string, { x: number; y: number }>();

    for (const proj of substrate.projections) {
      const x =
        substrate.bounds.x +
        CONSTANTS.SUBSTRATE_PADDING +
        ((proj.x + 1) / 2) * (substrate.bounds.width - CONSTANTS.SUBSTRATE_PADDING * 2);
      const y =
        substrate.bounds.y +
        CONSTANTS.SUBSTRATE_PADDING +
        ((proj.y + 1) / 2) * (substrate.bounds.height - CONSTANTS.SUBSTRATE_PADDING * 2);
      targetPositions.set(proj.id, { x, y });
    }

    this.nodeRenderer.animateToPositions(
      substrate.node_ids,
      targetPositions
    );
  }

}
