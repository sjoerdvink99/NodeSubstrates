import * as d3 from "https://esm.sh/d3@7";
import type { WidgetModel, Substrate, Node, DRMethod } from "../types";

export interface SubstrateSettingsModalOptions {
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  model: WidgetModel;
}

const DR_METHODS: { key: DRMethod; label: string }[] = [
  { key: "pca", label: "PCA" },
  { key: "umap", label: "UMAP" },
  { key: "tsne", label: "t-SNE" },
];

export class SubstrateSettingsModal {
  private overlay: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private modal: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private titleElement: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private attrCheckboxContainer: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private projectionSection: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private resultArea: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private methodGroup: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private model: WidgetModel;
  private currentSubstrate: Substrate | null = null;
  private selectedAttrs: Set<string> = new Set();
  private numericAttrs: string[] = [];
  private isLoading: boolean = false;

  constructor(options: SubstrateSettingsModalOptions) {
    this.model = options.model;

    this.overlay = options.container
      .append("div")
      .attr("class", "algorithm-modal-overlay");

    this.modal = this.overlay.append("div").attr("class", "algorithm-modal");

    this.titleElement = this.modal
      .append("div")
      .attr("class", "algorithm-modal-header")
      .text("Projection Settings");

    const modalBody = this.modal
      .append("div")
      .attr("class", "algorithm-modal-body");

    this.projectionSection = modalBody
      .append("div")
      .attr("class", "projection-section");

    this.projectionSection
      .append("div")
      .attr("class", "section-title")
      .text("Projection Method");

    this.methodGroup = this.projectionSection
      .append("div")
      .attr("class", "projection-method-group")
      .style("display", "flex")
      .style("gap", "8px")
      .style("margin-bottom", "8px");

    for (const m of DR_METHODS) {
      const lbl = this.methodGroup.append("label").attr("class", "method-label");
      lbl
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "6px")
        .style("padding", "6px 10px")
        .style("background", "#f9fafb")
        .style("border", "1px solid rgba(0,0,0,0.06)")
        .style("border-radius", "4px")
        .style("font-size", "13px")
        .style("color", "#0f172a")
        .style("cursor", "pointer");

      lbl
        .append("input")
        .attr("type", "radio")
        .attr("name", "dr-method")
        .attr("value", m.key)
        .style("width", "16px")
        .style("height", "16px")
        .style("cursor", "pointer")
        .on("change", (event) =>
          this.onMethodChange((event.target as HTMLInputElement).value as DRMethod)
        );

      lbl.append("span").text(m.label).style("margin-left", "6px");
    }

    this.projectionSection
      .append("div")
      .attr("class", "section-description")
      .text("Attributes used for projection:");

    this.attrCheckboxContainer = this.projectionSection
      .append("div")
      .attr("class", "attr-checkbox-container");

    this.projectionSection
      .append("button")
      .attr("class", "settings-btn settings-btn-primary attr-apply-btn")
      .text("Apply Projection")
      .on("click", () => this.applyProjectionAttributes());

    this.resultArea = modalBody
      .append("div")
      .attr("class", "algorithm-result-area")
      .style("display", "none");

    const modalFooter = this.modal
      .append("div")
      .attr("class", "algorithm-modal-footer");

    modalFooter
      .append("button")
      .attr("class", "settings-btn settings-btn-cancel")
      .text("Close")
      .on("click", () => this.close());

