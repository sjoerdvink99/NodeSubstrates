import * as d3 from "https://esm.sh/d3@7";
import type { NodeState } from "../types";
import { isPointInPolygon } from "../utils/geometry";

type LassoCompleteCallback = (selectedIds: string[], event: MouseEvent) => void;

export class LassoHandler {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private interactionLayer: d3.Selection<SVGGElement, unknown, null, undefined>;

  private lassoPath: d3.Selection<SVGPathElement, unknown, null, undefined>;
  private lassoOverlay: d3.Selection<SVGRectElement, unknown, null, undefined>;
  private lassoPoints: [number, number][] = [];
  private isActive: boolean = false;

  private nodes: NodeState[] = [];
  private onComplete: LassoCompleteCallback | null = null;

  constructor(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    interactionLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number
  ) {
    this.svg = svg;
    this.mainGroup = mainGroup;
    this.interactionLayer = interactionLayer;

    this.lassoPath = this.interactionLayer
      .append("path")
      .attr("class", "lasso-path")
      .style("display", "none");

    this.lassoOverlay = this.interactionLayer
      .append("rect")
      .attr("class", "lasso-overlay")
      .attr("width", width * 10)
      .attr("height", height * 10)
      .attr("x", -width * 5)
      .attr("y", -height * 5)
      .attr("fill", "transparent")
      .style("pointer-events", "none");

    const lassoDrag = d3
      .drag<SVGRectElement, unknown>()
      .on("start", (event) => this.onDragStart(event))
      .on("drag", (event) => this.onDrag(event))
      .on("end", (event) => this.onDragEnd(event));

    this.lassoOverlay.call(lassoDrag);

    this.setupKeyTracking();
  }

  private setupKeyTracking(): void {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Shift" && !this.isActive) {
        this.activate();
      } else if (e.key === "Escape" && this.lassoPoints.length > 0) {
        this.reset();
      }
    });

    document.addEventListener("keyup", (e) => {
      if (e.key === "Shift" && this.lassoPoints.length === 0) {
        this.deactivate();
      }
    });

    window.addEventListener("blur", () => {
      if (this.lassoPoints.length === 0) {
        this.deactivate();
      }
    });
  }

  private activate(): void {
    this.isActive = true;
    this.lassoOverlay.style("pointer-events", "all");
    this.svg.style("cursor", "crosshair");
    this.interactionLayer.raise();
  }

  private deactivate(): void {
    this.isActive = false;
    this.lassoOverlay.style("pointer-events", "none");
    this.svg.style("cursor", null);
    this.interactionLayer.lower();
  }

  private reset(): void {
    this.lassoPoints = [];
    this.lassoPath.style("display", "none").attr("d", "");
    this.deactivate();
  }

  private onDragStart(event: d3.D3DragEvent<SVGRectElement, unknown, unknown>): void {
    const [x, y] = d3.pointer(event, this.mainGroup.node());
    this.lassoPoints = [[x, y]];
    this.lassoPath.style("display", "block");
  }

  private onDrag(event: d3.D3DragEvent<SVGRectElement, unknown, unknown>): void {
    const [x, y] = d3.pointer(event, this.mainGroup.node());
    this.lassoPoints.push([x, y]);
    this.updatePath();
  }

  private onDragEnd(event: d3.D3DragEvent<SVGRectElement, unknown, unknown>): void {
    this.deactivate();

    if (this.lassoPoints.length >= 3) {
      this.lassoPoints.push(this.lassoPoints[0]);
      this.updatePath();

      const selectedIds = this.nodes
        .filter((node) => isPointInPolygon(node.x, node.y, this.lassoPoints))
        .map((node) => node.id);

      if (this.onComplete) {
        this.onComplete(selectedIds, event.sourceEvent as MouseEvent);
      }
    }

    setTimeout(() => {
      this.lassoPoints = [];
      this.lassoPath.style("display", "none").attr("d", "");
    }, 150);
  }

  private updatePath(): void {
    if (this.lassoPoints.length < 2) return;
    const lineGenerator = d3.line();
    this.lassoPath.attr("d", lineGenerator(this.lassoPoints));
  }

  setNodes(nodes: NodeState[]): void {
    this.nodes = nodes;
  }

  setOnComplete(callback: LassoCompleteCallback): void {
    this.onComplete = callback;
  }

  isLassoActive(): boolean {
    return this.isActive;
  }
}
