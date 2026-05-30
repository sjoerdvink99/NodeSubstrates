import * as d3 from "https://esm.sh/d3@7";
import type { NodeState } from "../types";

export interface DetailPanelOptions {
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  onToggleCollapse?: (collapsed: boolean) => void;
  onColorBy?: (attribute: string, type: 'categorical' | 'numeric') => void;
  onClearColorBy?: () => void;
  onSizeBy?: (attribute: string | null, method: 'attribute' | 'degree' | 'clustering' | 'betweenness' | null) => void;
  onClearSizeBy?: () => void;
  onSelectNodes?: (nodeIds: string[]) => void;
  onHoverNodes?: (nodeIds: string[] | null) => void;
}

export class DetailPanel {
  private panel: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private content: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private onToggleCollapse: ((collapsed: boolean) => void) | null;
  private onColorBy: ((attribute: string, type: 'categorical' | 'numeric') => void) | null;
  private onClearColorBy: (() => void) | null;
  private onSizeBy: ((attribute: string | null, method: 'attribute' | 'degree' | 'clustering' | 'betweenness' | null) => void) | null;
  private onClearSizeBy: (() => void) | null;
  private onSelectNodes: ((nodeIds: string[]) => void) | null;
  private onHoverNodes: ((nodeIds: string[] | null) => void) | null;
  private collapsed: boolean = false;
  private currentColorByAttr: string | null = null;
  private currentSizeByAttr: string | null = null;
  private allNodes: Map<string, NodeState> = new Map();
  private activeSubstrateNodeIds: Set<string> | null = null;
  private currentHoverNodeIds: string[] | null = null;
  private lastSelectedNodeIds: string[] = [];

