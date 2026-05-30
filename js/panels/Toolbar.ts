import * as d3 from "https://esm.sh/d3@7";
import type { WidgetModel, Node } from "../types";

export interface ToolbarOptions {
  container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  model: WidgetModel;
  onSettingsClick: () => void;
  onFocusModeToggle: (enabled: boolean) => void;
  getZoomScale?: () => number;
}

function buildSearchHaystack(n: Node): string {
  const valueToString = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const t = typeof v;
    if (t === 'string') return v as string;
    if (t === 'number' || t === 'boolean') return String(v);
    if (Array.isArray(v)) return (v as unknown[]).map(valueToString).join(' ');
    if (t === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return Object.keys(v as object).map((k) => `${k}:${valueToString((v as Record<string, unknown>)[k])}`).join(' ');
      }
    }
    return '';
  };

  let hay = valueToString(n.id) + ' ' + valueToString(n.label) + ' ';
  const attrs = n.attributes as Record<string, unknown>;
  if (attrs.smiles) hay += valueToString(attrs.smiles) + ' ';
  if (attrs.smile) hay += valueToString(attrs.smile) + ' ';
  for (const k of Object.keys(n)) {
    if (k === 'id' || k === 'label' || k === 'attributes') continue;
    hay += valueToString((n as unknown as Record<string, unknown>)[k]) + ' ';
  }
  hay += valueToString(attrs) + ' ';
  return hay;
}

function normalizeHay(s: string): string {
  if (!s) return '';
  s = s.replace(/\\u0040/gi, '@');
  s = s.replace(/\\x40/gi, '@');
  s = s.replace(/&\#64;/g, '@');
  s = s.replace(/%40/g, '@');
  s = s.replace(/\\([\\@\[\]\(\)\{\}\.\+\*\?\^\$\|\-])/g, '$1');
  return s;
}

function buildRegex(q: string, regexEnabled: boolean): RegExp {
  if (!q) return new RegExp('');
  if (q.length > 2 && q[0] === '/' && q.lastIndexOf('/') > 0) {
    const last = q.lastIndexOf('/');
    const body = q.slice(1, last);
    const flags = q.slice(last + 1) || 'i';
    try {
      return new RegExp(body, flags);
    } catch {
    }
  }
  if (regexEnabled) {
    try {
      return new RegExp(q, 'i');
    } catch {
    }
  }
  const escapeRegex = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  return new RegExp(escapeRegex(q), 'i');
}

export class Toolbar {
  private toolbar: d3.Selection<HTMLDivElement, unknown, null, undefined>;
  private model: WidgetModel;
  private getZoomScale: () => number;
  private refreshButton: d3.Selection<HTMLButtonElement, unknown, null, undefined>;
  private focusModeActive: boolean = false;

  constructor(options: ToolbarOptions) {
    this.model = options.model;
    this.getZoomScale = options.getZoomScale || (() => 1.0);

    this.toolbar = options.container
      .append("div")
      .attr("class", "toolbar");

    this.refreshButton = this.toolbar
      .append("button")
      .attr("class", "toolbar-button refresh-button")
      .attr("title", "Re-run Layout")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
      </svg>`);

    const settingsButton = this.toolbar
      .append("button")
      .attr("class", "toolbar-button settings-button")
      .attr("title", "Layout Settings")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>`);

    this.refreshButton.on("click", () => {
      this.setLoading(true);
      const scale = this.getZoomScale();
      this.model.set("layout_scale", scale);
      this.model.set("rerun_layout", Date.now());
      this.model.save_changes();
    });

    const focusButton = this.toolbar
      .append("button")
      .attr("class", "toolbar-button focus-button")
      .attr("title", "Focus on substrates (hide unrelated nodes)")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
      </svg>`);

    focusButton.on("click", () => {
      this.focusModeActive = !this.focusModeActive;
      focusButton.classed("active", this.focusModeActive);
      options.onFocusModeToggle(this.focusModeActive);
    });

    const searchBox = this.toolbar.append("div").attr("class", "toolbar-search");

    const searchButton = searchBox
      .append("button")
      .attr("class", "toolbar-button search-button")
      .attr("title", "Search nodes")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="2" fill="none"/></svg>`);

    const searchPanel = searchBox.append("div").attr("class", "search-panel");
    const searchInput = searchPanel.append("input")
      .attr("class", "search-input")
      .attr("type", "text")
      .attr("placeholder", "Search nodes (regex or text)");

    const regexWrapper = searchPanel.append("label")
      .attr("class", "search-regex")
      .style("display", "inline-flex")
      .style("align-items", "center")
      .style("gap", "6px");
    const regexCheckbox = regexWrapper.append("input").attr("type", "checkbox").attr("class", "search-regex-checkbox");
    regexWrapper.append("span").text("Regex");

    const acceptBtn = searchPanel.append("button")
      .attr("class", "search-accept")
      .attr("title", "Accept")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.4-1.4z"/></svg>`);
    const cancelBtn = searchPanel.append("button")
      .attr("class", "search-cancel")
      .attr("title", "Close")
      .html(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.3 5.71L12 12l6.3 6.29-1.41 1.41L10.59 13.41 4.29 19.71 2.88 18.3 9.18 12 2.88 5.71 4.29 4.3 10.59 10.59 16.88 4.3z"/></svg>`);

    let open = false;
    const setOpen = (v: boolean) => {
      open = v;
      searchBox.classed("open", open);
    };

    searchButton.on("click", () => {
      setOpen(!open);
      if (!open) return;
      (searchInput.node() as HTMLInputElement).focus();
      (searchInput.node() as HTMLInputElement).select();
    });

    cancelBtn.on("click", () => setOpen(false));

    let regexEnabled = false;
    regexCheckbox.on("change", () => {
      regexEnabled = (regexCheckbox.node() as HTMLInputElement).checked;
    });

    const doSearch = () => {
      const q = (searchInput.node() as HTMLInputElement).value.trim();
      if (!q) return;
      const re = buildRegex(q, regexEnabled);
      const nodes = this.model.get("nodes") as Node[];
      const matches = nodes
        .filter((n) => re.test(normalizeHay(buildSearchHaystack(n))))
        .map((n) => n.id);

      if (matches.length > 0) {
        this.model.set("selected_nodes", matches);
        this.model.save_changes();
        setOpen(false);
      } else {
        searchInput.node()!.classList.add('search-no-match');
        setTimeout(() => searchInput.node()!.classList.remove('search-no-match'), 800);
      }
    };

    const liveSearch = () => {
      const q = (searchInput.node() as HTMLInputElement).value.trim();
      const nodes = this.model.get("nodes") as Node[];
      if (!q) {
        this.model.set("selected_nodes", []);
        this.model.save_changes();
        return;
      }
      const re = buildRegex(q, regexEnabled);
      const matches = nodes
        .filter((n) => re.test(normalizeHay(buildSearchHaystack(n))))
        .map((n) => n.id);
      this.model.set("selected_nodes", matches);
      this.model.save_changes();
    };

    acceptBtn.on("click", doSearch);
    searchInput.on("keydown", (event: KeyboardEvent) => {
      if (event.key === 'Enter') doSearch();
      if (event.key === 'Escape') setOpen(false);
    });

    let debounceTimer: number | null = null;
    searchInput.on("input", () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        liveSearch();
        debounceTimer = null;
      }, 250);
    });

    settingsButton.on("click", options.onSettingsClick);

    this.model.on("change:nodes", () => {
      this.setLoading(false);
    });
  }

  setLoading(loading: boolean): void {
    this.refreshButton.classed("loading", loading);
  }
}
