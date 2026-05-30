import * as d3 from "https://esm.sh/d3@7";

export class ZoomHandler {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private enabled: boolean = true;

  constructor(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>
  ) {
    this.svg = svg;
    this.mainGroup = mainGroup;

    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => this.filterZoom(event))
      .on("zoom", (event) => {
        this.mainGroup.attr("transform", event.transform);
      });

    this.svg.call(this.zoom);
    this.svg.on("dblclick.zoom", null);
  }

  private filterZoom(event: Event & { shiftKey?: boolean; ctrlKey?: boolean; target?: Element }): boolean {
    if (!this.enabled) return false;
    if (event.shiftKey) return false;

    if (event.ctrlKey) {
      const target = event.target as Element;
      if (
        target.classList?.contains("substrate-region") ||
        target.closest?.(".substrate-group")
      ) {
        return false;
      }
    }

    return true;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.svg
      .transition()
      .duration(750)
      .call(this.zoom.transform, d3.zoomIdentity);
  }

  setScale(scale: number, animate: boolean = true): void {
    const width = +this.svg.attr("width");
    const height = +this.svg.attr("height");

    const tx = (width - width * scale) / 2;
    const ty = (height - height * scale) / 2;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    if (animate) {
      this.svg.transition().duration(750).call(this.zoom.transform, transform);
    } else {
      this.svg.call(this.zoom.transform, transform);
    }
  }

  getTransform(): d3.ZoomTransform {
    return d3.zoomTransform(this.svg.node()!);
  }
}
