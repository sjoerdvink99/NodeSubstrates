import * as d3 from "https://esm.sh/d3@7";
import type { NodeState, Substrate, WidgetModel } from "../types";
import type { StateManager } from "../state/StateManager";
import type { SimulationManager } from "../simulation/SimulationManager";

type NodeDropCallback = (node: NodeState, substrate: Substrate | null) => void;

export class DragHandler {
  private stateManager: StateManager;
  private simulationManager: SimulationManager;
  private onNodeDrop: NodeDropCallback | null = null;
  private model: WidgetModel | null = null;
  private onTick: () => void;

  constructor(
    stateManager: StateManager,
    simulationManager: SimulationManager,
    onTick: () => void,
    model?: WidgetModel
  ) {
    this.stateManager = stateManager;
    this.simulationManager = simulationManager;
    this.onTick = onTick;
    this.model = model ?? null;
  }

  setOnNodeDrop(callback: NodeDropCallback): void {
    this.onNodeDrop = callback;
  }

  createNodeDrag(): d3.DragBehavior<SVGCircleElement, NodeState, unknown> {
    return d3
      .drag<SVGCircleElement, NodeState>()
      .filter((event, d) => !d.isInSubstrate)
      .on("start", (event, d) => {
        this.stateManager.setInteractionMode("drag-node");
        this.simulationManager.startNodeDrag();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
        d.x = event.x;
        d.y = event.y;
      })
      .on("end", (event, d) => {
        this.stateManager.setInteractionMode("idle");
        this.simulationManager.endNodeDrag();

        const substrate = this.stateManager.findSubstrateAtPoint(d.x, d.y);

        if (this.onNodeDrop) {
          this.onNodeDrop(d, substrate);
        }

        if (!substrate) {
          d.fx = null;
          d.fy = null;
        }
      });
  }

  createSubstrateDrag(): d3.DragBehavior<SVGGElement, Substrate, unknown> {
    const stateManager = this.stateManager;
    const simulationManager = this.simulationManager;
    const onTick = this.onTick;
    const handlerModel = this.model;

    return d3
      .drag<SVGGElement, Substrate>()
      .filter((event) => event.ctrlKey)
      .on("start", function (event) {
        event.sourceEvent.stopPropagation();
        event.sourceEvent.preventDefault();
        stateManager.setInteractionMode("drag-substrate");
        simulationManager.startSubstrateDrag();
        d3.select(this).raise();
      })
      .on("drag", function (event, d) {
        if (!d.bounds) return;
        stateManager.moveSubstrate(d.id, event.dx, event.dy);
        onTick();
      })
      .on("end", function (event, d) {
        stateManager.setInteractionMode("idle");
        simulationManager.endSubstrateDrag();

        const st = stateManager.getState();
        const substrate = st.substrates.find((s) => s.id === d.id);
        if (substrate && substrate.bounds && handlerModel) {
          handlerModel.set("command", {
            action: "request_resize_substrate",
            substrate_id: d.id,
            bounds: substrate.bounds,
          });
          handlerModel.save_changes();
        }
      });
  }
}
