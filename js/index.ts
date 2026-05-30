import * as d3 from "https://esm.sh/d3@7";
import type { WidgetModel, Command } from "./types";
import { StateManager } from "./state/StateManager";
import { SimulationManager } from "./simulation/SimulationManager";
import { RenderManager } from "./rendering/RenderManager";
import { InteractionManager } from "./interaction/InteractionManager";
import { Toolbar, SettingsModal, SubstrateSettingsModal, DetailPanel, LoadingOverlay } from "./panels";

const DETAIL_PANEL_WIDTH = 280;
const DETAIL_PANEL_COLLAPSED_WIDTH = 36;

const appliedLayoutScaleModels = new WeakSet<object>();

function render({ model, el }: { model: WidgetModel; el: HTMLElement }) {
  try {
    return renderWidget(model, el);
  } catch (error) {
    el.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace; white-space: pre-wrap; background: #fff0f0; border: 1px solid red;">
      <strong>Widget Error:</strong>\n${error instanceof Error ? error.message : String(error)}\n\n${error instanceof Error ? error.stack : ''}
    </div>`;
    console.error("NodeSubstrates render error:", error);
  }
}

function renderWidget(model: WidgetModel, el: HTMLElement): () => void {
  const container = d3.select(el);
  container.selectAll("*").remove();

  const modelWidth = model.get("width");
  const height = model.get("height") as number;

  const containerWidth = el.clientWidth;
  const width = containerWidth > DETAIL_PANEL_WIDTH + 200
    ? Math.min(modelWidth, containerWidth)
    : modelWidth;

  let panelCollapsed = false;

  const currentPanelWidth = () =>
    panelCollapsed ? DETAIL_PANEL_COLLAPSED_WIDTH : DETAIL_PANEL_WIDTH;

  const computeSvgWidth = () => Math.max(200, width - currentPanelWidth());

  let svgWidth = computeSvgWidth();

  const wrapper = container
    .append("div")
    .style("display", "flex")
    .style("width", `${width}px`)
    .style("max-width", "100%")
    .style("height", `${height}px`)
    .style("box-sizing", "border-box");

  const vizContainer = wrapper
    .append("div")
    .style("position", "relative")
    .style("width", `${svgWidth}px`)
    .style("min-width", "0")
    .style("height", `${height}px`)
    .style("flex-shrink", "1")
    .style("box-sizing", "border-box");

  const loadingOverlay = new LoadingOverlay({
    container: vizContainer,
    width: svgWidth,
    height: height,
    visible: !model.get("ready"),
  });

  const svg = vizContainer
    .append("svg")
    .attr("width", svgWidth)
    .attr("height", height)
    .attr("class", "node-substrates")
    .style("visibility", model.get("ready") ? "visible" : "hidden");

  const mainGroup = svg.append("g").attr("class", "main-group");

  const stateManager = new StateManager(model);
  const renderManager = new RenderManager(mainGroup);

  const settingsModal = new SettingsModal({
    container: vizContainer,
    model: model,
    getSizeBy: () => stateManager.getState().sizeBy,
    onApplySizeRange: (minSize, maxSize) => {
      const sb = stateManager.getState().sizeBy;
      stateManager.setSizeBy(sb.attribute, sb.method, minSize, maxSize);
      const st = stateManager.getState();
      renderManager.render(st);
      simulationManager.relayoutForSizeChange(st.nodes, st.sizeBy);
    },
  });

  const detailPanel = new DetailPanel({
    container: wrapper,
    onToggleCollapse: (collapsed) => {
      panelCollapsed = collapsed;
      svgWidth = computeSvgWidth();
      vizContainer.style("width", `${svgWidth}px`);
      svg.attr("width", svgWidth);
      loadingOverlay.setWidth(svgWidth);
      simulationManager.setDimensions(svgWidth, height);
      interactionManager.setWidth(svgWidth);
    },
    onColorBy: (attribute, type) => {
      stateManager.setColorBy(attribute, type);
      const state = stateManager.getState();
      renderManager.updateColors(state);
      detailPanel.setColorByAttribute(attribute);
      const selectedNodes = model.get("selected_nodes");
      if (selectedNodes.length > 0) {
        detailPanel.update(selectedNodes, state.nodeMap);
      }
    },
    onClearColorBy: () => {
      stateManager.clearColorBy();
      const state = stateManager.getState();
      renderManager.updateColors(state);
      detailPanel.setColorByAttribute(null);
      const selectedNodes = model.get("selected_nodes");
      if (selectedNodes.length > 0) {
        detailPanel.update(selectedNodes, state.nodeMap);
      }
    },
    onSizeBy: (attribute, method) => {
      stateManager.setSizeBy(attribute, method);
      const state = stateManager.getState();
      renderManager.render(state);
      simulationManager.relayoutForSizeChange(state.nodes, state.sizeBy);
      const selectedNodes = model.get("selected_nodes");
      if (selectedNodes.length > 0) {
        detailPanel.update(selectedNodes, state.nodeMap);
      }
    },
    onClearSizeBy: () => {
      stateManager.clearSizeBy();
      const state = stateManager.getState();
      renderManager.render(state);
      simulationManager.relayoutForSizeChange(state.nodes, state.sizeBy);
    },
    onSelectNodes: (nodeIds) => {
      stateManager.setSelection(nodeIds);
      const st = stateManager.getState();
      renderManager.updateNeighborHighlight(st);
      model.set("selected_nodes", nodeIds);
      model.save_changes();
    },
    onHoverNodes: (nodeIds) => {
      const currentSel = model.get("selected_nodes") as string[];
      if (currentSel && currentSel.length > 0) return;

      if (nodeIds && nodeIds.length > 0) {
        stateManager.setHighlightedNodes(nodeIds);
      } else {
        const st = stateManager.getState();
        if (st.pinnedHighlightNodeId) {
          stateManager.pinHighlightedNode(st.pinnedHighlightNodeId);
        } else {
          stateManager.setHighlightedNodes(null);
        }
      }
      const st2 = stateManager.getState();
      renderManager.updateNeighborHighlight(st2);
      if (!currentSel || currentSel.length === 0) {
        detailPanel.setHoverNodes(nodeIds, model.get("selected_nodes"));
      }
    },
  });

  const substrateSettingsModal = new SubstrateSettingsModal({
    container: vizContainer,
    model: model,
  });

  const simulationManager = new SimulationManager(
    stateManager,
    svgWidth,
    height,
    () => {
      const state = stateManager.getState();
      renderManager.tick(state);
    }
  );

  const interactionManager = new InteractionManager(
    svg,
    mainGroup,
    stateManager,
    simulationManager,
    renderManager,
    model,
    svgWidth,
    height,
    vizContainer.node()!
  );

  renderManager.getSubstrateRenderer().setSettingsClickHandler((substrate) => {
    substrateSettingsModal.open(substrate);
  });

  renderManager.getSubstrateRenderer().setSubstrateClickHandler((substrate) => {
    const currentActive = stateManager.getActiveSubstrateId();
    if (currentActive === substrate.id) {
      stateManager.setActiveSubstrateId(null);
      detailPanel.setActiveSubstrate(null);
      model.set("selected_nodes", []);
      model.save_changes();
    } else {
      stateManager.setActiveSubstrateId(substrate.id);
      detailPanel.setActiveSubstrate(substrate.node_ids || []);
      model.set("selected_nodes", substrate.node_ids || []);
      model.save_changes();
    }
  });

  renderManager.getSubstrateRenderer().setLabelEditHandler((substrateId, newLabel) => {
    model.set("command", { action: "request_rename", substrate_id: substrateId, label: newLabel });
    model.save_changes();
  });

  renderManager.getSubstrateRenderer().setResizeHandler((substrateId, bounds, isEnd) => {
    stateManager.setSubstrateBounds(substrateId, bounds);
    const st = stateManager.getState();
    renderManager.render(st);

    if (isEnd) {
      model.set("command", { action: "request_resize_substrate", substrate_id: substrateId, bounds });
      model.save_changes();
      const substrate = st.substrates.find((s) => s.id === substrateId);
      const dr = substrate?.dr_method || model.get("dr_method");
      model.set("command", { action: "request_update_dr", substrate_id: substrateId, dr_method: dr });
      model.save_changes();
    }
  });

  new Toolbar({
    container: vizContainer,
    model: model,
    onSettingsClick: () => settingsModal.open(),
    getZoomScale: () => interactionManager.getZoomHandler().getTransform().k,
    onFocusModeToggle: () => {
      stateManager.toggleFocusMode();
      const state = stateManager.getState();
      renderManager.render(state);
    },
  });

  const cleanups: (() => void)[] = [];
  const registerHandler = (event: string, callback: () => void) => {
    model.on(event, callback);
    cleanups.push(() => model.off(event, callback));
  };

  const onReadyChange = () => {
    const isReady = model.get("ready");
    loadingOverlay.setVisible(!isReady);
    svg.style("visibility", isReady ? "visible" : "hidden");

    if (isReady) {
      stateManager.updateFromModel();
      const state = stateManager.getState();
      simulationManager.forceRestart(state.nodes, state.edges);
      renderManager.render(state);
      interactionManager.updateNodes(state.nodes);
      detailPanel.setAllNodes(state.nodeMap);
      detailPanel.update(model.get("selected_nodes"), state.nodeMap);
    }
  };

  const onNodesChange = () => {
    if (!model.get("ready")) return;

    const newModelNodes = model.get("nodes");
    const targetPositions = new Map(
      newModelNodes.map((n) => [n.id, { x: n.x, y: n.y }])
    );

    const currentState = stateManager.getState();
    let hasChanges = false;
    for (const [nodeId, target] of targetPositions) {
      const current = currentState.nodeMap.get(nodeId);
      if (current && (Math.abs(current.x - target.x) > 1 || Math.abs(current.y - target.y) > 1)) {
        hasChanges = true;
        break;
      }
    }

    if (!hasChanges) {
      stateManager.updateFromModel();
      const state = stateManager.getState();
      renderManager.render(state);
      return;
    }

    simulationManager.pause();

    renderManager.animateToTargetPositions(targetPositions, currentState).then(() => {
      stateManager.updateFromModel();
      const state = stateManager.getState();
      simulationManager.updateData(state.nodes, state.edges);
      simulationManager.resume();
      renderManager.render(state);
      interactionManager.updateNodes(state.nodes);
    }).catch(console.error);
  };

  const onEdgesChange = () => {
    if (!model.get("ready")) return;
    stateManager.updateFromModel();
    const state = stateManager.getState();
    simulationManager.updateData(state.nodes, state.edges);
    renderManager.render(state);
  };

  const onSubstratesChange = () => {
    if (!model.get("ready")) return;
    stateManager.updateFromModel();
    const state = stateManager.getState();
    simulationManager.updateConstraints();
    renderManager.render(state);
  };

  const onSelectedNodesChange = () => {
    const selected = model.get("selected_nodes");
    stateManager.setSelection(selected);
    const state = stateManager.getState();
    renderManager.updateNeighborHighlight(state);
    renderManager.updateSelection(state.selection);
    if (!selected || selected.length === 0) {
      stateManager.setActiveSubstrateId(null);
      detailPanel.setActiveSubstrate(null);
    }
    detailPanel.update(selected, state.nodeMap);
  };

  const onCommandChange = () => {
    const cmd: Command = model.get("command");
    if (!cmd || !("action" in cmd)) return;

    const state = stateManager.getState();

    if (cmd.action === "create_substrate") {
      const substrate = state.substrates.find((s) => s.id === cmd.substrate_id);
      if (substrate) {
        renderManager.animateToSubstrate(substrate, state.nodeMap);
      }
    } else if (cmd.action === "dissolve_substrate") {
      simulationManager.releaseNodes();
    } else if (cmd.action === "request_pin_highlight") {
      const nodeIds = cmd.node_ids;
      const nodeId = cmd.node_id;
      if (nodeIds && nodeIds.length > 1) {
        stateManager.setSelection(nodeIds);
        const st = stateManager.getState();
        renderManager.updateNeighborHighlight(st);
      } else if (nodeId) {
        stateManager.pinHighlightedNode(nodeId);
        const st = stateManager.getState();
        renderManager.updateNeighborHighlight(st);
      }
    } else if (cmd.action === "request_temp_highlight") {
      const nodeIds = cmd.node_ids;
      const nodeId = cmd.node_id;
      if (!nodeIds && !nodeId) {
        stateManager.setHighlightedNodes(null);
      } else if (nodeIds && nodeIds.length > 0) {
        stateManager.setHighlightedNodes(nodeIds);
      } else if (nodeId) {
        stateManager.setHighlightedNode(nodeId);
      } else {
        stateManager.setHighlightedNodes(null);
      }
      const st = stateManager.getState();
      renderManager.updateNeighborHighlight(st);
    } else if (cmd.action === "update_substrate") {
      renderManager.render(state);
    }
  };

  registerHandler("change:ready", onReadyChange);
  registerHandler("change:nodes", onNodesChange);
  registerHandler("change:edges", onEdgesChange);
  registerHandler("change:substrates", onSubstratesChange);
  registerHandler("change:selected_nodes", onSelectedNodesChange);
  registerHandler("change:command", onCommandChange);

  if (model.get("ready")) {
    const initialState = stateManager.getState();
    simulationManager.forceRestart(initialState.nodes, initialState.edges);
    renderManager.render(initialState);
    interactionManager.updateNodes(initialState.nodes);
    detailPanel.setAllNodes(initialState.nodeMap);
    detailPanel.update(model.get("selected_nodes"), initialState.nodeMap);

    if (!appliedLayoutScaleModels.has(model as object)) {
      const layoutScale = model.get("layout_scale");
      if (layoutScale !== 1.0) {
        interactionManager.getZoomHandler().setScale(layoutScale, false);
      }
      appliedLayoutScaleModels.add(model as object);
    }
  }

  return () => {
    cleanups.forEach(fn => fn());
    simulationManager.stop();
  };
}

export default { render };
