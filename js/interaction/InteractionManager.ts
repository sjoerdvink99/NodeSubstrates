import * as d3 from "https://esm.sh/d3@7";
import type { WidgetModel, NodeState } from "../types";
import type { StateManager } from "../state/StateManager";
import type { SimulationManager } from "../simulation/SimulationManager";
import type { RenderManager } from "../rendering/RenderManager";
import { ZoomHandler } from "./ZoomHandler";
import { LassoHandler } from "./LassoHandler";
import { DragHandler } from "./DragHandler";
import { ContextMenu } from "./ContextMenu";
import { SelectionPopover } from "../panels/SelectionPopover";
import { computeKHopNeighborhood } from "../utils/graph";

export class InteractionManager {
  private stateManager: StateManager;
  private simulationManager: SimulationManager;
  private renderManager: RenderManager;
  private model: WidgetModel;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

  private containerEl: HTMLElement;
  private zoomHandler: ZoomHandler;
  private lassoHandler: LassoHandler;
  private dragHandler: DragHandler;
  private contextMenu: ContextMenu;
  private selectionPopover: SelectionPopover;

  constructor(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
    stateManager: StateManager,
    simulationManager: SimulationManager,
    renderManager: RenderManager,
    model: WidgetModel,
    width: number,
    height: number,
    container: HTMLElement
  ) {
    this.stateManager = stateManager;
    this.simulationManager = simulationManager;
    this.renderManager = renderManager;
    this.model = model;
    this.svg = svg;
    this.containerEl = container;

    this.zoomHandler = new ZoomHandler(svg, mainGroup);
    this.mainGroup = mainGroup;

    this.lassoHandler = new LassoHandler(
      svg,
      mainGroup,
      renderManager.getInteractionLayer(),
      width,
      height
    );

    this.dragHandler = new DragHandler(
      stateManager,
      simulationManager,
      () => this.tick(),
      this.model
    );

    this.contextMenu = new ContextMenu(container, model);
    this.selectionPopover = new SelectionPopover(container, model);

    this.setupConnections();
  }

  private setupConnections(): void {
    this.lassoHandler.setOnComplete((selectedIds, event) => {
      const existing = this.model.get("selected_nodes") as string[];
      const merged = [...new Set([...existing, ...selectedIds])];

      this.model.set("selected_nodes", merged);
      this.model.save_changes();

      if (merged.length >= 3) {
        const state = this.stateManager.getState();
        const [worldX, worldY] = d3.pointer(event as MouseEvent, this.mainGroup.node());
        const [screenX, screenY] = this.getLocalCoords(event as MouseEvent);
        this.selectionPopover.show(screenX, screenY, merged, state.nodeMap, worldX, worldY);
      }
    });

    this.dragHandler.setOnNodeDrop((node, substrate) => {
      if (substrate) {
        this.model.set("command", {
          action: "request_add_to_substrate",
          substrate_id: substrate.id,
          node_id: node.id,
        });
        this.model.save_changes();
      }
    });

    this.renderManager.getNodeRenderer().setClickHandler((event, node) => {
      const currentSelection = this.model.get("selected_nodes");
      if (event.shiftKey) {
        const idx = currentSelection.indexOf(node.id);
        if (idx >= 0) {
          this.model.set("selected_nodes", [
            ...currentSelection.slice(0, idx),
            ...currentSelection.slice(idx + 1),
          ]);
        } else {
          this.model.set("selected_nodes", [...currentSelection, node.id]);
        }
      } else {
        this.model.set("selected_nodes", [node.id]);
        this.stateManager.pinHighlightedNode(node.id);
        const state = this.stateManager.getState();
        this.renderManager.updateNeighborHighlight(state);
      }
      this.model.save_changes();
    });

    this.renderManager.getNodeRenderer().setHoverHandler((node) => {
      const currentSelection = this.model.get("selected_nodes") as string[];
      if (currentSelection && currentSelection.length > 0) return;

      if (node) {
        this.stateManager.setHighlightedNode(node.id);
      } else {
        this.stateManager.setHighlightedNode(null);
      }
      const state = this.stateManager.getState();
      this.renderManager.updateNeighborHighlight(state);
    });

    this.renderManager.getNodeRenderer().setContextMenuHandler((event, node) => {
      const currentSelection = this.model.get("selected_nodes");
      if (!currentSelection.includes(node.id)) {
        this.model.set("selected_nodes", [node.id]);
        this.model.save_changes();
      }
      this.stateManager.pinHighlightedNode(node.id);
      const state = this.stateManager.getState();
      this.renderManager.updateNeighborHighlight(state);

      const selectedIds = this.model.get("selected_nodes");
      const oneHop = computeKHopNeighborhood([node.id], state.edges, 1);
      const twoHop = computeKHopNeighborhood([node.id], state.edges, 2);
      const threeHop = computeKHopNeighborhood([node.id], state.edges, 3);

      const actions = this.contextMenu.getNodeActions(selectedIds, oneHop, twoHop, threeHop);
      const [worldX, worldY] = d3.pointer(event as MouseEvent, this.mainGroup.node());
      const [screenX, screenY] = this.getLocalCoords(event as MouseEvent);

      this.contextMenu.show(screenX, screenY, actions, worldX, worldY);
    });

    this.renderManager.getSubstrateRenderer().setContextMenuHandler((event, substrate) => {
      const actions = this.contextMenu.getSubstrateActions(substrate.id);
      const [worldX, worldY] = d3.pointer(event as MouseEvent, this.mainGroup.node());
      const [screenX, screenY] = this.getLocalCoords(event as MouseEvent);

      this.contextMenu.show(screenX, screenY, actions, worldX, worldY);
    });

    this.renderManager.getNodeRenderer().setDragBehavior(
      this.dragHandler.createNodeDrag()
    );
    this.renderManager.getSubstrateRenderer().setDragBehavior(
      this.dragHandler.createSubstrateDrag()
    );

    this.svg.on("click", (event: MouseEvent) => {
      const target = event.target as SVGElement;
      if (target.tagName === "svg" || target.classList.contains("main-group")) {
        if (this.selectionPopover.isVisible()) return;
        this.stateManager.clearNodeHighlight();
        const state = this.stateManager.getState();
        this.renderManager.updateNeighborHighlight(state);
        this.model.set("selected_nodes", []);
        this.model.save_changes();
      }
    });
  }

  private getLocalCoords(event: MouseEvent): [number, number] {
    const rect = this.containerEl.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  updateNodes(nodes: NodeState[]): void {
    this.lassoHandler.setNodes(nodes);
  }

  setWidth(width: number): void {
    this.svg.attr("width", width);
  }

  private tick(): void {
    const state = this.stateManager.getState();
    this.renderManager.tick(state);
  }

  getZoomHandler(): ZoomHandler {
    return this.zoomHandler;
  }
}
