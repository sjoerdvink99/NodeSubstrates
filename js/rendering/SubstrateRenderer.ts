import * as d3 from "https://esm.sh/d3@7";
import type { Substrate, SubstrateBounds } from "../types";
import { CONSTANTS } from "../types";

const COG_ICON_PATH = "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z";

const { RESIZE_HANDLE_SIZE } = CONSTANTS;

export class SubstrateRenderer {
  private group: d3.Selection<SVGGElement, unknown, null, undefined>;
  private handlesLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private substrateDrag: d3.DragBehavior<SVGGElement, Substrate, unknown> | null = null;
  private onContextMenu: ((event: MouseEvent, substrate: Substrate) => void) | null = null;
  private onSettingsClick: ((substrate: Substrate) => void) | null = null;
  private onSubstrateClick: ((substrate: Substrate) => void) | null = null;
  private onLabelEdit: ((substrateId: string, newLabel: string) => void) | null = null;
  private onResize: ((substrateId: string, bounds: SubstrateBounds, isEnd: boolean) => void) | null = null;

  constructor(group: d3.Selection<SVGGElement, unknown, null, undefined>) {
    this.group = group;
  }

  private methodDisplay(method: string | undefined | null): string {
    if (!method) return "";
    switch (method) {
      case 'pca': return 'PCA';
      case 'umap': return 'UMAP';
      case 'tsne': return 't-SNE';
      default: return method;
    }
  }

  setDragBehavior(drag: d3.DragBehavior<SVGGElement, Substrate, unknown>): void {
    this.substrateDrag = drag;
  }

  setContextMenuHandler(handler: (event: MouseEvent, substrate: Substrate) => void): void {
    this.onContextMenu = handler;
  }

  setSettingsClickHandler(handler: (substrate: Substrate) => void): void {
    this.onSettingsClick = handler;
  }

  setLabelEditHandler(handler: (substrateId: string, newLabel: string) => void): void {
    this.onLabelEdit = handler;
  }

  setSubstrateClickHandler(handler: (substrate: Substrate) => void): void {
    this.onSubstrateClick = handler;
  }

  setResizeHandler(handler: (substrateId: string, bounds: SubstrateBounds, isEnd: boolean) => void): void {
    this.onResize = handler;
  }

  setHandlesLayer(layer: d3.Selection<SVGGElement, unknown, null, undefined>): void {
    this.handlesLayer = layer;
  }

  private buildResizeDrag(): d3.DragBehavior<SVGGElement, Substrate, unknown> {
    return d3.drag<SVGGElement, Substrate>()
      .on("start", function (event) {
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event, d) => {
        if (!d.bounds) d.bounds = { x: 0, y: 0, width: 120, height: 120 };
        const b = d.bounds as SubstrateBounds;
        const newW = Math.max(80, b.width + event.dx);
        const newH = Math.max(60, b.height + event.dy);
        b.width = newW;
        b.height = newH;

        const groupSel = this.group
          .selectAll<SVGGElement, Substrate>("g.substrate-group")
          .filter((s) => s.id === d.id);
        groupSel.select("rect.substrate-region").attr("width", newW).attr("height", newH);
        groupSel.select("g.substrate-settings-icon").attr("transform", `translate(${newW - 28}, 6)`);
        groupSel.select("g.substrate-resize-handle").attr("transform", `translate(${newW - RESIZE_HANDLE_SIZE}, ${newH - RESIZE_HANDLE_SIZE})`);

        if (this.onResize) {
          this.onResize(d.id, { x: b.x, y: b.y, width: newW, height: newH }, false);
        }
      })
      .on("end", (event, d) => {
        const current = d.bounds || { x: 0, y: 0, width: 120, height: 120 };
        const groupSel = this.group
          .selectAll<SVGGElement, Substrate>("g.substrate-group")
          .filter((s) => s.id === d.id);
        const rect = groupSel.select("rect.substrate-region");
        const finalW = +rect.attr("width") || current.width;
        const finalH = +rect.attr("height") || current.height;
        if (this.onResize) {
          this.onResize(d.id, { x: d.bounds?.x ?? 0, y: d.bounds?.y ?? 0, width: finalW, height: finalH }, true);
        }
      });
  }

