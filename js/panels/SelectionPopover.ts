import type { WidgetModel, NodeState, DRMethod } from "../types";

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Participant: { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" },
  Accident:    { bg: "#fee2e2", border: "#ef4444", text: "#b91c1c" },
  Car:         { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  Lawyer:      { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  Doctor:      { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
};

const FALLBACK_COLOR = { bg: "#f3f4f6", border: "#9ca3af", text: "#374151" };

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? FALLBACK_COLOR;
}

export class SelectionPopover {
  private container: HTMLElement;
  private model: WidgetModel;
  private el: HTMLDivElement | null = null;
  private activeTypes: Set<string> = new Set();
  private typeMap: Map<string, string[]> = new Map();
  private allIds: string[] = [];
  private worldX = 0;
  private worldY = 0;
  private outsideClickListener: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, model: WidgetModel) {
    this.container = container;
    this.model = model;
  }

  show(
    screenX: number,
    screenY: number,
    selectedIds: string[],
    nodeMap: Map<string, NodeState>,
    worldX: number,
    worldY: number
  ): void {
    this.hide();

    this.allIds = selectedIds;
    this.worldX = worldX;
    this.worldY = worldY;

    this.typeMap = new Map();
    for (const id of selectedIds) {
      const type = (nodeMap.get(id)?.attributes?.type as string) ?? "Unknown";
      if (!this.typeMap.has(type)) this.typeMap.set(type, []);
      this.typeMap.get(type)!.push(id);
    }

    this.activeTypes = new Set(this.typeMap.keys());

    this.el = document.createElement("div");
    this.el.className = "selection-popover";
    this.el.style.left = `${screenX}px`;
    this.el.style.top = `${screenY}px`;

    this.el.appendChild(this.buildHeader());
    this.el.appendChild(this.buildChips());
    this.el.appendChild(this.buildDivider());
    this.el.appendChild(this.buildActions());
    this.el.appendChild(this.buildFooter());

    this.container.appendChild(this.el);

    this.outsideClickListener = (e: MouseEvent) => {
      if (this.el && !this.el.contains(e.target as Node)) {
        this.hide();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", this.outsideClickListener!);
    }, 0);
  }

  hide(): void {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
      this.el = null;
    }
    if (this.outsideClickListener) {
      document.removeEventListener("click", this.outsideClickListener);
      this.outsideClickListener = null;
    }
  }

  isVisible(): boolean {
    return this.el !== null;
  }

  private buildHeader(): HTMLElement {
    const header = document.createElement("div");
    header.className = "popover-header";
    header.textContent = `${this.allIds.length} nodes selected`;
    return header;
  }

  private buildChips(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "popover-type-filters";

    for (const [type, ids] of this.typeMap.entries()) {
      const chip = document.createElement("button");
      chip.className = "type-filter-chip active";
      chip.dataset.type = type;
      chip.textContent = `${type} (${ids.length})`;
      this.applyChipStyle(chip, type, true);

      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const isActive = this.activeTypes.has(type);
        if (isActive) {
          this.activeTypes.delete(type);
        } else {
          this.activeTypes.add(type);
        }
        chip.classList.toggle("active", !isActive);
        this.applyChipStyle(chip, type, !isActive);
        this.updateActionButtons();
      });

      wrapper.appendChild(chip);
    }

    return wrapper;
  }

  private applyChipStyle(chip: HTMLButtonElement, type: string, active: boolean): void {
    const color = typeColor(type);
    if (active) {
      chip.style.background = color.bg;
      chip.style.borderColor = color.border;
      chip.style.color = color.text;
    } else {
      chip.style.background = "#f9fafb";
      chip.style.borderColor = "#e5e7eb";
      chip.style.color = "#9ca3af";
    }
  }

  private buildDivider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "popover-divider";
    return d;
  }

  private buildActions(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "popover-actions";
    wrapper.appendChild(this.buildActionButton("umap", true));
    wrapper.appendChild(this.buildActionButton("pca", false));
    wrapper.appendChild(this.buildActionButton("tsne", false));
    return wrapper;
  }

  private buildActionButton(method: DRMethod, primary: boolean): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = primary ? "popover-btn popover-btn-primary" : "popover-btn popover-btn-secondary";
    btn.dataset.method = method;
    this.updateButtonLabel(btn, method);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const filteredIds = this.getFilteredIds();
      if (filteredIds.length < 3) return;

      this.model.set("selected_nodes", filteredIds);
      this.model.set("command", {
        action: "request_create_substrate",
        node_ids: filteredIds,
        dr_method: method,
        click_x: this.worldX,
        click_y: this.worldY,
      });
      this.model.save_changes();
      this.hide();
    });

    return btn;
  }

  private buildFooter(): HTMLElement {
    const footer = document.createElement("div");
    footer.className = "popover-footer";

    const clear = document.createElement("span");
    clear.className = "popover-clear";
    clear.textContent = "Clear selection";
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      this.model.set("selected_nodes", []);
      this.model.save_changes();
      this.hide();
    });

    footer.appendChild(clear);
    return footer;
  }

  private getFilteredIds(): string[] {
    const result: string[] = [];
    for (const type of this.activeTypes) {
      const ids = this.typeMap.get(type);
      if (ids) result.push(...ids);
    }
    return result;
  }

  private updateActionButtons(): void {
    if (!this.el) return;
    const count = this.getFilteredIds().length;
    const buttons = this.el.querySelectorAll<HTMLButtonElement>(".popover-btn[data-method]");
    buttons.forEach((btn) => {
      const method = btn.dataset.method as DRMethod;
      this.updateButtonLabel(btn, method, count);
      (btn as HTMLButtonElement).disabled = count < 3;
    });
  }

  private updateButtonLabel(btn: HTMLButtonElement, method: DRMethod, count?: number): void {
    const n = count ?? this.getFilteredIds().length;
    const label = method === "umap" ? "UMAP" : method === "pca" ? "PCA" : "t-SNE";
    btn.textContent = `Create Substrate — ${label} (${n} nodes)`;
  }
}
