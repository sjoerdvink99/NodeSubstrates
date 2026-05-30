import * as d3 from "https://esm.sh/d3@7";

export interface LoadingOverlayOptions {
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  width: number;
  height: number;
  visible: boolean;
}

export class LoadingOverlay {
  private overlay: d3.Selection<HTMLDivElement, unknown, null, undefined>;

  constructor(options: LoadingOverlayOptions) {
    this.overlay = options.container
      .append("div")
      .attr("class", "loading-overlay")
      .style("width", `${options.width}px`)
      .style("height", `${options.height}px`)
      .style("display", options.visible ? "flex" : "none")
      .style("position", "absolute")
      .style("top", "0")
      .style("left", "0")
      .style("background", "rgba(255, 255, 255, 0.9)")
      .style("justify-content", "center")
      .style("align-items", "center")
      .style("z-index", "1000")
      .style("font-family", "sans-serif")
      .style("color", "#666");

    this.overlay.append("span").text("Computing layout...");
  }

  show(): void {
    this.overlay.style("display", "flex");
  }

  hide(): void {
    this.overlay.style("display", "none");
  }

  setVisible(visible: boolean): void {
    this.overlay.style("display", visible ? "flex" : "none");
  }

  setWidth(width: number): void {
    this.overlay.style("width", `${width}px`);
  }
}