  render(substrates: Substrate[]): void {
    const groups = this.group
      .selectAll<SVGGElement, Substrate>("g.substrate-group")
      .data(substrates, (d) => d.id);

    const enter = groups
      .enter()
      .append("g")
      .attr("class", "substrate-group")
      .attr("transform", (d) =>
        `translate(${d.bounds?.x ?? 0}, ${d.bounds?.y ?? 0})`
      );

    enter
      .append("rect")
      .attr("class", "substrate-region")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", (d) => d.bounds?.width ?? 0)
      .attr("height", (d) => d.bounds?.height ?? 0)
      .attr("rx", 8)
      .attr("ry", 8);

    if (this.handlesLayer) {
      enter.selectAll("g.substrate-resize-handle").remove();
      const topHandles = this.handlesLayer
        .selectAll<SVGGElement, Substrate>("g.substrate-resize-handle")
        .data(substrates, (d) => d.id);

      const topEnter = topHandles
        .enter()
        .append("g")
        .attr("class", "substrate-resize-handle")
        .style("cursor", "nwse-resize");

      topEnter.append("rect")
        .attr("width", RESIZE_HANDLE_SIZE)
        .attr("height", RESIZE_HANDLE_SIZE)
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("fill", "#ffffff")
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 1);

      topEnter.append("path")
        .attr("d", "M2 2 L10 10 M5 2 L2 2 L2 5 M10 5 L10 10 L7 10")
        .attr("stroke", "#111827")
        .attr("stroke-width", 1.6)
        .attr("fill", "none")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .style("pointer-events", "none");

      this.handlesLayer
        .selectAll<SVGGElement, Substrate>("g.substrate-resize-handle")
        .merge(topEnter as d3.Selection<SVGGElement, Substrate, SVGGElement, unknown>)
        .attr("transform", (d) => {
          const w = d.bounds?.width ?? 0;
          const h = d.bounds?.height ?? 0;
          const x = (d.bounds?.x ?? 0) + w - RESIZE_HANDLE_SIZE;
          const y = (d.bounds?.y ?? 0) + h - RESIZE_HANDLE_SIZE;
          return `translate(${x}, ${y})`;
        });
    } else {
      const inGroupEnter = enter
        .append("g")
        .attr("class", "substrate-resize-handle")
        .attr("transform", (d) => {
          const w = d.bounds?.width ?? 0;
          const h = d.bounds?.height ?? 0;
          return `translate(${w - RESIZE_HANDLE_SIZE}, ${h - RESIZE_HANDLE_SIZE})`;
        })
        .style("cursor", "nwse-resize");

      inGroupEnter.append("rect")
        .attr("width", RESIZE_HANDLE_SIZE)
        .attr("height", RESIZE_HANDLE_SIZE)
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("fill", "#ffffff")
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 1);

