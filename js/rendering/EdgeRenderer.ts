import * as d3 from "https://esm.sh/d3@7";
import type { Edge, NodeState, Substrate, EdgeType, HighlightState } from "../types";
import { calculateBezierPath, calculateStraightPath } from "../utils/geometry";

export class EdgeRenderer {
  private group: d3.Selection<SVGGElement, unknown, null, undefined>;
  private crossGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private highlight: HighlightState = { kind: "none" };
  private visibleNodeIds: Set<string> | null = null;

  constructor(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    crossGroup: d3.Selection<SVGGElement, unknown, null, undefined>
  ) {
    this.group = group;
    this.crossGroup = crossGroup;
  }

  private forEachEdgePath(
    callback: (el: d3.Selection<SVGPathElement, Edge, null, undefined>, d: Edge) => void
  ): void {
    const apply = (g: d3.Selection<SVGGElement, unknown, null, undefined>) => {
      g.selectAll<SVGPathElement, Edge>("path.edge").each((d, i, nodes) => {
        callback(d3.select(nodes[i]) as d3.Selection<SVGPathElement, Edge, null, undefined>, d);
      });
    };
    apply(this.group);
    apply(this.crossGroup);
  }

  setFocusMode(visibleNodeIds: Set<string> | null): void {
    this.visibleNodeIds = visibleNodeIds;
  }

  setNeighborHighlight(highlight: HighlightState): void {
    this.highlight = highlight;
    this.forEachEdgePath((el, d) => {
      const sourceId = typeof d.source === "string" ? d.source : d.source.id;
      const targetId = typeof d.target === "string" ? d.target : d.target.id;
      if (highlight.kind === "active") {
        const inNeighborhood =
          highlight.neighborIds.has(sourceId) && highlight.neighborIds.has(targetId);
        el.classed("edge-neighbor-highlighted", inNeighborhood);
        el.classed("edge-neighbor-dimmed", !inNeighborhood);
      } else {
        el.classed("edge-neighbor-highlighted", false);
        el.classed("edge-neighbor-dimmed", false);
      }
    });
  }

  private classifyEdge(edge: Edge, nodeMap: Map<string, NodeState>): EdgeType {
    const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);

    if (!sourceNode || !targetNode) return "topological";

    if (sourceNode.isInSubstrate && targetNode.isInSubstrate) {
      return sourceNode.substrateId === targetNode.substrateId ? "intra" : "inter";
    }

    if (sourceNode.isInSubstrate || targetNode.isInSubstrate) return "cross";

    return "topological";
  }

  private getEdgePath(
    edge: Edge,
    nodeMap: Map<string, NodeState>,
    edgeType: EdgeType,
    substrates: Substrate[]
  ): string {
    const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const targetId = typeof edge.target === "string" ? edge.target : edge.target.id;
    const source = nodeMap.get(sourceId);
    const target = nodeMap.get(targetId);

    if (!source || !target) return "";

    if (edgeType === "cross") {
      const substrateNode = source.isInSubstrate ? source : target;
      const topoNode = source.isInSubstrate ? target : source;
      return calculateBezierPath(substrateNode, topoNode, 0.3);
    }

    return calculateStraightPath(source, target);
  }

  private applyEdgeState(
    el: d3.Selection<SVGPathElement, Edge, null, undefined>,
    d: Edge,
    nodeMap: Map<string, NodeState>,
    substrates: Substrate[]
  ): void {
    const edgeType = this.classifyEdge(d, nodeMap);
    el
      .attr("class", `edge edge-${edgeType}`)
      .attr("d", this.getEdgePath(d, nodeMap, edgeType, substrates));
  }

  private edgeDataKey(d: Edge): string {
    const sourceId = typeof d.source === "string" ? d.source : d.source.id;
    const targetId = typeof d.target === "string" ? d.target : d.target.id;
    return `${sourceId}-${targetId}`;
  }

  render(edges: Edge[], nodeMap: Map<string, NodeState>, substrates: Substrate[]): void {
    const crossEdges = edges.filter((e) => this.classifyEdge(e, nodeMap) === "cross");
    const otherEdges = edges.filter((e) => this.classifyEdge(e, nodeMap) !== "cross");

    this.renderGroup(this.crossGroup, crossEdges, nodeMap, substrates);
    this.renderGroup(this.group, otherEdges, nodeMap, substrates);
  }

  private renderGroup(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    edges: Edge[],
    nodeMap: Map<string, NodeState>,
    substrates: Substrate[]
  ): void {
    const paths = g
      .selectAll<SVGPathElement, Edge>("path.edge")
      .data(edges, (d) => this.edgeDataKey(d));

    paths
      .enter()
      .append("path")
      .attr("class", "edge")
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .each((d, i, nodes) => {
        this.applyEdgeState(
          d3.select(nodes[i]) as d3.Selection<SVGPathElement, Edge, null, undefined>,
          d,
          nodeMap,
          substrates
        );
      });

    paths.each((d, i, nodes) => {
      this.applyEdgeState(
        d3.select(nodes[i]) as d3.Selection<SVGPathElement, Edge, null, undefined>,
        d,
        nodeMap,
        substrates
      );
    });

    const allPaths = g.selectAll<SVGPathElement, Edge>("path.edge");
    const visibleIds = this.visibleNodeIds;
    if (visibleIds) {
      allPaths.style("display", (d) => {
        const src = typeof d.source === "string" ? d.source : d.source.id;
        const tgt = typeof d.target === "string" ? d.target : d.target.id;
        return visibleIds.has(src) && visibleIds.has(tgt) ? null : "none";
      });
    } else {
      allPaths.style("display", null);
    }

    paths.exit().remove();
  }

  updatePositions(edges: Edge[], nodeMap: Map<string, NodeState>, substrates: Substrate[]): void {
    this.forEachEdgePath((el, d) => {
      this.applyEdgeState(el, d, nodeMap, substrates);
    });
  }
}
