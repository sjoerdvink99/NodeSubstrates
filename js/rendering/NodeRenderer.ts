import * as d3 from "https://esm.sh/d3@7";
import type { NodeState, ColorByState, SizeByState, HighlightState } from "../types";
import { CONSTANTS } from "../types";
import { computeBaseRadius } from "../utils/geometry";

const DEFAULT_NODE_COLOR = "#3b82f6";
const DEFAULT_STROKE_COLOR = "#1d4ed8";
const GRAYED_OUT_COLOR = "#d1d5db";
const GRAYED_OUT_STROKE = "#9ca3af";

const NODE_ICONS: Record<string, string> = {
  "Car": "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
  "Accident": "M2.27 21h19.46L12 3.77 2.27 21zm10.18-3h-1.9v-1.9h1.9V18zm0-3.8h-1.9v-3.8h1.9v3.8z",
  "Lawyer": "M20 7h-4V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 5h4v2h-4V5zm10 14H4v-5h4v1c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-1h4v5zm-8-4v-2h4v2h-4zm8-4H4V9h16v2z",
  "Doctor": "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
  "Participant": "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
};

const ICON_SCALE = 0.7;

export class NodeRenderer {
  private group: d3.Selection<SVGGElement, unknown, null, undefined>;
  private sizeBy: SizeByState = { attribute: null, method: null, minSize: CONSTANTS.NODE_RADIUS, maxSize: CONSTANTS.NODE_RADIUS };
  private nodeDrag: d3.DragBehavior<SVGCircleElement, NodeState, unknown> | null = null;
  private onNodeClick: ((event: MouseEvent, node: NodeState) => void) | null = null;
  private onNodeContextMenu: ((event: MouseEvent, node: NodeState) => void) | null = null;
  private onNodeHover: ((node: NodeState | null) => void) | null = null;
  private colorBy: ColorByState = { attribute: null, type: null, colorMap: new Map() };
  private showIcons: boolean = false;
  private highlight: HighlightState = { kind: 'none' };
  private visibleNodeIds: Set<string> | null = null;

  constructor(group: d3.Selection<SVGGElement, unknown, null, undefined>) {
    this.group = group;
  }

  setDragBehavior(drag: d3.DragBehavior<SVGCircleElement, NodeState, unknown>): void {
    this.nodeDrag = drag;
  }

  setClickHandler(handler: (event: MouseEvent, node: NodeState) => void): void {
    this.onNodeClick = handler;
  }

  setContextMenuHandler(handler: (event: MouseEvent, node: NodeState) => void): void {
    this.onNodeContextMenu = handler;
  }

  setHoverHandler(handler: (node: NodeState | null) => void): void {
    this.onNodeHover = handler;
  }

  setColorBy(colorBy: ColorByState): void {
    this.colorBy = colorBy;
    this.showIcons = colorBy.attribute === 'type';
  }

  setSizeBy(sizeBy: SizeByState, nodes?: NodeState[]): void {
    this.sizeBy = { ...sizeBy };
    if (!nodes) return;

    if (sizeBy.method === 'attribute' && sizeBy.attribute) {
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const n of nodes) {
        const v = n.attributes[sizeBy.attribute];
        if (typeof v === 'number') {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min !== Number.POSITIVE_INFINITY) {
        this.sizeBy.attrMin = min;
        this.sizeBy.attrMax = max;
      }
    }

    if (
      sizeBy.method === 'degree' ||
      sizeBy.method === 'clustering' ||
      sizeBy.method === 'betweenness'
    ) {
      let max = 0;
      for (const n of nodes) {
        const v = n.attributes[sizeBy.method as string];
        if (typeof v === 'number' && v > max) max = v;
      }
      if (max > 0) this.sizeBy.computedMax = max;
    }
  }

  setNeighborHighlight(highlight: HighlightState): void {
    this.highlight = highlight;
  }

  setFocusMode(visibleNodeIds: Set<string> | null): void {
    this.visibleNodeIds = visibleNodeIds;
  }

  private isNodeGrayedOut(nodeId: string): boolean {
    if (this.highlight.kind === 'none') return false;
    return !this.highlight.neighborIds.has(nodeId);
  }

  private getNodeColor(node: NodeState): string {
    if (this.isNodeGrayedOut(node.id)) return GRAYED_OUT_COLOR;

    if (!this.colorBy.attribute || this.colorBy.colorMap.size === 0) {
      return DEFAULT_NODE_COLOR;
    }

    const val = node.attributes[this.colorBy.attribute];
    if (val === undefined || val === null) return DEFAULT_NODE_COLOR;

    const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return this.colorBy.colorMap.get(strVal) || DEFAULT_NODE_COLOR;
  }