    this.overlay.on("click", (event) => {
      if (event.target === this.overlay.node()) this.close();
    });
  }

  open(substrate: Substrate): void {
    this.currentSubstrate = substrate;
    this.titleElement.text(`Projection: ${substrate.label}`);
    this.resultArea.style("display", "none").html("");
    this.isLoading = false;
    this.populateAttributeCheckboxes(substrate);
    this.setMethodSelection(substrate.dr_method || "pca");
    this.overlay.classed("visible", true);
  }

  close(): void {
    this.overlay.classed("visible", false);
    this.currentSubstrate = null;
  }

  private populateAttributeCheckboxes(substrate: Substrate): void {
    const nodes = this.model.get("nodes") as Node[];
    const substrateNodes = nodes.filter((n) =>
      substrate.node_ids.includes(n.id)
    );

    this.numericAttrs = [];
    if (substrateNodes.length > 0) {
      const attrs = substrateNodes[0].attributes || {};
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (typeof value === "number") {
          this.numericAttrs.push(key);
        } else if (
          Array.isArray(value) &&
          value.length > 0 &&
          typeof value[0] === "number"
        ) {
          this.numericAttrs.push(key);
        }
      }
    }

    this.selectedAttrs = new Set(
      substrate.projection_attrs && substrate.projection_attrs.length > 0
        ? substrate.projection_attrs
        : this.numericAttrs
    );

    this.attrCheckboxContainer.html("");

    const projNode = this.projectionSection.node() as HTMLDivElement | null;
    if (projNode) {
      const existing = projNode.querySelector(".attrs-found");
      if (existing) existing.remove();
      const attrsFoundEl = document.createElement("div");
      attrsFoundEl.className = "attrs-found";
      attrsFoundEl.style.fontSize = "12px";
      attrsFoundEl.style.color = "#6b7280";
      attrsFoundEl.style.marginBottom = "8px";
      attrsFoundEl.textContent = `${this.numericAttrs.length} numeric attribute(s) available`;
      const beforeNode = this.attrCheckboxContainer.node();
      if (beforeNode) {
        projNode.insertBefore(attrsFoundEl, beforeNode);
      } else {
        projNode.appendChild(attrsFoundEl);
      }
    }

    if (this.numericAttrs.length === 0) {
      this.attrCheckboxContainer
        .append("div")
        .attr("class", "no-attrs-message")
        .text("No numeric attributes found for projection.");
      this.projectionSection.select(".attr-apply-btn").style("display", "none");
      return;
    }

    this.projectionSection.select(".attr-apply-btn").style("display", "block");

    for (const attr of this.numericAttrs) {
      const checkbox = this.attrCheckboxContainer
        .append("label")
        .attr("class", "attr-checkbox-label")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "6px")
        .style("padding", "6px 10px")
        .style("background", "#ffffff")
        .style("border", "1px solid rgba(0,0,0,0.06)")
        .style("border-radius", "4px")
        .style("color", "#0f172a")
        .style("cursor", "pointer");

      checkbox
        .append("input")
        .attr("type", "checkbox")
        .attr("value", attr)
        .property("checked", this.selectedAttrs.has(attr))
        .on("change", (event) => {
          const checked = (event.target as HTMLInputElement).checked;
          if (checked) {
            this.selectedAttrs.add(attr);
          } else {
            this.selectedAttrs.delete(attr);
          }
        });

      checkbox
        .append("span")
        .text(attr)
        .style("color", "#0f172a")
        .style("font-size", "13px");
    }
  }

  private applyProjectionAttributes(): void {
    if (!this.currentSubstrate || this.isLoading) return;

    const selectedArray = Array.from(this.selectedAttrs);
    if (selectedArray.length === 0) {
      this.resultArea
        .style("display", "block")
        .html(
          `<div class="algorithm-result-error">Select at least one attribute for projection.</div>`
        );
      return;
    }

    this.isLoading = true;
    this.resultArea
      .style("display", "block")
      .html(
        `<div class="algorithm-loading">Recalculating projection with ${selectedArray.length} attribute(s)…</div>`
      );

    this.model.set("command", {
      action: "request_update_projection_attrs",
      substrate_id: this.currentSubstrate.id,
      attribute_names: selectedArray,
    });
    this.model.save_changes();

    setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.resultArea.html(
          `<div class="algorithm-result-success">Projection update requested.</div>`
        );
      }
    }, 1000);
  }

  private setMethodSelection(method: DRMethod): void {
    this.methodGroup
      .selectAll<HTMLInputElement, { key: DRMethod; label: string }>("input")
      .property("checked", function (this: HTMLInputElement) {
        return this.value === method;
      });
  }

  private onMethodChange(method: DRMethod): void {
    if (!this.currentSubstrate) return;
    this.resultArea
      .style("display", "block")
      .html(
        `<div class="algorithm-loading">Updating projection method to ${method}…</div>`
      );
    this.model.set("command", {
      action: "request_update_dr",
      substrate_id: this.currentSubstrate.id,
      dr_method: method,
    });
    this.model.save_changes();
  }
}