  constructor(options: DetailPanelOptions) {
    this.onToggleCollapse = options.onToggleCollapse || null;
    this.onColorBy = options.onColorBy || null;
    this.onClearColorBy = options.onClearColorBy || null;
    this.onSizeBy = options.onSizeBy || null;
    this.onClearSizeBy = options.onClearSizeBy || null;
    this.onSelectNodes = options.onSelectNodes || null;
    this.onHoverNodes = options.onHoverNodes || null;

    this.panel = options.container
      .append("div")
      .attr("class", "node-detail-panel");

    const header = this.panel
      .append("div")
      .attr("class", "detail-panel-header");

    header
      .append("span")
      .attr("class", "detail-panel-title")
      .text("Node Details");

    header
      .append("button")
      .attr("class", "detail-panel-collapse-btn")
      .attr("title", "Collapse panel")
      .html(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>`
      )
      .on("click", () => this.toggleCollapse());

    this.content = this.panel
      .append("div")
      .attr("class", "detail-panel-content");

    this.showEmpty();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Shift') this.panel.classed('ns-hist-shift', true);
      });
      window.addEventListener('keyup', (e: KeyboardEvent) => {
        if (e.key === 'Shift') this.panel.classed('ns-hist-shift', false);
      });
    }
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.panel.classed("node-detail-panel--collapsed", this.collapsed);
    this.panel.select<HTMLButtonElement>(".detail-panel-collapse-btn").attr(
      "title",
      this.collapsed ? "Expand panel" : "Collapse panel"
    );
    if (this.onToggleCollapse) this.onToggleCollapse(this.collapsed);
  }

  setAllNodes(nodeMap: Map<string, NodeState>): void {
    this.allNodes = nodeMap;
  }

  setColorByAttribute(attr: string | null): void {
    this.currentColorByAttr = attr;
  }

  setSizeByAttribute(attr: string | null): void {
    this.currentSizeByAttr = attr;
  }

  setActiveSubstrate(nodeIds: string[] | null): void {
    if (nodeIds === null) {
      this.activeSubstrateNodeIds = null;
    } else {
      this.activeSubstrateNodeIds = new Set(nodeIds);
    }
    this.renderHistogramList(this.allNodes, this.activeSubstrateNodeIds ? Array.from(this.activeSubstrateNodeIds) : []);
  }

  setHoverNodes(nodeIds: string[] | null, selectedNodeIds?: string[] | null): void {
    this.currentHoverNodeIds = nodeIds;
    this.renderHistogramList(this.allNodes, selectedNodeIds || []);
  }

  update(selectedNodes: string[], nodeMap: Map<string, NodeState>): void {
    this.allNodes = nodeMap;
    this.lastSelectedNodeIds = selectedNodes || [];
    if (selectedNodes.length === 1) {
      this.showNode(selectedNodes[0], nodeMap);
    } else if (selectedNodes.length > 1) {
      this.showMultipleSelected(selectedNodes.length);
    } else {
      this.showEmpty();
    }

    this.renderHistogramList(nodeMap, selectedNodes);
  }

  private showEmpty(): void {
    this.content.html(
      '<div class="detail-panel-empty">Click on a node to view its details</div>'
    );
  }

  private showMultipleSelected(count: number): void {
    this.content.html(
      `<div class="detail-panel-empty">${count} nodes selected</div>`
    );
  }

  private isCategoricalAttribute(attrKey: string): boolean {
    const values = new Set<string>();
    let count = 0;

    for (const node of this.allNodes.values()) {
      const val = node.attributes[attrKey];
      if (typeof val === 'string') {
        values.add(val);
        count++;
      } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        if (typeof obj['type'] === 'string' || typeof obj['role'] === 'string') {
          values.add(JSON.stringify(val));
          count++;
        }
      }
    }

    return count > 0 && (values.size < count * 0.5 || values.size <= 20);
  }

  private showNode(nodeId: string, nodeMap: Map<string, NodeState>): void {
    const node = nodeMap.get(nodeId);
    if (!node) {
      this.showEmpty();
      return;
    }

    this.content.html('');

    const nodeHeader = this.content.append("div").attr("class", "detail-node-header");
    nodeHeader.append("div").attr("class", "detail-node-label").text(node.label || node.id);
    nodeHeader.append("div").attr("class", "detail-node-id").text(`ID: ${node.id}`);

    const attrs = node.attributes || {};
    const attrKeys = Object.keys(attrs);

    if (attrKeys.length > 0) {
      const attrSection = this.content.append("div").attr("class", "detail-section");
      attrSection.append("div").attr("class", "detail-section-title").text("Attributes");

      const computedAttrs = new Set(['degree', 'clustering', 'betweenness']);

      for (const key of attrKeys) {
        const value = attrs[key];
        const displayValue = this.formatValue(value);
        const isCategorical = this.isCategoricalAttribute(key);
        const isActive = this.currentColorByAttr === key;
        const isComputed = computedAttrs.has(key);

        const row = attrSection.append("div").attr("class", `detail-attr-row${isComputed ? ' computed' : ''}`);

        row.append("span").attr("class", `detail-attr-key${isComputed ? ' computed' : ''}`).text(key);

        const valueContainer = row.append("span")
          .attr("class", "detail-attr-value-container")
          .style("display", "flex")
          .style("align-items", "center")
          .style("gap", "8px");

        valueContainer.append("span")
          .attr("class", `detail-attr-value${isComputed ? ' computed' : ''}`)
          .text(displayValue);

        if (isCategorical && this.onColorBy) {
          const btn = valueContainer.append("button")
            .attr("class", `detail-color-btn ${isActive ? 'active' : ''}`)
            .attr("title", isActive ? "Clear color mapping" : `Color nodes by ${key}`)
            .html(this.getColorIconSvg());

          const onColorBy = this.onColorBy;
          const onClearColorBy = this.onClearColorBy;

          btn.on("click", () => {
            if (isActive && onClearColorBy) {
              onClearColorBy();
            } else {
              onColorBy(key, 'categorical');
            }
          });
        }

        if ((isComputed || typeof value === 'number') && this.onSizeBy) {
          const isSizeActive = this.currentSizeByAttr === key;
          const sizeBtn = valueContainer.append("button")
            .attr("class", `detail-size-btn ${isSizeActive ? 'active' : ''}`)
            .attr("title", isSizeActive ? `Clear size mapping` : `Scale node size by ${key}`)
            .html(this.getSizeIconSvg());

          const onSizeBy = this.onSizeBy;
          const onClearSizeBy = this.onClearSizeBy;
          sizeBtn.on("click", () => {
            if (isSizeActive && onClearSizeBy) {
              this.setSizeByAttribute(null);
              sizeBtn.classed('active', false);
              onClearSizeBy();
            } else {
              this.setSizeByAttribute(key);
              sizeBtn.classed('active', true);
              if (isComputed) {
                onSizeBy(key, key as 'degree' | 'clustering' | 'betweenness');
              } else {
                onSizeBy(key, 'attribute');
              }
            }
          });
        }
      }
    }

    const posSection = this.content.append("div").attr("class", "detail-section");
    posSection.append("div").attr("class", "detail-section-title").text("Position");

    const posXRow = posSection.append("div").attr("class", "detail-attr-row");
    posXRow.append("span").attr("class", "detail-attr-key").text("x");
    posXRow.append("span").attr("class", "detail-attr-value").text(node.x?.toFixed(1) || "0");

    const posYRow = posSection.append("div").attr("class", "detail-attr-row");
    posYRow.append("span").attr("class", "detail-attr-key").text("y");
    posYRow.append("span").attr("class", "detail-attr-value").text(node.y?.toFixed(1) || "0");

    if (node.isInSubstrate && node.substrateId) {
      const subSection = this.content.append("div").attr("class", "detail-section");
      subSection.append("div").attr("class", "detail-section-title").text("Substrate");

      const subRow = subSection.append("div").attr("class", "detail-attr-row");
      subRow.append("span").attr("class", "detail-attr-key").text("Substrate ID");
      subRow.append("span").attr("class", "detail-attr-value").text(node.substrateId);
    }
  }

  private getSizeIconSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M12 2v6m0 8v6M5 12h14M7 7l-4 4 4 4M17 7l4 4-4 4" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  private getColorIconSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.08-.1-.13-.21-.13-.33 0-.28.22-.5.5-.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
    </svg>`;
  }

  private formatValue(value: unknown): string {
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : value.toFixed(4);
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (value === null || value === undefined) {
      return "—";
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      if (value.length <= 5) return value.join(", ");
      return `${value.slice(0, 5).join(", ")}... (+${value.length - 5} more)`;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return "—";
      return entries.map(([k, v]) => `${k}: ${this.formatValue(v)}`).join(", ");
    }
    return String(value);
  }

  private renderHistogramList(nodeMap: Map<string, NodeState>, selectedNodeIds: string[]): void {
    this.content.selectAll('.histogram-list-section').remove();

    const numericKeys = new Set<string>();
    for (const node of nodeMap.values()) {
      for (const [k, v] of Object.entries(node.attributes)) {
        if (typeof v === 'number') numericKeys.add(k);
      }
    }

    if (numericKeys.size === 0) return;

    const keys = Array.from(numericKeys).sort();
    const section = this.content.append('div').attr('class', 'histogram-list-section');
    section.append('div').attr('class', 'detail-section-title').text('Attribute Histograms');

    let substrateNodeSet: Set<string> | null = null;
    if (this.activeSubstrateNodeIds && this.activeSubstrateNodeIds.size > 0) {
      substrateNodeSet = this.activeSubstrateNodeIds;
    } else if (selectedNodeIds && selectedNodeIds.length > 0) {
      const first = nodeMap.get(selectedNodeIds[0]);
      if (first && first.substrateId) {
        const sid = first.substrateId;
        let allSame = true;
        for (const id of selectedNodeIds) {
          const n = nodeMap.get(id);
          if (!n || n.substrateId !== sid) { allSame = false; break; }
        }
        if (allSame) {
          substrateNodeSet = new Set(
            Array.from(nodeMap.values()).filter(n => n.substrateId === sid).map(n => n.id)
          );
        }
      }
    }

    const allNodes = Array.from(nodeMap.values());
    const substrateNodes = substrateNodeSet ? allNodes.filter((n) => substrateNodeSet!.has(n.id)) : [];

    const histContainer = section.append('div').attr('class', 'histogram-list');

    for (const key of keys) {
      const allData: Array<{id: string; value: number}> = [];
      const subData: Array<{id: string; value: number}> = [];
      for (const n of allNodes) {
        const v = n.attributes[key];
        if (typeof v === 'number') allData.push({ id: n.id, value: v });
      }
      if (substrateNodeSet) {
        for (const n of substrateNodes) {
          const v = n.attributes[key];
          if (typeof v === 'number') subData.push({ id: n.id, value: v });
        }
      }

      if (allData.length === 0) continue;

      const card = histContainer.append('div').attr('class', 'hist-card');
      card.append('div').attr('class', 'hist-key').text(key);

      const w = 220;
      const h = 64;
      const svg = card.append('svg').attr('width', String(w)).attr('height', String(h)).attr('class', 'hist-svg');

      const x = d3.scaleLinear()
        .domain([d3.min(allData, d => d.value) as number, d3.max(allData, d => d.value) as number])
        .nice()
        .range([4, w - 4]);
      const binGen = d3.bin<{id: string; value: number}, number>()
        .value((d) => d.value)
        .domain(x.domain() as [number, number])
        .thresholds(16);
      const bins = binGen(allData);
      const y = d3.scaleLinear()
        .domain([0, d3.max(bins, (b) => b.length) as number])
        .range([h - 6, 6]);

      const useHovered = this.currentHoverNodeIds && this.currentHoverNodeIds.length > 0;
      const selectedSet = new Set<string>(useHovered ? this.currentHoverNodeIds! : (selectedNodeIds || []));
      const barG = svg.append('g').attr('class', 'hist-bars');
      barG.selectAll('rect')
        .data(bins)
        .enter()
        .append('rect')
        .attr('x', (d) => x(d.x0 ?? 0))
        .attr('y', (d) => y(d.length))
        .attr('width', (d) => Math.max(1, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
        .attr('height', (d) => (h - 6) - y(d.length))
        .attr('class', 'hist-bar')
        .attr('fill', (d) => d.some((item) => selectedSet.has(item.id)) ? '#60a5fa' : '#e5e7eb')
        .style('pointer-events', 'auto')
        .on('mouseenter', (event, d) => {
          const target = d3.select(event.currentTarget as Element);
          target.attr('fill', '#1e40af');
          if (this.onSelectNodes) {
            target.style('cursor', event.shiftKey ? 'copy' : 'pointer');
          }
          if (this.onHoverNodes) {
            this.onHoverNodes(d.map((item) => item.id));
          }
        })
        .on('mousemove', (event) => {
          if (this.onSelectNodes) {
            d3.select(event.currentTarget as Element).style('cursor', event.shiftKey ? 'copy' : 'pointer');
          }
        })
        .on('mouseleave', (event, d) => {
          const target = d3.select(event.currentTarget as Element);
          target.attr('fill', d.some((item) => selectedSet.has(item.id)) ? '#60a5fa' : '#e5e7eb');
          if (this.onHoverNodes) this.onHoverNodes(null);
        })
        .on('click', (event, d) => {
          if (!this.onSelectNodes) return;
          const ids = d.map((item) => item.id);
          const prev = this.lastSelectedNodeIds || [];
          const combined = (event.shiftKey && prev.length > 0) ? Array.from(new Set([...prev, ...ids])) : ids;
          this.setHoverNodes(null);
          this.lastSelectedNodeIds = combined;
          this.renderHistogramList(this.allNodes, combined);
          this.onSelectNodes(combined);
          event.stopPropagation();
        })
        .on('pointerdown', (event, d) => {
          if (!this.onSelectNodes) return;
          const ids = d.map((item) => item.id);
          const prev = this.lastSelectedNodeIds || [];
          const combined = (event.shiftKey && prev.length > 0) ? Array.from(new Set([...prev, ...ids])) : ids;
          this.setHoverNodes(null);
          this.lastSelectedNodeIds = combined;
          this.renderHistogramList(this.allNodes, combined);
          this.onSelectNodes(combined);
          event.stopPropagation();
          event.preventDefault();
        });

      if (subData.length > 0) {
        const subBins = binGen(subData);
        const subYMax = d3.max(subBins, (b) => b.length) as number;
        const subY = d3.scaleLinear().domain([0, Math.max(1, subYMax)]).range([h - 6, 6]);

        const overlay = svg.append('g').attr('class', 'hist-overlay');
        overlay.selectAll('rect')
          .data(bins)
          .enter()
          .append('rect')
          .attr('x', (d) => x(d.x0 ?? 0))
          .attr('y', (d, i) => subY((subBins[i] && subBins[i].length) || 0))
          .attr('width', (d) => Math.max(1, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
          .attr('height', (d, i) => (h - 6) - subY((subBins[i] && subBins[i].length) || 0))
          .attr('class', 'hist-overlay-bar')
          .attr('fill', (d, i) => {
            const match = subBins[i] || [];
            return match.some((item) => selectedSet.has(item.id))
              ? 'rgba(29,78,216,0.9)'
              : 'rgba(59,130,246,0.6)';
          })
          .style('pointer-events', 'auto')
          .on('mouseenter', (event, d) => {
            const idx = bins.findIndex((b) => b.x0 === d.x0 && b.x1 === d.x1);
            const target = d3.select(event.currentTarget as Element);
            target.attr('fill', 'rgba(13,42,148,0.95)');
            if (this.onSelectNodes) {
              target.style('cursor', event.shiftKey ? 'copy' : 'pointer');
            }
            if (this.onHoverNodes) {
              const match = subBins[idx] || [];
              this.onHoverNodes(match.map((item) => item.id));
            }
          })
          .on('mousemove', (event) => {
            if (this.onSelectNodes) {
              d3.select(event.currentTarget as Element).style('cursor', event.shiftKey ? 'copy' : 'pointer');
            }
          })
          .on('mouseleave', (event, d) => {
            const idx = bins.findIndex((b) => b.x0 === d.x0 && b.x1 === d.x1);
            const match = subBins[idx] || [];
            const target = d3.select(event.currentTarget as Element);
            target.attr('fill', match.some((item) => selectedSet.has(item.id))
              ? 'rgba(29,78,216,0.9)'
              : 'rgba(59,130,246,0.6)');
            if (this.onHoverNodes) this.onHoverNodes(null);
          })
          .on('click', (event, d) => {
            if (!this.onSelectNodes) return;
            const match = subBins.find((b) => b.x0 === d.x0 && b.x1 === d.x1) || [];
            const ids = match.map((item) => item.id);
            const prev = this.lastSelectedNodeIds || [];
            const combined = (event.shiftKey && prev.length > 0) ? Array.from(new Set([...prev, ...ids])) : ids;
            this.setHoverNodes(null);
            this.lastSelectedNodeIds = combined;
            this.renderHistogramList(this.allNodes, combined);
            this.onSelectNodes(combined);
            event.stopPropagation();
          })
          .on('pointerdown', (event, d) => {
            if (!this.onSelectNodes) return;
            const match = subBins.find((b) => b.x0 === d.x0 && b.x1 === d.x1) || [];
            const ids = match.map((item) => item.id);
            const prev = this.lastSelectedNodeIds || [];
            const combined = (event.shiftKey && prev.length > 0) ? Array.from(new Set([...prev, ...ids])) : ids;
            this.setHoverNodes(null);
            this.lastSelectedNodeIds = combined;
            this.renderHistogramList(this.allNodes, combined);
            this.onSelectNodes(combined);
            event.stopPropagation();
            event.preventDefault();
          });
      }
    }
  }
}