  private getNodeStroke(node: NodeState): string {
    if (this.isNodeGrayedOut(node.id)) return GRAYED_OUT_STROKE;

    if (this.colorBy.attribute === 'type' && node.attributes['type'] === 'Accident') {
      return "#b91c1c";
    }

    return DEFAULT_STROKE_COLOR;
  }

  private getNodeIcon(node: NodeState): string | null {
    if (!this.showIcons) return null;

    const nodeType = node.attributes['type'];
    if (typeof nodeType === 'string' && NODE_ICONS[nodeType]) {
      return NODE_ICONS[nodeType];
    }
    return null;
  }

  render(nodes: NodeState[], selection: Set<string>): void {
    const nodeGroups = this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .data(nodes, (d) => d.id);

    const enter = nodeGroups
      .enter()
      .append("g")
      .attr("class", "node-group")
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`);

    enter
      .append("circle")
      .attr("class", "node")
      .attr("r", (d) => computeBaseRadius(d, this.sizeBy))
      .attr("fill", (d) => this.getNodeColor(d))
      .attr("stroke", (d) => this.getNodeStroke(d))
      .attr("stroke-width", 1.5);

    enter
      .append("path")
      .attr("class", "node-icon")
      .attr("fill", "white")
      .attr("pointer-events", "none")
      .attr("d", (d) => this.getNodeIcon(d) || "")
      .attr("transform", () => {
        const iconSize = CONSTANTS.NODE_RADIUS * 2 * ICON_SCALE;
        const scale = iconSize / 24;
        const offset = -12 * scale;
        return `translate(${offset}, ${offset}) scale(${scale})`;
      })
      .style("opacity", (d) => this.getNodeIcon(d) ? 1 : 0);

    if (this.nodeDrag) {
      enter.select<SVGCircleElement>("circle.node").call(this.nodeDrag);
    }

    const all = enter.merge(nodeGroups);

    if (this.onNodeClick) {
      const handler = this.onNodeClick;
      all.on("click", function (event, d) {
        event.stopPropagation();
        handler(event, d);
      });
    }

    if (this.onNodeContextMenu) {
      const handler = this.onNodeContextMenu;
      all.on("contextmenu", function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        handler(event, d);
      });
    }

    if (this.onNodeHover) {
      const hoverHandler = this.onNodeHover;
      all
        .on("mouseenter", function (event, d) {
          hoverHandler(d);
        })
        .on("mouseleave", function () {
          hoverHandler(null);
        });
    }

    all.attr("transform", (d) => `translate(${d.x}, ${d.y})`);

    all.select<SVGCircleElement>("circle.node")
      .attr("r", (d) => computeBaseRadius(d, this.sizeBy))
      .attr("fill", (d) => this.getNodeColor(d))
      .attr("stroke", (d) => this.getNodeStroke(d))
      .classed("selected", (d) => selection.has(d.id))
      .classed("substrate-node", (d) => d.isInSubstrate)
      .classed("topological-node", (d) => !d.isInSubstrate)
      .classed("grayed-out", (d) => this.isNodeGrayedOut(d.id));

    all.select<SVGPathElement>("path.node-icon")
      .attr("d", (d) => this.getNodeIcon(d) || "")
      .style("opacity", (d) => this.getNodeIcon(d) ? 1 : 0);

    all.style("display", (d) =>
      this.visibleNodeIds && !this.visibleNodeIds.has(d.id) ? "none" : null
    );

    nodeGroups.exit().remove();
  }

  updateColors(): void {
    this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .select<SVGCircleElement>("circle.node")
      .attr("r", (d) => computeBaseRadius(d, this.sizeBy))
      .attr("fill", (d) => this.getNodeColor(d))
      .attr("stroke", (d) => this.getNodeStroke(d))
      .classed("grayed-out", (d) => this.isNodeGrayedOut(d.id));

    this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .select<SVGPathElement>("path.node-icon")
      .attr("d", (d) => this.getNodeIcon(d) || "")
      .style("opacity", (d) => this.getNodeIcon(d) ? 1 : 0);
  }

  updatePositions(nodes: NodeState[]): void {
    this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .data(nodes, (d) => d.id)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`);
  }

  animateAllToPositions(
    nodes: NodeState[],
    duration: number = CONSTANTS.TRANSITION_DURATION
  ): Promise<void> {
    return this.animateAllToPositionsWithCallback(nodes, undefined, duration);
  }

  animateAllToPositionsWithCallback(
    nodes: NodeState[],
    onProgress?: (progress: number) => void,
    duration: number = CONSTANTS.TRANSITION_DURATION
  ): Promise<void> {
    const targetPositions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const selection = this.group.selectAll<SVGGElement, NodeState>("g.node-group");

      if (selection.empty()) {
        safeResolve();
        return;
      }

      const transition = selection
        .transition()
        .duration(duration)
        .ease(d3.easeCubicInOut)
        .attr("transform", function () {
          const d = d3.select<SVGGElement, NodeState>(this).datum();
          const target = targetPositions.get(d.id);
          const x = target?.x ?? d.x;
          const y = target?.y ?? d.y;
          return `translate(${x}, ${y})`;
        });

      if (onProgress) {
        transition.tween("progress", function () {
          return function (t: number) {
            onProgress(t);
          };
        });
      }

      transition.on("end", safeResolve);
      setTimeout(safeResolve, duration + 100);
    });
  }

  getNodeElement(nodeId: string): SVGCircleElement | null {
    const group = this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .filter((d) => d.id === nodeId);

    if (group.empty()) return null;
    return group.select<SVGCircleElement>("circle.node").node();
  }

  getNodePosition(nodeId: string): { x: number; y: number } | null {
    const group = this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .filter((d) => d.id === nodeId);

    if (group.empty()) return null;

    const transform = group.attr("transform");
    const match = transform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (match) {
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }
    return null;
  }

  animateToPositions(
    nodeIds: string[],
    targetPositions: Map<string, { x: number; y: number }>,
    duration: number = CONSTANTS.TRANSITION_DURATION
  ): void {
    const nodeIdSet = new Set(nodeIds);

    this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .filter((d) => nodeIdSet.has(d.id))
      .transition()
      .duration(duration)
      .ease(d3.easeCubicInOut)
      .attr("transform", (d) => {
        const target = targetPositions.get(d.id);
        const x = target?.x ?? d.x;
        const y = target?.y ?? d.y;
        return `translate(${x}, ${y})`;
      });
  }

  animateToExternalPositions(
    targetPositions: Map<string, { x: number; y: number }>,
    onProgress?: (progress: number) => void,
    duration: number = CONSTANTS.TRANSITION_DURATION
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const selection = this.group.selectAll<SVGGElement, NodeState>("g.node-group");

      if (selection.empty()) {
        safeResolve();
        return;
      }

      const startPositions = new Map<string, { x: number; y: number }>();
      selection.each(function () {
        const d = d3.select<SVGGElement, NodeState>(this).datum();
        const currentTransform = d3.select(this).attr("transform");
        const match = currentTransform?.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match) {
          startPositions.set(d.id, {
            x: parseFloat(match[1]),
            y: parseFloat(match[2])
          });
        } else {
          startPositions.set(d.id, { x: d.x, y: d.y });
        }
      });

      let completedCount = 0;
      const totalCount = selection.size();

      selection.each(function() {
        const element = d3.select<SVGGElement, NodeState>(this);
        const d = element.datum();
        const start = startPositions.get(d.id) || { x: d.x, y: d.y };
        const target = targetPositions.get(d.id) || { x: d.x, y: d.y };

        element
          .transition("layoutAnimation")
          .duration(duration)
          .ease(d3.easeCubicInOut)
          .attrTween("transform", function() {
            return function(t: number) {
              const x = start.x + (target.x - start.x) * t;
              const y = start.y + (target.y - start.y) * t;
              return `translate(${x}, ${y})`;
            };
          })
          .on("end", () => {
            completedCount++;
            if (completedCount >= totalCount) {
              safeResolve();
            }
          });
      });

      if (onProgress) {
        const startTime = Date.now();
        const progressTimer = d3.timer(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(1, elapsed / duration);
          onProgress(progress);
          if (progress >= 1 || resolved) {
            progressTimer.stop();
          }
        });
      }

      setTimeout(safeResolve, duration + 100);
    });
  }

  updateSelection(selection: Set<string>): void {
    this.group
      .selectAll<SVGGElement, NodeState>("g.node-group")
      .select<SVGCircleElement>("circle.node")
      .classed("selected", (d) => selection.has(d.id));
  }
}