      inGroupEnter.append("path")
        .attr("d", "M2 2 L10 10 M5 2 L2 2 L2 5 M10 5 L10 10 L7 10")
        .attr("stroke", "#111827")
        .attr("stroke-width", 1.6)
        .attr("fill", "none")
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .style("pointer-events", "none");
    }

    enter
      .append("text")
      .attr("class", "substrate-label")
      .attr("x", 10)
      .attr("y", 20);

    const settingsIcon = enter
      .append("g")
      .attr("class", "substrate-settings-icon")
      .attr("transform", (d) => {
        const width = d.bounds?.width ?? 100;
        return `translate(${width - 28}, 6)`;
      })
      .style("cursor", "pointer");

    settingsIcon
      .append("rect")
      .attr("class", "substrate-settings-bg")
      .attr("x", -2)
      .attr("y", -2)
      .attr("width", 24)
      .attr("height", 24)
      .attr("rx", 4)
      .attr("fill", "transparent");

    settingsIcon
      .append("path")
      .attr("class", "substrate-settings-path")
      .attr("d", COG_ICON_PATH)
      .attr("fill", "#6b7280")
      .attr("transform", "scale(0.8333)");

    if (this.onSettingsClick) {
      const handler = this.onSettingsClick;
      settingsIcon.on("click", function(event, d) {
        event.stopPropagation();
        handler(d);
      });
    }

    const all = enter.merge(groups);

    const fmt = (m: string | undefined | null) => this.methodDisplay(m);

    if (!this.handlesLayer) {
      all.each((d, i, nodes) => {
        const grp = d3.select(nodes[i]);
        if (grp.select("g.substrate-resize-handle").empty()) {
          const w = d.bounds?.width ?? 0;
          const h = d.bounds?.height ?? 0;
          const handle = grp
            .append("g")
            .attr("class", "substrate-resize-handle")
            .attr("transform", `translate(${w - RESIZE_HANDLE_SIZE}, ${h - RESIZE_HANDLE_SIZE})`)
            .style("cursor", "nwse-resize");

          handle.append("rect")
            .attr("width", RESIZE_HANDLE_SIZE)
            .attr("height", RESIZE_HANDLE_SIZE)
            .attr("rx", 2)
            .attr("ry", 2)
            .attr("fill", "#ffffff")
            .attr("stroke", "#cbd5e1")
            .attr("stroke-width", 1);
          handle.append("path")
            .attr("d", "M10 2 L2 10 M10 5 L10 2 L7 2 M5 10 L2 10 L2 7")
            .attr("stroke", "#111827")
            .attr("stroke-width", 1.6)
            .attr("fill", "none")
            .attr("stroke-linecap", "round")
            .attr("stroke-linejoin", "round")
            .style("pointer-events", "none");
        } else {
          const w = d.bounds?.width ?? 0;
          const h = d.bounds?.height ?? 0;
          grp.select("g.substrate-resize-handle")
            .attr("transform", `translate(${w - RESIZE_HANDLE_SIZE}, ${h - RESIZE_HANDLE_SIZE})`);
        }
      });
    } else {
      this.handlesLayer
        .selectAll<SVGGElement, Substrate>("g.substrate-resize-handle")
        .attr("transform", (d) => {
          const w = d.bounds?.width ?? 0;
          const h = d.bounds?.height ?? 0;
          const x = (d.bounds?.x ?? 0) + w - RESIZE_HANDLE_SIZE;
          const y = (d.bounds?.y ?? 0) + h - RESIZE_HANDLE_SIZE;
          return `translate(${x}, ${y})`;
        });
    }

    if (this.onContextMenu) {
      const handler = this.onContextMenu;
      all.on("contextmenu", function (event, d) {
        event.preventDefault();
        event.stopPropagation();
        handler(event, d);
      });
    }

    if (this.onSubstrateClick) {
      const handler = this.onSubstrateClick;
      all.on('click', function(event, d) {
        event.stopPropagation();
        handler(d);
      });
    }

    if (this.substrateDrag) {
      all.call(this.substrateDrag);
    }

    if (this.onResize) {
      const resizeDrag = this.buildResizeDrag();
      if (this.handlesLayer) {
        this.handlesLayer
          .selectAll<SVGGElement, Substrate>("g.substrate-resize-handle")
          .call(resizeDrag as d3.DragBehavior<SVGGElement, Substrate, unknown>);
      } else {
        all.selectAll<SVGGElement, Substrate>("g.substrate-resize-handle")
          .call(resizeDrag as d3.DragBehavior<SVGGElement, Substrate, unknown>);
      }
    }

    all.style("cursor", "move");

    all.attr("transform", (d) =>
      `translate(${d.bounds?.x ?? 0}, ${d.bounds?.y ?? 0})`
    );

    all
      .select("rect.substrate-region")
      .attr("width", (d) => d.bounds?.width ?? 0)
      .attr("height", (d) => d.bounds?.height ?? 0);

    all.select("text.substrate-label").text((d) => {
      const methodText = fmt(d.dr_method);
      const base = d.label || "";
      return methodText ? `${base} (${methodText})` : base;
    });

    if (this.onLabelEdit) {
      const editHandler = this.onLabelEdit;
      all.select("text.substrate-label").on("click", function(event, d) {
        event.stopPropagation();

        const parentNode = (this as SVGTextElement).parentNode as SVGGElement | null;
        if (!parentNode) return;
        const group = d3.select(parentNode);
        group.select("foreignObject.substrate-label-editor").remove();

        const width = d.bounds?.width ?? 120;
        const editorWidth = Math.max(80, width - 40);

        const fo = group
          .append("foreignObject")
          .attr("class", "substrate-label-editor")
          .attr("x", 10)
          .attr("y", 2)
          .attr("width", editorWidth)
          .attr("height", 26);

        const foNode = fo.node();
        if (!foNode) return;
        const input = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "input"
        ) as HTMLInputElement;
        input.type = "text";
        input.value = d.label || "";
        input.style.width = "100%";
        input.style.fontSize = "14px";
        input.style.padding = "2px 4px";

        foNode.appendChild(input);

        input.focus();
        input.select();

        const commit = () => {
          const newLabel = input.value.trim();
          group.select("foreignObject.substrate-label-editor").remove();
          const methodText = fmt(d.dr_method);
          group.select("text.substrate-label").text(methodText ? `${newLabel} (${methodText})` : newLabel);
          if (newLabel !== d.label) {
            editHandler(d.id, newLabel);
          }
        };

        input.addEventListener("keydown", (kevt) => {
          if (kevt.key === "Enter") {
            commit();
          } else if (kevt.key === "Escape") {
            group.select("foreignObject.substrate-label-editor").remove();
          }
        });

        input.addEventListener("blur", () => {
          commit();
        });
      });
    }

    all.select("g.substrate-settings-icon")
      .attr("transform", (d) => {
        const width = d.bounds?.width ?? 100;
        return `translate(${width - 28}, 6)`;
      });

    if (this.onSettingsClick) {
      const handler = this.onSettingsClick;
      all.select("g.substrate-settings-icon").on("click", function(event, d) {
        event.stopPropagation();
        handler(d);
      });
    }

    groups.exit().remove();
  }

  updateTransform(substrateId: string, x: number, y: number): void {
    this.group
      .selectAll<SVGGElement, Substrate>("g.substrate-group")
      .filter((d) => d.id === substrateId)
      .attr("transform", `translate(${x}, ${y})`);
  }

  updatePositions(substrates: Substrate[]): void {
    this.group
      .selectAll<SVGGElement, Substrate>("g.substrate-group")
      .data(substrates, (d) => d.id)
      .attr("transform", (d) =>
        `translate(${d.bounds?.x ?? 0}, ${d.bounds?.y ?? 0})`
      );
  }
}
