import * as d3 from "https://esm.sh/d3@7";
import type { WidgetModel, SizeByState } from "../types";

export interface SettingsModalOptions {
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  model: WidgetModel;
  getSizeBy?: () => SizeByState;
  onApplySizeRange?: (minSize: number, maxSize: number) => void;
}

const LAYOUT_OPTIONS = [
  { value: "spring", label: "Force-Directed (Spring)" },
  { value: "kamada_kawai", label: "Kamada-Kawai" },
  { value: "circular", label: "Circular" },
  { value: "shell", label: "Shell" },
  { value: "spectral", label: "Spectral" },
  { value: "planar", label: "Planar" },
  { value: "bipartite", label: "Bipartite" },
  { value: "multipartite", label: "Multipartite" },
  { value: "bfs", label: "BFS Tree" },
];

export class SettingsModal {
  private overlay: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private layoutSelect: d3.Selection<HTMLSelectElement, unknown, null, undefined>;
  private minSizeInput: d3.Selection<HTMLInputElement, unknown, null, undefined> | null = null;
  private maxSizeInput: d3.Selection<HTMLInputElement, unknown, null, undefined> | null = null;
  private model: WidgetModel;
  private getSizeBy?: () => SizeByState;
  private onApplySizeRange?: (minSize: number, maxSize: number) => void;

  constructor(options: SettingsModalOptions) {
    this.model = options.model;
    this.getSizeBy = options.getSizeBy;
    this.onApplySizeRange = options.onApplySizeRange;

    this.overlay = options.container
      .append("div")
      .attr("class", "settings-modal-overlay");

    const modal = this.overlay
      .append("div")
      .attr("class", "settings-modal");

    modal
      .append("div")
      .attr("class", "settings-modal-header")
      .text("Layout Settings");

    const modalBody = modal
      .append("div")
      .attr("class", "settings-modal-body");

    const layoutField = modalBody
      .append("div")
      .attr("class", "settings-field");

    layoutField
      .append("label")
      .attr("class", "settings-field-label")
      .text("Graph Layout Algorithm");

    this.layoutSelect = layoutField
      .append("select")
      .attr("class", "settings-field-select");

    this.layoutSelect
      .selectAll("option")
      .data(LAYOUT_OPTIONS)
      .enter()
      .append("option")
      .attr("value", (d) => d.value)
      .text((d) => d.label);

    this.updateLayoutValue();

    const sizeField = modalBody
      .append("div")
      .attr("class", "settings-field");

    sizeField
      .append("label")
      .attr("class", "settings-field-label")
      .text("Node size range (radius)");

    const sizeControls = sizeField.append("div").style("display", "flex").style("gap", "8px");

    this.minSizeInput = sizeControls
      .append("input")
      .attr("type", "number")
      .attr("class", "settings-field-input")
      .attr("placeholder", "min")
      .attr("min", "1");

    this.maxSizeInput = sizeControls
      .append("input")
      .attr("type", "number")
      .attr("class", "settings-field-input")
      .attr("placeholder", "max")
      .attr("min", "1");

    const modalFooter = modal
      .append("div")
      .attr("class", "settings-modal-footer");

    modalFooter
      .append("button")
      .attr("class", "settings-btn settings-btn-cancel")
      .text("Cancel")
      .on("click", () => this.close());

    modalFooter
      .append("button")
      .attr("class", "settings-btn settings-btn-ok")
      .text("OK")
      .on("click", () => this.apply());

    this.overlay.on("click", (event) => {
      if (event.target === this.overlay.node()) {
        this.close();
      }
    });

    this.model.on("change:layout", () => this.updateLayoutValue());
  }

  private updateLayoutValue(): void {
    const currentLayout = this.model.get("layout") || "spring";
    this.layoutSelect.property("value", currentLayout);
  }

  open(): void {
    this.updateLayoutValue();
    if (this.getSizeBy && this.minSizeInput && this.maxSizeInput) {
      const sb = this.getSizeBy();
      this.minSizeInput.property("value", String(sb.minSize));
      this.maxSizeInput.property("value", String(sb.maxSize));
    }
    this.overlay.classed("visible", true);
  }

  close(): void {
    this.updateLayoutValue();
    this.overlay.classed("visible", false);
  }

  private apply(): void {
    const newLayout = this.layoutSelect.property("value");
    this.model.set("layout", newLayout);
    this.model.save_changes();
    if (this.onApplySizeRange && this.minSizeInput && this.maxSizeInput) {
      const minVal = Number(this.minSizeInput.property("value"));
      const maxVal = Number(this.maxSizeInput.property("value"));
      if (!Number.isNaN(minVal) && !Number.isNaN(maxVal) && minVal > 0 && maxVal >= minVal) {
        this.onApplySizeRange(minVal, maxVal);
      }
    }
    this.overlay.classed("visible", false);
  }
}
