import type { WidgetModel } from "../types";

export interface MenuAction {
  label: string;
  action: () => void;
  disabled?: boolean;
}

export class ContextMenu {
  private container: HTMLElement;
  private menu: HTMLDivElement | null = null;
  private model: WidgetModel;
  private lastX: number = 0;
  private lastY: number = 0;

  constructor(container: HTMLElement, model: WidgetModel) {
    this.container = container;
    this.model = model;

    document.addEventListener("click", () => this.hide());
    document.addEventListener("contextmenu", (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  show(screenX: number, screenY: number, actions: MenuAction[], worldX?: number, worldY?: number): void {
    this.hide();

    if (typeof worldX === "number" && typeof worldY === "number") {
      this.lastX = worldX;
      this.lastY = worldY;
    } else {
      this.lastX = screenX;
      this.lastY = screenY;
    }

    this.menu = document.createElement("div");
    this.menu.className = "context-menu";
    this.menu.style.left = `${screenX}px`;
    this.menu.style.top = `${screenY}px`;

    actions.forEach((action) => {
      const item = document.createElement("div");
      item.className = "context-menu-item";
      item.textContent = action.label;

      if (action.disabled) {
        item.style.opacity = "0.5";
        item.style.cursor = "not-allowed";
      } else {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          action.action();
          this.hide();
        });
      }

      this.menu!.appendChild(item);
    });

    this.container.appendChild(this.menu);
  }

  hide(): void {
    if (this.menu && this.menu.parentNode) {
      this.menu.parentNode.removeChild(this.menu);
      this.menu = null;
    }
  }

  getNodeActions(
    selectedIds: string[],
    neighborIds?: Set<string>,
    twoHopIds?: Set<string>,
    threeHopIds?: Set<string>
  ): MenuAction[] {
    const actions: MenuAction[] = [];

    if (neighborIds && neighborIds.size > 0 && selectedIds.length >= 1) {
      const oneHopUnion = Array.from(new Set([...selectedIds, ...Array.from(neighborIds)]));
      if (oneHopUnion.length > selectedIds.length) {
        actions.push({
          label: `Expand Selection (1-hop) (${oneHopUnion.length} nodes)`,
          action: () => {
            this.model.set("selected_nodes", oneHopUnion);
            this.model.save_changes();
          },
        });
      }

      if (twoHopIds && twoHopIds.size > 0) {
        const twoHopUnion = Array.from(new Set([...selectedIds, ...Array.from(twoHopIds)]));
        if (twoHopUnion.length > oneHopUnion.length) {
          actions.push({
            label: `Expand Selection (2-hop) (${twoHopUnion.length} nodes)`,
            action: () => {
              this.model.set("selected_nodes", twoHopUnion);
              this.model.save_changes();
            },
          });
        }
      }

      if (threeHopIds && threeHopIds.size > 0) {
        const threeHopUnion = Array.from(new Set([...selectedIds, ...Array.from(threeHopIds)]));
        const prevSize = twoHopIds
          ? Array.from(new Set([...selectedIds, ...Array.from(twoHopIds)])).length
          : oneHopUnion.length;
        if (threeHopUnion.length > prevSize) {
          actions.push({
            label: `Expand Selection (3-hop) (${threeHopUnion.length} nodes)`,
            action: () => {
              this.model.set("selected_nodes", threeHopUnion);
              this.model.save_changes();
            },
          });
        }
      }
    }

    if (selectedIds.length >= 3) {
      actions.push({
        label: `Create Substrate (${selectedIds.length} nodes)`,
        action: () => {
          this.model.set("command", {
            action: "request_create_substrate",
            node_ids: selectedIds,
            click_x: this.lastX,
            click_y: this.lastY,
          });
          this.model.save_changes();
        },
      });

      actions.push({
        label: "Create Substrate (PCA)",
        action: () => {
          this.model.set("command", {
            action: "request_create_substrate",
            node_ids: selectedIds,
            dr_method: "pca",
            click_x: this.lastX,
            click_y: this.lastY,
          });
          this.model.save_changes();
        },
      });

      actions.push({
        label: "Create Substrate (UMAP)",
        action: () => {
          this.model.set("command", {
            action: "request_create_substrate",
            node_ids: selectedIds,
            dr_method: "umap",
            click_x: this.lastX,
            click_y: this.lastY,
          });
          this.model.save_changes();
        },
      });

      actions.push({
        label: "Create Substrate (t-SNE)",
        action: () => {
          this.model.set("command", {
            action: "request_create_substrate",
            node_ids: selectedIds,
            dr_method: "tsne",
            click_x: this.lastX,
            click_y: this.lastY,
          });
          this.model.save_changes();
        },
      });
    } else if (selectedIds.length > 0) {
      actions.push({
        label: "Select at least 3 nodes for substrate",
        action: () => {},
        disabled: true,
      });
    }

    if (selectedIds.length > 0) {
      actions.push({
        label: "Clear Selection",
        action: () => {
          this.model.set("selected_nodes", []);
          this.model.save_changes();
        },
      });
    }

    return actions;
  }

  getSubstrateActions(substrateId: string): MenuAction[] {
    return [
      {
        label: "Rename...",
        action: () => {
          const newName = prompt("Enter new name for substrate:");
          if (newName) {
            this.model.set("command", {
              action: "request_rename",
              substrate_id: substrateId,
              label: newName,
            });
            this.model.save_changes();
          }
        },
      },
      {
        label: "Switch to PCA",
        action: () => {
          this.model.set("command", {
            action: "request_update_dr",
            substrate_id: substrateId,
            dr_method: "pca",
          });
          this.model.save_changes();
        },
      },
      {
        label: "Switch to UMAP",
        action: () => {
          this.model.set("command", {
            action: "request_update_dr",
            substrate_id: substrateId,
            dr_method: "umap",
          });
          this.model.save_changes();
        },
      },
      {
        label: "Switch to t-SNE",
        action: () => {
          this.model.set("command", {
            action: "request_update_dr",
            substrate_id: substrateId,
            dr_method: "tsne",
          });
          this.model.save_changes();
        },
      },
      {
        label: "Dissolve Substrate",
        action: () => {
          this.model.set("command", {
            action: "request_dissolve",
            substrate_id: substrateId,
          });
          this.model.save_changes();
        },
      },
    ];
  }
}
