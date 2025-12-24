import type { MacroBank, TechnoProfileId } from "../aivj/aivjTechno";
import type { DecisionTraceEvent } from "./DecisionTrace";

export type DecisionTopologySnapshot = {
  nowMs: number;
  decisionTrace?: {
    recent: DecisionTraceEvent[];
  };
  audio: {
    playing: boolean;
    source?: string;
    ctxState?: string;
  };
  audioFrame: {
    energy01: number;
    rms: number;
    peak: number;
    tempoBpm?: number;
    beatConfidence01?: number;
    beatStability01?: number;
  };
  beatTempo?: {
    enabled: boolean;
    windowSec: number;
    updateIntervalMs: number;
    minTempo: number;
    maxTempo: number;
    method: "multifeature" | "degara" | "aubio";
    inputFps: number;
    ok: boolean;
    bpm: number;
    confidence01: number;
    stability01: number;
    beatPhase01: number;
    beatPulse01: number;
  };
  audioControls?: {
    enabled: boolean;
    mixToMacros: number;
    attackMs: number;
    releaseMs: number;
    maxDeltaPerSec: number;
    amounts: {
      projectm: number;
      liquid: number;
      basic: number;
      camera: number;
      video: number;
      depth: number;
    };
    snapshot: {
      energy01: number;
      bass01: number;
      flux01: number;
      beatPulse01: number;
      fusion01: number;
      motion01: number;
      sparkle01: number;
    };
  };
  aivj: {
    enabled: boolean;
    profile: TechnoProfileId;
    macroOwner: string | null;
    macroOwnerTtlMs: number;
    manualHoldMs: number;
    baseBank: MacroBank;
    runtimeBank?: MacroBank | null;
    debug?: {
      mode: string;
      section?: string;
      stage?: string;
      mix01?: number;
      targetAgeMs?: number;
      accent01?: number;
      slotPulse01?: number;
      accentSource?: "expressive" | "raw" | "none";
    };
  };
  macroPreset?: {
    id?: string | null;
    label?: string | null;
    autoApply?: boolean;
  };
  overlay: {
    energy01: number;
    depthFresh01: number;
    scale01: number;
    meanOverlayMul01: number;
    pmTarget01: number;
    cfg?: {
      maxEnergy: number;
      minScale: number;
      depthWeight: number;
      smoothBaseMs: number;
      priorityBasic: number;
      priorityCamera: number;
      priorityVideo: number;
      priorityDepth: number;
      pmRetreatStrength: number;
      pmRetreatFloor: number;
    };
    mul: {
      basic: number;
      camera: number;
      video: number;
      depth: number;
      projectm: number;
    };
  };
  runtime?: {
    renderer?: {
      compositor?: {
        enabled: boolean;
        blendMode: string;
        targetMode: "viewport" | "fixed";
        fixedWidth: number;
        fixedHeight: number;
        poolSize: number;
        shaderVersion?: string;
        rtColorSpace?: string;
      };
      compositorProfile?: {
        enabled: boolean;
        blendMode: string;
        targetMode: "viewport" | "fixed";
        fixedWidth: number;
        fixedHeight: number;
        poolSize: number;
        shaderVersion?: string;
        rtColorSpace?: string;

        bypassProjectM: boolean;
        passesLastFrame: number;
        cpuMsLastFrame: number;
        rtKey: string | null;
        rtWidth: number;
        rtHeight: number;
        viewportWidth: number;
        viewportHeight: number;
        lastRtReallocMs: number;
      };
    };
    projectm?: { opacity01?: number; energyToOpacityAmount01?: number };
    liquid?: Record<string, unknown>;
    camera?: {
      enabled?: boolean;
      opacity01?: number;
      state?: string;
      segmentPerson?: boolean;
      portraitEdge01?: number;
      portraitArea01?: number;
    };
    depth?: {
      enabled?: boolean;
      source?: string;
      state?: string;
      fpsIn?: number;
      fpsProc?: number;
      framesIn?: number;
      framesProcessed?: number;
    };
    spatial?: {
      portraitEdge01: number;
      portraitArea01: number;
      depthFresh01: number;
      cameraEdgeToPmAmount01: number;
      edgeDrive01: number;
      edgeBias01: number;
      piBiasSigned: number;
      presetBiasSigned: number;
      externalOpacityDriveSigned: number;
    };
    projectmVerify?: {
      avgLuma?: number;
      avgColor?: { r: number; g: number; b: number };
      perPm?: {
        fg?: {
          avgLuma?: number;
          avgColor?: { r: number; g: number; b: number };
        };
        bg?: {
          avgLuma?: number;
          avgColor?: { r: number; g: number; b: number };
        };
      };
      closedLoopPiEnabled?: boolean;
      closedLoopPiTarget?: number;
      closedLoopPiError?: number;
      closedLoopPiOpacity?: number;
      colorLoopEnabled?: boolean;
      colorLoopHue01?: number;
      colorLoopStrength01?: number;
      colorLoopContrastMul?: number;
    };
  };
  controlPlane?: {
    gate?: {
      audioValid?: boolean;
      beatTrusted?: boolean;
      renderStable?: boolean;
    };
    cooldown?: {
      audioMs?: number;
      beatMs?: number;
      renderMs?: number;
      m3Ms?: number;
      fgMs?: number;
      bgMs?: number;
      fgRecentMs?: number;
      bgRecentMs?: number;
    };
    sectionState?: string;
    scheduledAction?: string | null;
    denyReasonsTop?: string[];
    freezeFlags?: {
      rebuild?: boolean;
      resCooldown?: boolean;
      beatCooldown?: boolean;
    };
    finalWriter?: string | null;
    lastEvent?: string | null;
    coupler?: {
      kEff?: number;
      phaseW?: number;
      signFlipRate2s?: number;
      freeze?: boolean;
    };
    calibration?: {
      enabled?: boolean;
      autoOffMs?: number;
    };
    display?: {
      viewportW?: number;
      viewportH?: number;
      dpr?: number;
      initScale?: number;
      targetW?: number;
      targetH?: number;
      pending?: boolean;
    };
    color?: {
      outputColorSpace?: string;
      toneMapping?: string;
      toneMappingExposure?: number;
      premultipliedAlpha?: boolean | null;
      targetMode?: "viewport" | "fixed";
      fixedWidth?: number;
      fixedHeight?: number;
    };
    phase?: {
      phase01?: number;
      fgWindow?: boolean;
      bgWindow?: boolean;
    };
    preset?: {
      fgId?: string | null;
      bgId?: string | null;
    };
    presetStats?: {
      hardFails?: number;
      softFails?: number;
      aestheticFails?: number;
      anchorFallbacks?: number;
      lastAnchorReason?: string | null;
    };
    events?: Array<{ tMs: number; type: string; detail?: string }>;
  };
};

type OverlayUiState = {
  x: number;
  y: number;
  w: number;
  h: number;
  collapsed: boolean;
  zoom: number;
  hidden: boolean;
};

const STORAGE_KEY = "newliveweb:ui:decisionTopologyOverlay";

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const clamp01 = (v: number) => clamp(v, 0, 1);

const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

const absDiff = (
  a: number | null | undefined,
  b: number | null | undefined
) => {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
  return Math.abs(y - x);
};

const fmtSignedPct = (d01: number) => {
  const d = clamp(Number(d01), -1, 1);
  const sign = d > 0 ? "+" : d < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(d) * 100)}%`;
};

const fmtBpm = (bpm?: number) => {
  if (bpm == null) return "--";
  const n = Number(bpm);
  if (!Number.isFinite(n) || n <= 0) return "--";
  return `${n.toFixed(1)} bpm`;
};

const fmtMs = (ms: number) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "0ms";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
};

function safeReadState(storage: Storage | null): OverlayUiState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<OverlayUiState>;
    if (!data) return null;
    const x = clamp(Number(data.x ?? 12), 0, 10_000);
    const y = clamp(Number(data.y ?? 12), 0, 10_000);
    const w = clamp(Number(data.w ?? 920), 360, 2000);
    const h = clamp(Number(data.h ?? 520), 220, 1400);
    const zoom = clamp(Number(data.zoom ?? 1.15), 0.6, 1.8);
    return {
      x,
      y,
      w,
      h,
      zoom,
      collapsed: Boolean(data.collapsed ?? false),
      hidden: Boolean(data.hidden ?? false),
    };
  } catch {
    return null;
  }
}

function safeWriteState(storage: Storage | null, state: OverlayUiState) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

type BaseNodeId =
  | "ui"
  | "visualState"
  | "control"
  | "audio"
  | "beat"
  | "audioControls"
  | "aivj"
  | "macro"
  | "macroMapper"
  | "overlay"
  | "coupling"
  | "pmSampler"
  | "pmClosedLoop"
  | "pmColorLoop"
  | "projectm"
  | "liquid"
  | "camera"
  | "cameraSeg"
  | "depth"
  | "video"
  | "basic";

type ParamNodeId = `param:${string}`;

type NodeId = BaseNodeId | ParamNodeId;

type NodeDef = {
  id: NodeId;
  label: string;
  x: number;
  y: number;
};

type BaseEdgeId =
  | "ui->visualState"
  | "visualState->macro"
  | "audio->beat"
  | "audio->audioControls"
  | "beat->audioControls"
  | "beat->aivj"
  | "audioControls->macro"
  | "aivj->macro"
  | "macro->macroMapper"
  | "macroMapper->projectm"
  | "macroMapper->liquid"
  | "macroMapper->basic"
  | "macroMapper->camera"
  | "macroMapper->video"
  | "macroMapper->depth"
  | "overlay->camera"
  | "overlay->projectm"
  | "overlay->video"
  | "overlay->depth"
  | "overlay->basic"
  | "camera->cameraSeg"
  | "cameraSeg->coupling"
  | "depth->coupling"
  | "pmSampler->pmClosedLoop"
  | "pmSampler->pmColorLoop"
  | "pmClosedLoop->coupling"
  | "coupling->projectm"
  | "projectm->pmSampler"
  | "pmColorLoop->liquid";

type DynEdgeId = `dyn:${string}`;

type EdgeId = BaseEdgeId | DynEdgeId;

type EdgeKind = "state" | "audio" | "ai" | "overlay" | "spatial" | "feedback";

type EdgeDef = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  label: string;
  kind: EdgeKind;
};

const NODES: NodeDef[] = [
  { id: "ui", label: "UI/MIDI/Inspector", x: 90, y: 70 },
  { id: "visualState", label: "VisualStateV2", x: 90, y: 150 },
  { id: "control", label: "ControlPlane", x: 330, y: 140 },

  { id: "audio", label: "AudioBus", x: 90, y: 260 },
  { id: "beat", label: "Audio/BeatTempo", x: 330, y: 230 },
  { id: "audioControls", label: "Audio/Controls", x: 330, y: 310 },

  { id: "aivj", label: "AIVJ", x: 580, y: 240 },
  { id: "macro", label: "MacroBank", x: 800, y: 240 },
  { id: "macroMapper", label: "Macro -> Params", x: 1020, y: 240 },

  { id: "overlay", label: "overlayBudget", x: 580, y: 360 },
  { id: "camera", label: "Camera", x: 1020, y: 330 },
  { id: "cameraSeg", label: "Seg/Portrait", x: 800, y: 330 },
  { id: "depth", label: "Depth", x: 1020, y: 410 },

  { id: "pmSampler", label: "PM Sampler", x: 1020, y: 110 },
  { id: "pmClosedLoop", label: "PM ClosedLoop", x: 800, y: 70 },
  { id: "pmColorLoop", label: "PM ColorLoop", x: 800, y: 130 },
  { id: "coupling", label: "3D Coupling", x: 580, y: 110 },

  { id: "projectm", label: "ProjectM/Blend", x: 1250, y: 90 },
  { id: "liquid", label: "LiquidMetal", x: 1250, y: 180 },
  { id: "basic", label: "Basic", x: 1250, y: 270 },
  { id: "video", label: "Video", x: 1250, y: 360 },
];

const EDGES: EdgeDef[] = [
  {
    id: "ui->visualState",
    from: "ui",
    to: "visualState",
    label: "patch",
    kind: "state",
  },
  {
    id: "visualState->macro",
    from: "visualState",
    to: "macro",
    label: "base",
    kind: "state",
  },

  { id: "audio->beat", from: "audio", to: "beat", label: "PCM", kind: "audio" },
  {
    id: "audio->audioControls",
    from: "audio",
    to: "audioControls",
    label: "E/bands",
    kind: "audio",
  },
  {
    id: "beat->audioControls",
    from: "beat",
    to: "audioControls",
    label: "beatPulse",
    kind: "audio",
  },
  {
    id: "beat->aivj",
    from: "beat",
    to: "aivj",
    label: "BPM/conf",
    kind: "audio",
  },

  {
    id: "audioControls->macro",
    from: "audioControls",
    to: "macro",
    label: "mixToMacros",
    kind: "audio",
  },
  { id: "aivj->macro", from: "aivj", to: "macro", label: "bank", kind: "ai" },
  {
    id: "macro->macroMapper",
    from: "macro",
    to: "macroMapper",
    label: "widen/map",
    kind: "state",
  },

  {
    id: "macroMapper->projectm",
    from: "macroMapper",
    to: "projectm",
    label: "opacity/energyToOpacity",
    kind: "state",
  },
  {
    id: "macroMapper->liquid",
    from: "macroMapper",
    to: "liquid",
    label: "LM params",
    kind: "state",
  },
  {
    id: "macroMapper->basic",
    from: "macroMapper",
    to: "basic",
    label: "opacity",
    kind: "state",
  },
  {
    id: "macroMapper->camera",
    from: "macroMapper",
    to: "camera",
    label: "opacity",
    kind: "state",
  },
  {
    id: "macroMapper->video",
    from: "macroMapper",
    to: "video",
    label: "opacity",
    kind: "state",
  },
  {
    id: "macroMapper->depth",
    from: "macroMapper",
    to: "depth",
    label: "opacity",
    kind: "state",
  },

  {
    id: "overlay->camera",
    from: "overlay",
    to: "camera",
    label: "mul",
    kind: "overlay",
  },
  {
    id: "overlay->projectm",
    from: "overlay",
    to: "projectm",
    label: "mul",
    kind: "overlay",
  },
  {
    id: "overlay->video",
    from: "overlay",
    to: "video",
    label: "mul",
    kind: "overlay",
  },
  {
    id: "overlay->depth",
    from: "overlay",
    to: "depth",
    label: "mul",
    kind: "overlay",
  },
  {
    id: "overlay->basic",
    from: "overlay",
    to: "basic",
    label: "mul",
    kind: "overlay",
  },

  {
    id: "camera->cameraSeg",
    from: "camera",
    to: "cameraSeg",
    label: "seg",
    kind: "spatial",
  },
  {
    id: "cameraSeg->coupling",
    from: "cameraSeg",
    to: "coupling",
    label: "edge/area",
    kind: "spatial",
  },
  {
    id: "depth->coupling",
    from: "depth",
    to: "coupling",
    label: "fresh",
    kind: "spatial",
  },

  {
    id: "projectm->pmSampler",
    from: "projectm",
    to: "pmSampler",
    label: "avgLuma/avgColor",
    kind: "feedback",
  },
  {
    id: "pmSampler->pmClosedLoop",
    from: "pmSampler",
    to: "pmClosedLoop",
    label: "luma",
    kind: "feedback",
  },
  {
    id: "pmSampler->pmColorLoop",
    from: "pmSampler",
    to: "pmColorLoop",
    label: "rgb",
    kind: "feedback",
  },
  {
    id: "pmClosedLoop->coupling",
    from: "pmClosedLoop",
    to: "coupling",
    label: "PI bias",
    kind: "feedback",
  },
  {
    id: "coupling->projectm",
    from: "coupling",
    to: "projectm",
    label: "externalOpacity",
    kind: "spatial",
  },
  {
    id: "pmColorLoop->liquid",
    from: "pmColorLoop",
    to: "liquid",
    label: "tint/contrast",
    kind: "feedback",
  },
];

type TraceFilterState = {
  scopePrefix: string;
  writerQuery: string;
  minDelta: number;
};

const DEFAULT_TRACE_FILTERS: TraceFilterState = {
  scopePrefix: "",
  writerQuery: "",
  minDelta: 0,
};

const EXPANDABLE_PREFIX_BY_NODE: Partial<Record<BaseNodeId, string>> = {
  macroMapper: "",
  projectm: "projectm.",
  liquid: "liquid.",
  overlay: "overlayBudget.",
  camera: "camera.",
  depth: "depth.",
  pmClosedLoop: "projectm.externalOpacityDrive",
  pmColorLoop: "liquid.runtimeColorTuning",
};

const FILTERABLE_NODES = new Set<BaseNodeId>([
  "macroMapper",
  "projectm",
  "liquid",
  "overlay",
  "coupling",
  "pmSampler",
  "pmClosedLoop",
  "pmColorLoop",
  "camera",
  "cameraSeg",
  "depth",
  "video",
  "basic",
]);

function isBaseNodeId(id: NodeId): id is BaseNodeId {
  return !isParamNodeId(id);
}

function isFiltersActive(f: TraceFilterState) {
  return Boolean(
    (f.scopePrefix ?? "").trim() ||
      (f.writerQuery ?? "").trim() ||
      Math.max(0, Number(f.minDelta ?? 0)) > 0
  );
}

function eventMatchesNode(node: BaseNodeId, ev: DecisionTraceEvent) {
  const writer = String(ev.writer ?? "");
  const target = String(ev.target ?? "");
  switch (node) {
    case "control":
      return writer === "controlPlane" || target.startsWith("controlPlane.");
    case "macroMapper":
      return writer === "macroMapper";
    case "projectm":
      return target.startsWith("projectm.");
    case "liquid":
      return target.startsWith("liquid.");
    case "overlay":
      return target.startsWith("overlayBudget.");
    case "pmClosedLoop":
      return (
        writer === "closedLoopPi" ||
        target.startsWith("projectm.closedLoopPi") ||
        target.startsWith("projectm.externalOpacityDrive")
      );
    case "pmColorLoop":
      return (
        writer === "colorLoop" || target.startsWith("liquid.runtimeColorTuning")
      );
    case "coupling":
      return (
        writer === "coupling" ||
        target.startsWith("projectm.externalOpacityDrive")
      );
    case "camera":
      return target.startsWith("camera.");
    case "depth":
      return target.startsWith("depth.");
    case "pmSampler":
      // Sampler is a feedback module; only light it up if any related feedback decision is present.
      return target.startsWith("projectm.") && target.includes("verify");
    default:
      return false;
  }
}

function isParamNodeId(id: NodeId): id is ParamNodeId {
  return typeof id === "string" && id.startsWith("param:");
}

function parseParamNodeId(
  id: NodeId
): { parent: BaseNodeId; target: string } | null {
  if (!isParamNodeId(id)) return null;
  const rest = id.slice("param:".length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const parent = rest.slice(0, sep) as BaseNodeId;
  const target = rest.slice(sep + 1);
  if (!target) return null;
  return { parent, target };
}

export class DecisionTopologyOverlay {
  private root: HTMLDivElement;
  private globalToggle: HTMLButtonElement;
  private header: HTMLDivElement;
  private content: HTMLDivElement;
  private body: HTMLDivElement;
  private svg: SVGSVGElement;
  private details: HTMLDivElement;
  private subtitle: HTMLDivElement;
  private zoomInput: HTMLInputElement;
  private collapseButton: HTMLButtonElement;
  private hideButton: HTMLButtonElement;
  private resizeHandle: HTMLDivElement;

  private storage: Storage | null;
  private state: OverlayUiState;
  private snapshot: DecisionTopologySnapshot | null = null;
  private prevSnapshot: DecisionTopologySnapshot | null = null;
  private selectedNode: NodeId | null = null;

  private traceFilters: TraceFilterState = { ...DEFAULT_TRACE_FILTERS };
  private expandedNodes = new Set<BaseNodeId>();

  private graphNodes: NodeDef[] = NODES;
  private graphEdges: EdgeDef[] = EDGES;

  private nodeValueEls = new Map<NodeId, SVGTextElement>();
  private nodeHotEls = new Map<NodeId, SVGRectElement>();
  private nodeHotness = new Map<NodeId, number>();
  private edgePathEls = new Map<EdgeId, SVGPathElement>();
  private edgeLabelEls = new Map<EdgeId, SVGTextElement>();

  constructor(container: HTMLElement, opts?: { storage?: Storage | null }) {
    this.storage = opts?.storage ?? null;
    this.state = safeReadState(this.storage) ?? {
      x: 12,
      y: 12,
      w: 920,
      h: 520,
      zoom: 1.15,
      collapsed: false,
      hidden: false,
    };

    this.root = document.createElement("div");
    this.root.id = "decision-topology-overlay";
    this.root.className = "nw-topology";

    this.globalToggle = document.createElement("button");
    this.globalToggle.type = "button";
    this.globalToggle.className = "nw-topologyToggle";
    this.globalToggle.title = "Toggle AIVJ Topology (Show/Hide)";
    this.globalToggle.addEventListener("click", () => {
      this.state.hidden = !this.state.hidden;
      if (!this.state.hidden) this.state.collapsed = false;
      this.applyUiState();
    });
    container.appendChild(this.globalToggle);

    this.header = document.createElement("div");
    this.header.className = "nw-topology__header";

    const title = document.createElement("div");
    title.className = "nw-topology__title";
    title.textContent = "AIVJ Topology";

    this.subtitle = document.createElement("div");
    this.subtitle.className = "nw-topology__subtitle";
    this.subtitle.textContent = "LIVE | E -- | Tempo -- | AI --";

    const titleWrap = document.createElement("div");
    titleWrap.className = "nw-topology__titleWrap";
    titleWrap.appendChild(title);
    titleWrap.appendChild(this.subtitle);

    const controls = document.createElement("div");
    controls.className = "nw-topology__controls";

    const zoomLabel = document.createElement("span");
    zoomLabel.className = "nw-topology__label";
    zoomLabel.textContent = "Zoom";

    this.zoomInput = document.createElement("input");
    this.zoomInput.type = "range";
    this.zoomInput.min = "0.6";
    this.zoomInput.max = "1.8";
    this.zoomInput.step = "0.05";
    this.zoomInput.value = String(this.state.zoom);
    this.zoomInput.className = "nw-topology__zoom";

    this.collapseButton = document.createElement("button");
    this.collapseButton.className = "nw-topology__btn";
    this.collapseButton.type = "button";

    this.hideButton = document.createElement("button");
    this.hideButton.className = "nw-topology__btn";
    this.hideButton.type = "button";

    controls.appendChild(zoomLabel);
    controls.appendChild(this.zoomInput);
    controls.appendChild(this.collapseButton);
    controls.appendChild(this.hideButton);

    this.header.appendChild(titleWrap);
    this.header.appendChild(controls);

    this.body = document.createElement("div");
    this.body.className = "nw-topology__body";

    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("viewBox", "0 0 1400 460");
    this.svg.classList.add("nw-topology__svg");
    this.body.appendChild(this.svg);

    this.details = document.createElement("div");
    this.details.className = "nw-topology__details";

    this.content = document.createElement("div");
    this.content.className = "nw-topology__content";
    this.content.appendChild(this.body);
    this.content.appendChild(this.details);

    this.resizeHandle = document.createElement("div");
    this.resizeHandle.className = "nw-topology__resize";

    this.root.appendChild(this.header);
    this.root.appendChild(this.content);
    this.root.appendChild(this.resizeHandle);
    container.appendChild(this.root);

    this.rebuildGraphAndSvg();
    this.applyUiState();
    this.bindUi();
    this.renderDetails();
  }

  private getRecentTrace(snap: DecisionTopologySnapshot | null) {
    return Array.isArray(snap?.decisionTrace?.recent)
      ? snap!.decisionTrace!.recent
      : [];
  }

  private filterTrace(
    events: DecisionTraceEvent[],
    opts?: { targetPrefix?: string }
  ) {
    const prefix = (opts?.targetPrefix ?? "").trim();
    const scopePrefix = (this.traceFilters.scopePrefix ?? "").trim();
    const writerQuery = (this.traceFilters.writerQuery ?? "").trim();
    const minDelta = Math.max(0, Number(this.traceFilters.minDelta ?? 0));

    const writerNeedle = writerQuery ? writerQuery.toLowerCase() : "";

    return events.filter((ev) => {
      const target = String(ev.target ?? "");
      const writer = String(ev.writer ?? "");
      if (prefix && !target.startsWith(prefix)) return false;
      if (scopePrefix && !target.startsWith(scopePrefix)) return false;
      if (writerNeedle && !writer.toLowerCase().includes(writerNeedle)) {
        return false;
      }
      if (minDelta > 0) {
        const d = Number(ev.delta);
        if (!Number.isFinite(d) || d < minDelta) return false;
      }
      return true;
    });
  }

  private rebuildGraphAndSvg() {
    const snap = this.snapshot;
    const baseNodes = NODES;
    const baseEdges = EDGES;
    if (!this.expandedNodes.size || !snap) {
      this.graphNodes = baseNodes;
      this.graphEdges = baseEdges;
      this.buildSvg();
      this.renderDetails();
      return;
    }

    const nodes: NodeDef[] = [...baseNodes];
    const edges: EdgeDef[] = [...baseEdges];

    const basePos = new Map<BaseNodeId, { x: number; y: number }>();
    for (const n of baseNodes)
      basePos.set(n.id as BaseNodeId, { x: n.x, y: n.y });

    const trace = this.filterTrace(this.getRecentTrace(snap));

    const mkParamNode = (parent: BaseNodeId, target: string) => {
      const id = `param:${parent}:${target}` as ParamNodeId;
      const parentPrefix = EXPANDABLE_PREFIX_BY_NODE[parent] ?? "";
      const label =
        parentPrefix && target.startsWith(parentPrefix)
          ? target.slice(parentPrefix.length)
          : target;
      return { id, label };
    };

    for (const parent of this.expandedNodes) {
      const prefix = EXPANDABLE_PREFIX_BY_NODE[parent];
      if (prefix == null) continue;
      const parentP = basePos.get(parent);
      if (!parentP) continue;

      const filtered = prefix
        ? trace.filter((e) => String(e.target ?? "").startsWith(prefix))
        : trace;
      if (!filtered.length) continue;

      type Agg = { target: string; weightSum: number; count: number };
      const byTarget = new Map<string, Agg>();
      for (const ev of filtered) {
        const target = String(ev.target ?? "");
        if (!target) continue;
        const weightRaw = Number(ev.weight01);
        const weight = Number.isFinite(weightRaw) ? weightRaw : 1;
        const agg = byTarget.get(target) ?? { target, weightSum: 0, count: 0 };
        agg.weightSum += weight;
        agg.count += 1;
        byTarget.set(target, agg);
      }

      const topTargets = Array.from(byTarget.values())
        .sort((a, b) =>
          b.weightSum !== a.weightSum
            ? b.weightSum - a.weightSum
            : b.count - a.count
        )
        .slice(0, 5);
      if (!topTargets.length) continue;

      const x = parentP.x + 230;
      const y0 = parentP.y - (topTargets.length - 1) * 35;
      for (let i = 0; i < topTargets.length; i++) {
        const t = topTargets[i];
        const pn = mkParamNode(parent, t.target);
        nodes.push({
          id: pn.id,
          label: pn.label,
          x,
          y: y0 + i * 70,
        });
        edges.push({
          id: `dyn:${parent}->${pn.id}`,
          from: parent,
          to: pn.id,
          label: `w=${t.weightSum.toFixed(2)}`,
          kind: "state",
        });
      }
    }

    this.graphNodes = nodes;
    this.graphEdges = edges;
    this.buildSvg();
    this.renderDetails();
  }

  private buildSvg() {
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this.nodeValueEls.clear();
    this.nodeHotEls.clear();
    this.nodeHotness.clear();

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <filter id="nw-topology-node-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.55)"/>
      </filter>
      <filter id="nw-topology-node-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="rgba(110,170,255,0.55)"/>
      </filter>
      <marker id="nw-topology-arrow" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"></path>
      </marker>
    `;
    svg.appendChild(defs);

    const edgesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    edgesG.setAttribute("class", "nw-topology__edges");
    svg.appendChild(edgesG);

    for (const e of this.graphEdges) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute(
        "class",
        `nw-topology__edge nw-topology__edge--${e.kind}`
      );
      path.setAttribute("data-edge", e.id);
      path.setAttribute("data-from", e.from);
      path.setAttribute("data-to", e.to);
      path.setAttribute("marker-end", "url(#nw-topology-arrow)");
      edgesG.appendChild(path);
      this.edgePathEls.set(e.id, path);

      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      label.setAttribute(
        "class",
        `nw-topology__edgeLabel nw-topology__edgeLabel--${e.kind}`
      );
      label.setAttribute("data-edge-label", e.id);
      label.setAttribute("data-from", e.from);
      label.setAttribute("data-to", e.to);
      label.textContent = e.label;
      edgesG.appendChild(label);
      this.edgeLabelEls.set(e.id, label);
    }

    const nodesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodesG.setAttribute("class", "nw-topology__nodes");
    svg.appendChild(nodesG);

    for (const n of this.graphNodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "nw-topology__node");
      g.setAttribute("data-node", n.id);
      g.setAttribute("transform", `translate(${n.x}, ${n.y})`);

      const hot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      hot.setAttribute("x", "-77");
      hot.setAttribute("y", "-28");
      hot.setAttribute("rx", "12");
      hot.setAttribute("ry", "12");
      hot.setAttribute("width", "154");
      hot.setAttribute("height", "60");
      hot.setAttribute("class", "nw-topology__nodeHot");
      hot.setAttribute("filter", "url(#nw-topology-node-glow)");
      hot.style.opacity = "0";
      this.nodeHotEls.set(n.id, hot);

      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("x", "-75");
      rect.setAttribute("y", "-26");
      rect.setAttribute("rx", "10");
      rect.setAttribute("ry", "10");
      rect.setAttribute("width", "150");
      rect.setAttribute("height", "56");
      rect.setAttribute("class", "nw-topology__nodeRect");
      rect.setAttribute("filter", "url(#nw-topology-node-shadow)");

      const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t1.setAttribute("class", "nw-topology__nodeTitle");
      t1.setAttribute("text-anchor", "middle");
      t1.setAttribute("x", "0");
      t1.setAttribute("y", "-6");
      t1.textContent = n.label;

      const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("class", "nw-topology__nodeValue");
      t2.setAttribute("text-anchor", "middle");
      t2.setAttribute("x", "0");
      t2.setAttribute("y", "14");
      t2.textContent = "--";
      this.nodeValueEls.set(n.id, t2);

      g.appendChild(hot);
      g.appendChild(rect);
      g.appendChild(t1);
      g.appendChild(t2);
      nodesG.appendChild(g);
    }

    this.layoutEdges();
  }

  private layoutEdges() {
    const pos = new Map<NodeId, { x: number; y: number }>();
    for (const n of this.graphNodes) pos.set(n.id, { x: n.x, y: n.y });

    const pathFor = (from: NodeId, to: NodeId) => {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return "M0 0 L0 0";
      const leftToRight = a.x <= b.x;
      const x1 = a.x + (leftToRight ? 75 : -75);
      const y1 = a.y;
      const x2 = b.x + (leftToRight ? -75 : 75);
      const y2 = b.y;
      const dx = Math.max(40, Math.min(220, Math.abs(x2 - x1) * 0.5));
      const c1x = x1 + (leftToRight ? dx : -dx);
      const c1y = y1;
      const c2x = x2 + (leftToRight ? -dx : dx);
      const c2y = y2;
      return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    };

    const labelPos = (from: NodeId, to: NodeId) => {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return { x: 0, y: 0 };
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 10 };
    };

    for (const e of this.graphEdges) {
      const path = this.edgePathEls.get(e.id);
      if (path) path.setAttribute("d", pathFor(e.from, e.to));
      const label = this.edgeLabelEls.get(e.id);
      const lp = labelPos(e.from, e.to);
      if (label) {
        label.setAttribute("x", String(lp.x));
        label.setAttribute("y", String(lp.y));
      }
    }
  }

  private applyUiState() {
    const s = this.state;
    this.root.style.left = `${Math.round(s.x)}px`;
    this.root.style.top = `${Math.round(s.y)}px`;
    this.root.style.width = `${Math.round(s.w)}px`;
    this.root.style.height = `${Math.round(s.h)}px`;
    this.root.style.display = s.hidden ? "none" : "block";

    this.body.style.display = s.collapsed ? "none" : "block";
    this.details.style.display = s.collapsed ? "none" : "block";
    this.collapseButton.textContent = s.collapsed ? "Expand" : "Collapse";
    this.hideButton.textContent = s.hidden ? "Show" : "Hide";

    try {
      this.globalToggle.textContent = s.hidden
        ? "Topology: OFF"
        : "Topology: ON";
      this.globalToggle.dataset.state = s.hidden ? "off" : "on";
      this.globalToggle.setAttribute("aria-pressed", String(!s.hidden));
    } catch {
      // ignore
    }

    const zoom = clamp(Number(s.zoom), 0.6, 1.8);
    this.zoomInput.value = String(zoom);
    this.svg.style.transform = `scale(${zoom})`;
    this.svg.style.transformOrigin = "0 0";

    safeWriteState(this.storage, this.state);
  }

  private bindUi() {
    const onPointerDrag = () => {
      let startX = 0;
      let startY = 0;
      let baseX = 0;
      let baseY = 0;

      const onDown = (ev: PointerEvent) => {
        if ((ev.target as HTMLElement | null)?.closest(".nw-topology__btn"))
          return;
        if ((ev.target as HTMLElement | null)?.closest(".nw-topology__zoom"))
          return;
        startX = ev.clientX;
        startY = ev.clientY;
        baseX = this.state.x;
        baseY = this.state.y;
        this.header.setPointerCapture(ev.pointerId);
      };

      const onMove = (ev: PointerEvent) => {
        if (!this.header.hasPointerCapture(ev.pointerId)) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        this.state.x = clamp(baseX + dx, 0, window.innerWidth - 80);
        this.state.y = clamp(baseY + dy, 0, window.innerHeight - 40);
        this.applyUiState();
      };

      const onUp = (ev: PointerEvent) => {
        if (!this.header.hasPointerCapture(ev.pointerId)) return;
        try {
          this.header.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      };

      this.header.addEventListener("pointerdown", onDown);
      this.header.addEventListener("pointermove", onMove);
      this.header.addEventListener("pointerup", onUp);

      return () => {
        this.header.removeEventListener("pointerdown", onDown);
        this.header.removeEventListener("pointermove", onMove);
        this.header.removeEventListener("pointerup", onUp);
      };
    };

    const onPointerResize = () => {
      let startX = 0;
      let startY = 0;
      let baseW = 0;
      let baseH = 0;

      const onDown = (ev: PointerEvent) => {
        startX = ev.clientX;
        startY = ev.clientY;
        baseW = this.state.w;
        baseH = this.state.h;
        this.resizeHandle.setPointerCapture(ev.pointerId);
      };

      const onMove = (ev: PointerEvent) => {
        if (!this.resizeHandle.hasPointerCapture(ev.pointerId)) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        this.state.w = clamp(baseW + dx, 260, 1600);
        this.state.h = clamp(baseH + dy, 140, 1200);
        this.applyUiState();
      };

      const onUp = (ev: PointerEvent) => {
        if (!this.resizeHandle.hasPointerCapture(ev.pointerId)) return;
        try {
          this.resizeHandle.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
      };

      this.resizeHandle.addEventListener("pointerdown", onDown);
      this.resizeHandle.addEventListener("pointermove", onMove);
      this.resizeHandle.addEventListener("pointerup", onUp);

      return () => {
        this.resizeHandle.removeEventListener("pointerdown", onDown);
        this.resizeHandle.removeEventListener("pointermove", onMove);
        this.resizeHandle.removeEventListener("pointerup", onUp);
      };
    };

    const offDrag = onPointerDrag();
    const offResize = onPointerResize();

    this.zoomInput.addEventListener("input", () => {
      this.state.zoom = clamp(Number(this.zoomInput.value), 0.6, 1.8);
      this.applyUiState();
    });

    this.collapseButton.addEventListener("click", () => {
      this.state.collapsed = !this.state.collapsed;
      this.applyUiState();
    });

    this.hideButton.addEventListener("click", () => {
      this.state.hidden = !this.state.hidden;
      this.applyUiState();
    });

    const onNodeClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const g = target?.closest?.("[data-node]") as HTMLElement | null;
      const id = (g?.getAttribute?.("data-node") ?? "") as NodeId;
      if (!id) return;
      if (this.selectedNode === id) {
        this.selectedNode = null;
      } else {
        this.selectedNode = id;
      }
      this.renderDetails();
    };
    this.svg.addEventListener("click", onNodeClick);

    const onKey = (ev: KeyboardEvent) => {
      if (!ev.ctrlKey || !ev.shiftKey) return;
      if (ev.code !== "KeyT") return;
      ev.preventDefault();
      this.state.hidden = false;
      this.state.collapsed = !this.state.collapsed;
      this.applyUiState();
    };
    window.addEventListener("keydown", onKey);

    this.disposeFn = () => {
      offDrag?.();
      offResize?.();
      this.svg.removeEventListener("click", onNodeClick);
      window.removeEventListener("keydown", onKey);
    };
  }

  private disposeFn: (() => void) | null = null;

  private renderDetails() {
    const snap = this.snapshot;
    const selected = this.selectedNode;

    // Highlight selection.
    try {
      const nodes = this.svg.querySelectorAll<SVGGElement>("[data-node]");
      nodes.forEach((el) => {
        const id = (el.getAttribute("data-node") ?? "") as NodeId;
        const isSelected = Boolean(selected && id === selected);
        el.classList.toggle("is-selected", isSelected);
        el.classList.toggle("is-dim", Boolean(selected && !isSelected));
      });
    } catch {
      // ignore
    }

    try {
      const paths = this.svg.querySelectorAll<SVGPathElement>("[data-edge]");
      paths.forEach((el) => {
        const from = (el.getAttribute("data-from") ?? "") as NodeId;
        const to = (el.getAttribute("data-to") ?? "") as NodeId;
        const connected = Boolean(
          selected && (from === selected || to === selected)
        );
        el.classList.toggle("is-connected", connected);
        el.classList.toggle("is-dim", Boolean(selected && !connected));
      });
      const labels =
        this.svg.querySelectorAll<SVGTextElement>("[data-edge-label]");
      labels.forEach((el) => {
        const from = (el.getAttribute("data-from") ?? "") as NodeId;
        const to = (el.getAttribute("data-to") ?? "") as NodeId;
        const connected = Boolean(
          selected && (from === selected || to === selected)
        );
        el.classList.toggle("is-connected", connected);
        el.classList.toggle("is-dim", Boolean(selected && !connected));
      });
    } catch {
      // ignore
    }

    this.details.replaceChildren();

    const panel = document.createElement("div");
    panel.className = "nw-topology__detailsInner";

    const header = document.createElement("div");
    header.className = "nw-topology__detailsHeader";

    const title = document.createElement("div");
    title.className = "nw-topology__detailsTitle";
    title.textContent = selected ? `Inspect: ${selected}` : "Inspect";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "nw-topology__detailsClose";
    close.textContent = selected ? "Clear" : "Pick";
    close.addEventListener("click", () => {
      this.selectedNode = null;
      this.renderDetails();
    });

    header.appendChild(title);
    header.appendChild(close);
    panel.appendChild(header);

    const content = document.createElement("div");
    content.className = "nw-topology__detailsBody";

    const addLine = (k: string, v: string) => {
      const row = document.createElement("div");
      row.className = "nw-topology__detailsRow";
      const kk = document.createElement("div");
      kk.className = "nw-topology__detailsKey";
      kk.textContent = k;
      const vv = document.createElement("div");
      vv.className = "nw-topology__detailsVal";
      vv.textContent = v;
      row.appendChild(kk);
      row.appendChild(vv);
      content.appendChild(row);
    };

    const addControl = (k: string, el: HTMLElement) => {
      const row = document.createElement("div");
      row.className = "nw-topology__detailsRow";
      const kk = document.createElement("div");
      kk.className = "nw-topology__detailsKey";
      kk.textContent = k;
      const vv = document.createElement("div");
      vv.className = "nw-topology__detailsVal";
      vv.appendChild(el);
      row.appendChild(kk);
      row.appendChild(vv);
      content.appendChild(row);
    };

    const addHr = () => {
      const hr = document.createElement("div");
      hr.className = "nw-topology__detailsHr";
      content.appendChild(hr);
    };

    if (snap) {
      const scope = document.createElement("input");
      scope.type = "text";
      scope.value = this.traceFilters.scopePrefix;
      scope.placeholder = "scope prefix (e.g. projectm.)";
      scope.addEventListener("input", () => {
        this.traceFilters.scopePrefix = scope.value;
        if (this.expandedNodes.size) this.rebuildGraphAndSvg();
        else this.renderDetails();
      });
      addControl("filter.scope", scope);

      const writer = document.createElement("input");
      writer.type = "text";
      writer.value = this.traceFilters.writerQuery;
      writer.placeholder = "writer contains (e.g. macroMapper)";
      writer.addEventListener("input", () => {
        this.traceFilters.writerQuery = writer.value;
        if (this.expandedNodes.size) this.rebuildGraphAndSvg();
        else this.renderDetails();
      });
      addControl("filter.writer", writer);

      const delta = document.createElement("input");
      delta.type = "number";
      delta.step = "0.01";
      delta.min = "0";
      delta.value = String(this.traceFilters.minDelta);
      delta.placeholder = "0";
      delta.addEventListener("input", () => {
        this.traceFilters.minDelta = Number(delta.value);
        if (this.expandedNodes.size) this.rebuildGraphAndSvg();
        else this.renderDetails();
      });
      addControl("filter.minDelta", delta);

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "nw-topology__detailsClose";
      clear.textContent = "Clear filters";
      clear.addEventListener("click", () => {
        this.traceFilters = { ...DEFAULT_TRACE_FILTERS };
        scope.value = this.traceFilters.scopePrefix;
        writer.value = this.traceFilters.writerQuery;
        delta.value = String(this.traceFilters.minDelta);
        if (this.expandedNodes.size) this.rebuildGraphAndSvg();
        else this.renderDetails();
      });
      addControl("filter", clear);
      addHr();
    }

    if (!snap) {
      addLine("status", "waiting for snapshot...");
    } else if (!selected) {
      const bank = snap.aivj.runtimeBank ?? snap.aivj.baseBank;
      addLine("hint", "Click a node to inspect");
      addLine(
        "now",
        `${snap.audio.playing ? "LIVE" : "PAUSED"} | E ${pct(
          snap.audioFrame.energy01
        )} | Tempo ${fmtBpm(snap.audioFrame.tempoBpm)} | AI ${
          snap.aivj.enabled ? "ON" : "OFF"
        }`
      );
      addLine(
        "macros",
        `F${pct(bank.macros.fusion)} M${pct(bank.macros.motion)} S${pct(
          bank.macros.sparkle
        )} | hold ${fmtMs(snap.aivj.manualHoldMs)}`
      );
      addLine(
        "overlay",
        `scale ${pct(snap.overlay.scale01)} | mean ${pct(
          snap.overlay.meanOverlayMul01
        )} | pm ${pct(snap.overlay.pmTarget01)}`
      );
      addLine("toggle", "Ctrl+Shift+T");

      const prev = this.prevSnapshot;
      if (prev) {
        const prevBank = prev.aivj.runtimeBank ?? prev.aivj.baseBank;
        const dFusion = bank.macros.fusion - prevBank.macros.fusion;
        const dMotion = bank.macros.motion - prevBank.macros.motion;
        const dSparkle = bank.macros.sparkle - prevBank.macros.sparkle;
        const dScale = snap.overlay.scale01 - prev.overlay.scale01;
        const dMean =
          snap.overlay.meanOverlayMul01 - prev.overlay.meanOverlayMul01;
        const dDrive =
          Number(snap.runtime?.spatial?.externalOpacityDriveSigned ?? 0) -
          Number(prev.runtime?.spatial?.externalOpacityDriveSigned ?? 0);

        const candidates: Array<{
          k: string;
          d: number;
          fmt: (d: number) => string;
        }> = [
          { k: "dMacro.fusion", d: dFusion, fmt: fmtSignedPct },
          { k: "dMacro.motion", d: dMotion, fmt: fmtSignedPct },
          { k: "dMacro.sparkle", d: dSparkle, fmt: fmtSignedPct },
          { k: "dOverlay.scale", d: dScale, fmt: fmtSignedPct },
          { k: "dOverlay.mean", d: dMean, fmt: fmtSignedPct },
          {
            k: "dSpatial.drive",
            d: dDrive,
            fmt: (d) => (d >= 0 ? `+${d.toFixed(2)}` : d.toFixed(2)),
          },
        ];

        const deltas = candidates
          .map((x) => ({ ...x, abs: Math.abs(x.d) }))
          .filter((x) => x.abs > 0.03)
          .sort((a, b) => b.abs - a.abs)
          .slice(0, 6);

        if (deltas.length) {
          addHr();
          addLine("recent", "deltas");
          for (const d of deltas) addLine(d.k, d.fmt(d.d));
        }
      }

      const recent = this.filterTrace(this.getRecentTrace(snap));
      if (recent.length) {
        addHr();
        addLine(
          "trace",
          `recent (${Math.min(6, recent.length)}/${recent.length})`
        );
        const n = Math.min(6, recent.length);
        for (let i = 0; i < n; i++) {
          const ev = recent[i];
          const ageMs = Math.max(0, snap.nowMs - Number(ev.tMs ?? snap.nowMs));
          const value = (ev.value ?? "").trim();
          const delta = Number(ev.delta);
          const deltaText = Number.isFinite(delta)
            ? ` | d=${delta.toFixed(3)}`
            : "";
          const reason = (ev.reason ?? "").trim();
          const extra = reason ? ` | ${reason}` : "";
          addLine(
            `t-${i + 1}`,
            `${fmtMs(ageMs)} ago | ${String(ev.writer)} | ${String(ev.target)}${
              value ? `=${value}` : ""
            }${deltaText}${extra}`
          );
        }
      }
    } else {
      const prev = this.prevSnapshot;

      const fmtWeight = (w: number) => {
        const n = Number(w);
        if (!Number.isFinite(n)) return "--";
        return n.toFixed(2);
      };

      const addContrib = (targetPrefix: string, label: string) => {
        const recent = this.filterTrace(this.getRecentTrace(snap));
        const filtered = this.filterTrace(recent, { targetPrefix });
        if (!filtered.length) return;

        type Agg = {
          key: string;
          count: number;
          weightSum: number;
          lastMs: number;
          lastWriter: string;
          lastValue: string;
          numericCount: number;
          min: number;
          max: number;
        };

        const byTarget = new Map<string, Agg>();
        const byWriter = new Map<string, Agg>();

        const upsert = (
          map: Map<string, Agg>,
          key: string,
          ev: DecisionTraceEvent,
          weight: number
        ) => {
          const tMs = Number(ev.tMs);
          const writer = String(ev.writer ?? "");
          const value = String(ev.value ?? "");
          const numeric = Number.parseFloat(String(ev.value ?? ""));

          let agg = map.get(key);
          if (!agg) {
            agg = {
              key,
              count: 0,
              weightSum: 0,
              lastMs: -Infinity,
              lastWriter: "",
              lastValue: "",
              numericCount: 0,
              min: Number.POSITIVE_INFINITY,
              max: Number.NEGATIVE_INFINITY,
            };
            map.set(key, agg);
          }

          agg.count += 1;
          agg.weightSum += weight;

          if (Number.isFinite(tMs) && tMs >= agg.lastMs) {
            agg.lastMs = tMs;
            agg.lastWriter = writer;
            agg.lastValue = value;
          }

          if (Number.isFinite(numeric)) {
            agg.numericCount += 1;
            agg.min = Math.min(agg.min, numeric);
            agg.max = Math.max(agg.max, numeric);
          }
        };

        for (const ev of filtered) {
          const target = String(ev.target ?? "");
          const writer = String(ev.writer ?? "");
          const weightRaw = Number(ev.weight01);
          const weight = Number.isFinite(weightRaw) ? weightRaw : 1;
          if (target) upsert(byTarget, target, ev, weight);
          if (writer) upsert(byWriter, writer, ev, weight);
        }

        const sortAgg = (a: Agg, b: Agg) => {
          if (b.weightSum !== a.weightSum) return b.weightSum - a.weightSum;
          if (b.count !== a.count) return b.count - a.count;
          return b.lastMs - a.lastMs;
        };

        const topTargets = Array.from(byTarget.values())
          .sort(sortAgg)
          .slice(0, 6);
        const topWriters = Array.from(byWriter.values())
          .sort(sortAgg)
          .slice(0, 6);

        addHr();
        addLine("contrib", label);

        addLine(
          "top.targets",
          `${topTargets.length}/${byTarget.size} (by weightSum)`
        );
        for (let i = 0; i < topTargets.length; i++) {
          const a = topTargets[i];
          const ageMs = Math.max(
            0,
            snap.nowMs - Number(a.lastMs ?? snap.nowMs)
          );
          const range =
            a.numericCount >= 2 &&
            Number.isFinite(a.min) &&
            Number.isFinite(a.max)
              ? ` | range ${a.min.toFixed(3)}..${a.max.toFixed(3)}`
              : "";
          addLine(
            `t${i + 1}`,
            `${a.key} | w=${fmtWeight(a.weightSum)} c=${a.count} | last ${fmtMs(
              ageMs
            )} ago | ${a.lastWriter}${
              a.lastValue ? `=${a.lastValue}` : ""
            }${range}`
          );
        }

        addLine(
          "top.writers",
          `${topWriters.length}/${byWriter.size} (by weightSum)`
        );
        for (let i = 0; i < topWriters.length; i++) {
          const a = topWriters[i];
          const ageMs = Math.max(
            0,
            snap.nowMs - Number(a.lastMs ?? snap.nowMs)
          );
          addLine(
            `w${i + 1}`,
            `${a.key} | w=${fmtWeight(a.weightSum)} c=${a.count} | last ${fmtMs(
              ageMs
            )} ago | ${a.lastValue ? a.lastValue : "--"}`
          );
        }
      };

      const addTrace = (targetPrefix: string, label: string) => {
        const recent = this.filterTrace(this.getRecentTrace(snap));
        const filtered = this.filterTrace(recent, { targetPrefix });
        if (!filtered.length) return;
        addHr();
        addLine("trace", label);
        const n = Math.min(8, filtered.length);
        for (let i = 0; i < n; i++) {
          const ev = filtered[i];
          const ageMs = Math.max(0, snap.nowMs - Number(ev.tMs ?? snap.nowMs));
          const value = (ev.value ?? "").trim();
          const delta = Number(ev.delta);
          const deltaText = Number.isFinite(delta)
            ? ` | d=${delta.toFixed(3)}`
            : "";
          const reason = (ev.reason ?? "").trim();
          const extra = reason ? ` | ${reason}` : "";
          addLine(
            `t-${i + 1}`,
            `${fmtMs(ageMs)} ago | ${String(ev.writer)} | ${String(ev.target)}${
              value ? `=${value}` : ""
            }${deltaText}${extra}`
          );
        }
      };

      // V2: minimal dynamic param subgraph toggle
      {
        const baseSelected = selected as BaseNodeId;
        const expandablePrefix = EXPANDABLE_PREFIX_BY_NODE[baseSelected];
        if (expandablePrefix != null) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "nw-topology__detailsClose";
          const isExpanded = this.expandedNodes.has(baseSelected);
          btn.textContent = isExpanded ? "Collapse params" : "Expand params";
          btn.addEventListener("click", () => {
            if (this.expandedNodes.has(baseSelected)) {
              this.expandedNodes.delete(baseSelected);
            } else {
              this.expandedNodes.add(baseSelected);
            }
            this.rebuildGraphAndSvg();
          });
          addControl("paramGraph", btn);
          addHr();
        }
      }

      const param = parseParamNodeId(selected);
      if (param) {
        addLine("param.parent", param.parent);
        addLine("param.target", param.target);
        addTrace(param.target, `Recent decisions: ${param.target}`);
      }

      const widen = (bank: MacroBank) => {
        const clamp01Local = (value: unknown, fallback: number) => {
          const n = Number(value);
          if (!Number.isFinite(n)) return fallback;
          return Math.min(1, Math.max(0, n));
        };

        const fusion0 = clamp01Local(bank.macros.fusion, 0.5);
        const motion0 = clamp01Local(bank.macros.motion, 0.5);
        const sparkle0 = clamp01Local(bank.macros.sparkle, 0.5);
        const slots = Array.isArray(bank.slots) ? bank.slots : [];
        const slotDevs = slots.map((v) => clamp01Local(v, 0.5) - 0.5);
        const slotAvgDev = slotDevs.length
          ? slotDevs.reduce((a, b) => a + b, 0) / slotDevs.length
          : 0;
        const s0 = slotDevs[0] ?? 0;
        const s1 = slotDevs[1] ?? 0;
        const s2 = slotDevs[2] ?? 0;

        const fusion = clamp01Local(
          fusion0 + 0.12 * slotAvgDev + 0.18 * s0,
          0.5
        );
        const motion = clamp01Local(
          motion0 + 0.1 * slotAvgDev + 0.18 * s1,
          0.5
        );
        const sparkle = clamp01Local(
          sparkle0 + 0.1 * slotAvgDev + 0.18 * s2,
          0.5
        );
        return { fusion, motion, sparkle };
      };

      if (selected === "audio") {
        addLine("playing", snap.audio.playing ? "1" : "0");
        addLine("source", snap.audio.source ?? "--");
        addLine("ctx", snap.audio.ctxState ?? "--");
        addHr();
        addLine("energy", pct(snap.audioFrame.energy01));
        addLine("rms", snap.audioFrame.rms.toFixed(3));
        addLine("peak", snap.audioFrame.peak.toFixed(3));
      }

      if (selected === "ui") {
        addLine("macroOwner", snap.aivj.macroOwner ?? "--");
        addLine("ownerTTL", fmtMs(snap.aivj.macroOwnerTtlMs));
        addLine("manualHold", fmtMs(snap.aivj.manualHoldMs));
      }

      if (selected === "visualState") {
        addLine("F", pct(snap.aivj.baseBank.macros.fusion));
        addLine("M", pct(snap.aivj.baseBank.macros.motion));
        addLine("S", pct(snap.aivj.baseBank.macros.sparkle));
        addLine(
          "slots",
          Array.isArray(snap.aivj.baseBank.slots)
            ? snap.aivj.baseBank.slots.map((v) => pct(v)).join(" ")
            : "--"
        );
      }

      if (selected === "control") {
        const cp = snap.controlPlane;
        if (!cp) {
          addLine("status", "--");
        } else {
          const g = cp.gate ?? {};
          addLine(
            "gate",
            `A${g.audioValid ? 1 : 0} B${g.beatTrusted ? 1 : 0} R${
              g.renderStable ? 1 : 0
            }`
          );
          addLine("section", cp.sectionState ?? "--");
          if (cp.phase) {
            addLine(
              "phase",
              `p=${Number(cp.phase.phase01 ?? 0).toFixed(2)} FG=${
                cp.phase.fgWindow ? 1 : 0
              } BG=${cp.phase.bgWindow ? 1 : 0}`
            );
          }
          addLine("action", cp.scheduledAction ?? "--");
          addLine("deny", (cp.denyReasonsTop ?? []).join(",") || "--");
          const cd = cp.cooldown ?? {};
          addLine(
            "cooldown1",
            `a=${fmtMs(cd.audioMs ?? 0)} b=${fmtMs(cd.beatMs ?? 0)} r=${fmtMs(
              cd.renderMs ?? 0
            )}`
          );
          addLine(
            "cooldown2",
            `m3=${fmtMs(cd.m3Ms ?? 0)} fg=${fmtMs(cd.fgMs ?? 0)} bg=${fmtMs(
              cd.bgMs ?? 0
            )} fr=${fmtMs(cd.fgRecentMs ?? 0)} br=${fmtMs(cd.bgRecentMs ?? 0)}`
          );
          const flags = cp.freezeFlags ?? {};
          addLine(
            "freeze",
            `rebuild=${flags.rebuild ? 1 : 0} res=${
              flags.resCooldown ? 1 : 0
            } beat=${flags.beatCooldown ? 1 : 0}`
          );
          addLine("writer", cp.finalWriter ?? "--");
          addLine("lastEvent", cp.lastEvent ?? "--");
          addTrace("controlPlane.", "Recent decisions: controlPlane.*");

          if (cp.calibration) {
            addHr();
            addLine("calib", cp.calibration.enabled ? "on" : "off");
            addLine(
              "calibAutoOff",
              fmtMs(Number(cp.calibration.autoOffMs ?? 0))
            );
          }

          if (cp.display) {
            addHr();
            addLine(
              "display",
              `${Math.round(cp.display.viewportW ?? 0)}x${Math.round(
                cp.display.viewportH ?? 0
              )} @dpr=${Number(cp.display.dpr ?? 1).toFixed(2)}`
            );
            addLine(
              "initScale",
              Number.isFinite(Number(cp.display.initScale))
                ? Number(cp.display.initScale).toFixed(2)
                : "--"
            );
            addLine(
              "target",
              `${Math.round(cp.display.targetW ?? 0)}x${Math.round(
                cp.display.targetH ?? 0
              )}${cp.display.pending ? " (pending)" : ""}`
            );
          }

          if (cp.color) {
            addHr();
            addLine(
              "colorSpace",
              `${String(cp.color.outputColorSpace ?? "--")}`
            );
            addLine("toneMap", String(cp.color.toneMapping ?? "--"));
            addLine(
              "exposure",
              Number.isFinite(Number(cp.color.toneMappingExposure))
                ? Number(cp.color.toneMappingExposure).toFixed(2)
                : "--"
            );
            addLine(
              "premult",
              cp.color.premultipliedAlpha == null
                ? "--"
                : cp.color.premultipliedAlpha
                ? "1"
                : "0"
            );
            addLine(
              "targetMode",
              `${String(cp.color.targetMode ?? "--")} ${Math.round(
                cp.color.fixedWidth ?? 0
              )}x${Math.round(cp.color.fixedHeight ?? 0)}`
            );
          }

          if (cp.coupler) {
            addHr();
            addLine(
              "coupler.kEff",
              Number.isFinite(Number(cp.coupler.kEff))
                ? Number(cp.coupler.kEff).toFixed(2)
                : "--"
            );
            addLine(
              "coupler.phaseW",
              Number.isFinite(Number(cp.coupler.phaseW))
                ? Number(cp.coupler.phaseW).toFixed(2)
                : "--"
            );
            addLine(
              "coupler.flipRate",
              Number.isFinite(Number(cp.coupler.signFlipRate2s))
                ? Number(cp.coupler.signFlipRate2s).toFixed(2)
                : "--"
            );
            addLine("coupler.freeze", cp.coupler.freeze ? "1" : "0");
          }

          const events = Array.isArray(cp.events) ? cp.events : [];
          if (events.length) {
            addHr();
            const recent = events.slice(-6).reverse();
            for (let i = 0; i < recent.length; i++) {
              const ev = recent[i];
              const ageMs = Math.max(
                0,
                snap.nowMs - Number(ev.tMs ?? snap.nowMs)
              );
              const detail = ev.detail ? `:${ev.detail}` : "";
              addLine(
                `evt-${i + 1}`,
                `${fmtMs(ageMs)} ago | ${ev.type}${detail}`
              );
            }
          }
        }
      }

      if (selected === "beat") {
        const bt = snap.beatTempo;
        if (bt) {
          addLine("enabled", bt.enabled ? "1" : "0");
          addLine("method", bt.method);
          addLine("windowSec", String(bt.windowSec));
          addLine("updateIntervalMs", String(bt.updateIntervalMs));
          addLine("min/max", `${bt.minTempo}..${bt.maxTempo}`);
          addLine("inputFps", String(bt.inputFps));
          addHr();
          addLine("ok", bt.ok ? "1" : "0");
          addLine("bpm", fmtBpm(bt.bpm));
          addLine("conf", pct(bt.confidence01));
          addLine("stability", pct(bt.stability01));
          addLine("beatPulse", pct(bt.beatPulse01));
        } else {
          addLine("tempo", fmtBpm(snap.audioFrame.tempoBpm));
          addLine("conf", pct(snap.audioFrame.beatConfidence01 ?? 0));
          addLine(
            "stability",
            pct(
              snap.audioFrame.beatStability01 ??
                snap.audioFrame.beatConfidence01 ??
                0
            )
          );
        }
      }

      if (selected === "audioControls") {
        const ac = snap.audioControls;
        if (!ac) {
          addLine("enabled", "--");
        } else {
          addLine("enabled", ac.enabled ? "1" : "0");
          addLine("mixToMacros", pct(ac.mixToMacros));
          addLine(
            "attack/release",
            `${Math.round(ac.attackMs)} / ${Math.round(ac.releaseMs)} ms`
          );
          addLine("maxDelta", String(ac.maxDeltaPerSec.toFixed(2)));
          addHr();
          addLine("snap.energy", pct(ac.snapshot.energy01));
          addLine("snap.bass", pct(ac.snapshot.bass01));
          addLine("snap.flux", pct(ac.snapshot.flux01));
          addLine("snap.beatPulse", pct(ac.snapshot.beatPulse01));
          addLine(
            "snap.F/M/S",
            `F${pct(ac.snapshot.fusion01)} M${pct(ac.snapshot.motion01)} S${pct(
              ac.snapshot.sparkle01
            )}`
          );
        }
      }

      if (selected === "aivj") {
        addLine("enabled", snap.aivj.enabled ? "on" : "off");
        addLine("profile", String(snap.aivj.profile));
        addLine("owner", snap.aivj.macroOwner ?? "--");
        addLine("ttl", fmtMs(snap.aivj.macroOwnerTtlMs));
        addLine("manualHold", fmtMs(snap.aivj.manualHoldMs));
        if (snap.aivj.debug) {
          addHr();
          addLine("dbg.mode", snap.aivj.debug.mode);
          addLine("dbg.section", snap.aivj.debug.section ?? "--");
          addLine("dbg.stage", snap.aivj.debug.stage ?? "--");
          addLine(
            "dbg.mix",
            snap.aivj.debug.mix01 == null ? "--" : pct(snap.aivj.debug.mix01)
          );
          addLine(
            "dbg.accent",
            snap.aivj.debug.accent01 == null
              ? "--"
              : pct(snap.aivj.debug.accent01)
          );
          addLine(
            "dbg.slotPulse",
            snap.aivj.debug.slotPulse01 == null
              ? "--"
              : pct(snap.aivj.debug.slotPulse01)
          );
          addLine("dbg.src", snap.aivj.debug.accentSource ?? "--");
        }
        addTrace("aivj.", "Recent decisions: aivj.*");
      }

      if (selected === "macro") {
        const bank = snap.aivj.runtimeBank ?? snap.aivj.baseBank;
        const w = widen(bank);
        addLine(
          "F/M/S",
          `F${pct(w.fusion)} M${pct(w.motion)} S${pct(w.sparkle)}`
        );
        addLine(
          "slots",
          Array.isArray(bank.slots)
            ? bank.slots.map((v) => pct(v)).join(" ")
            : "--"
        );
      }

      if (selected === "macroMapper") {
        addLine("fn", "applyMacroBankToRuntime");
        addLine("affects", "ProjectM + LiquidMetal (+ layer params)");
        addContrib("projectm.", "Contrib: projectm.*");
        addContrib("liquid.", "Contrib: liquid.*");
        addTrace("projectm.", "Recent decisions: projectm.*");
        addTrace("liquid.", "Recent decisions: liquid.*");
      }

      if (selected === "projectm") {
        const c = snap.runtime?.renderer?.compositor;
        if (c) {
          addLine("compositor", c.enabled ? "on" : "off");
          addLine("comp.mode", String(c.blendMode));
          addLine(
            "comp.target",
            c.targetMode === "fixed"
              ? `fixed ${Math.round(Number(c.fixedWidth))}x${Math.round(
                  Number(c.fixedHeight)
                )}`
              : "viewport"
          );
          addLine(
            "comp.pool",
            String(Math.max(0, Math.round(Number(c.poolSize))))
          );
          if (c.shaderVersion) addLine("comp.shader", String(c.shaderVersion));
          if (c.rtColorSpace) addLine("comp.rtCS", String(c.rtColorSpace));
        }
        addContrib("projectm.", "Contrib: projectm.*");
        addTrace("projectm.", "Recent decisions: projectm.*");
      }

      if (selected === "pmClosedLoop") {
        addContrib(
          "projectm.externalOpacityDrive",
          "Contrib: closed-loop (externalOpacityDrive)"
        );
        addTrace(
          "projectm.externalOpacityDrive",
          "Recent decisions: closed-loop"
        );
      }

      if (selected === "pmColorLoop") {
        addContrib(
          "liquid.runtimeColorTuning",
          "Contrib: color-loop (runtimeColorTuning)"
        );
        addTrace("liquid.runtimeColorTuning", "Recent decisions: color-loop");
      }

      if (selected === "overlay") {
        addContrib("overlayBudget.", "Contrib: overlayBudget.*");
        addTrace("overlayBudget.", "Recent decisions: overlayBudget.*");
      }

      if (selected === "overlay") {
        addLine("scale", pct(snap.overlay.scale01));
        addLine("mean", pct(snap.overlay.meanOverlayMul01));
        addLine("pmTarget", pct(snap.overlay.pmTarget01));
        addHr();
        if (snap.overlay.cfg) {
          addLine("maxEnergy", snap.overlay.cfg.maxEnergy.toFixed(2));
          addLine("minScale", snap.overlay.cfg.minScale.toFixed(2));
          addLine("depthWeight", snap.overlay.cfg.depthWeight.toFixed(2));
          addLine(
            "smoothBaseMs",
            String(Math.round(snap.overlay.cfg.smoothBaseMs))
          );
          addLine(
            "prio B/C/V/D",
            `${snap.overlay.cfg.priorityBasic.toFixed(
              2
            )} / ${snap.overlay.cfg.priorityCamera.toFixed(
              2
            )} / ${snap.overlay.cfg.priorityVideo.toFixed(
              2
            )} / ${snap.overlay.cfg.priorityDepth.toFixed(2)}`
          );
          addLine(
            "PM retreat",
            `${snap.overlay.cfg.pmRetreatStrength.toFixed(
              2
            )} floor=${snap.overlay.cfg.pmRetreatFloor.toFixed(2)}`
          );
          addHr();
        }
        addLine("mul.projectm", pct(snap.overlay.mul.projectm));
        addLine("mul.camera", pct(snap.overlay.mul.camera));
        addLine("mul.video", pct(snap.overlay.mul.video));
        addLine("mul.depth", pct(snap.overlay.mul.depth));
      }

      if (selected === "coupling") {
        const s = snap.runtime?.spatial;
        if (!s) {
          addLine("status", "--");
        } else {
          addLine("edge", pct(s.portraitEdge01));
          addLine("area", pct(s.portraitArea01));
          addLine("depthFresh", pct(s.depthFresh01));
          const perPm = snap.runtime?.projectmVerify?.perPm ?? {};
          const fgLuma = Number(perPm.fg?.avgLuma);
          const bgLuma = Number(perPm.bg?.avgLuma);
          addLine(
            "luma",
            `fg=${Number.isFinite(fgLuma) ? fgLuma.toFixed(3) : "--"} bg=${
              Number.isFinite(bgLuma) ? bgLuma.toFixed(3) : "--"
            }`
          );
          addHr();
          addLine("edgeDrive", pct(s.edgeDrive01));
          addLine("edgeBias", pct(s.edgeBias01));
          addLine("piBias", s.piBiasSigned.toFixed(3));
          addLine("drive", s.externalOpacityDriveSigned.toFixed(3));
        }
      }

      if (selected === "pmSampler") {
        const v = snap.runtime?.projectmVerify ?? {};
        const fg = v.perPm?.fg ?? {};
        const bg = v.perPm?.bg ?? {};
        const fgLuma = Number(fg.avgLuma ?? v.avgLuma);
        const bgLuma = Number(bg.avgLuma);
        addLine("luma.fg", Number.isFinite(fgLuma) ? fgLuma.toFixed(3) : "--");
        addLine("luma.bg", Number.isFinite(bgLuma) ? bgLuma.toFixed(3) : "--");
        const fgColor = fg.avgColor ?? v.avgColor;
        const bgColor = bg.avgColor;
        if (fgColor) {
          addLine(
            "color.fg",
            `${Math.round(fgColor.r)},${Math.round(fgColor.g)},${Math.round(
              fgColor.b
            )}`
          );
        } else {
          addLine("color.fg", "--");
        }
        if (bgColor) {
          addLine(
            "color.bg",
            `${Math.round(bgColor.r)},${Math.round(bgColor.g)},${Math.round(
              bgColor.b
            )}`
          );
        } else {
          addLine("color.bg", "--");
        }
      }

      if (selected === "pmClosedLoop") {
        const v = snap.runtime?.projectmVerify ?? {};
        const fgLuma = Number(v.perPm?.fg?.avgLuma ?? v.avgLuma);
        const bgLuma = Number(v.perPm?.bg?.avgLuma);
        addLine("luma.fg", Number.isFinite(fgLuma) ? fgLuma.toFixed(3) : "--");
        addLine("luma.bg", Number.isFinite(bgLuma) ? bgLuma.toFixed(3) : "--");
        addLine("enabled", v.closedLoopPiEnabled ? "1" : "0");
        addLine(
          "target",
          Number.isFinite(Number(v.closedLoopPiTarget))
            ? String(Number(v.closedLoopPiTarget).toFixed(3))
            : "--"
        );
        addLine(
          "error",
          Number.isFinite(Number(v.closedLoopPiError))
            ? String(Number(v.closedLoopPiError).toFixed(3))
            : "--"
        );
        addLine(
          "opacityBias",
          Number.isFinite(Number(v.closedLoopPiOpacity))
            ? String(Number(v.closedLoopPiOpacity).toFixed(3))
            : "--"
        );
      }

      if (selected === "pmColorLoop") {
        const v = snap.runtime?.projectmVerify ?? {};
        addLine("enabled", v.colorLoopEnabled ? "1" : "0");
        addLine(
          "hue01",
          Number.isFinite(Number(v.colorLoopHue01))
            ? pct(Number(v.colorLoopHue01))
            : "--"
        );
        addLine(
          "strength01",
          Number.isFinite(Number(v.colorLoopStrength01))
            ? pct(Number(v.colorLoopStrength01))
            : "--"
        );
        addLine(
          "contrastMul",
          Number.isFinite(Number(v.colorLoopContrastMul))
            ? Number(v.colorLoopContrastMul).toFixed(3)
            : "--"
        );
      }

      if (selected === "projectm") {
        const pm = snap.runtime?.projectm ?? {};
        const bank = snap.aivj.runtimeBank ?? snap.aivj.baseBank;
        const w = widen(bank);
        const computedOpacity01 = 0.55 + 0.45 * w.fusion;
        const computedEnergyToOpacityAmount01 = 0.15 + 0.4 * w.motion;

        const baseOpacity01 =
          pm.opacity01 == null
            ? computedOpacity01
            : clamp01(Number(pm.opacity01));
        const baseEnergyToOpacityAmount01 =
          pm.energyToOpacityAmount01 == null
            ? computedEnergyToOpacityAmount01
            : clamp01(Number(pm.energyToOpacityAmount01));

        addLine("opacity.base", `${pct(baseOpacity01)} (macro->PM)`);
        addLine(
          "opacity.mul",
          `${pct(snap.overlay.mul.projectm)} (overlayBudget)`
        );
        addLine(
          "opacity.effective",
          `${pct(baseOpacity01 * snap.overlay.mul.projectm)}`
        );
        addHr();
        addLine(
          "energyToOpacity",
          `${pct(baseEnergyToOpacityAmount01)} (macro->PM)`
        );

        const prevPm = prev?.runtime?.projectm ?? {};
        const d = diff01(
          prevPm.opacity01 == null ? null : Number(prevPm.opacity01),
          pm.opacity01 == null ? null : Number(pm.opacity01)
        );
        if (d != null)
          addLine("dOpacity.base", `${d >= 0 ? "+" : ""}${d.toFixed(3)}`);
      }

      if (selected === "liquid") {
        const l = (snap.runtime?.liquid ?? {}) as any;
        const keys: Array<[string, string]> = [
          ["brightness", "brightness"],
          ["contrast", "contrast"],
          ["timeScale", "timeScale"],
          ["waveAmplitude", "waveAmplitude"],
          ["metallicAmount", "metallicAmount"],
          ["metallicSpeed", "metallicSpeed"],
          ["tintHue", "tintHue"],
          ["tintStrength", "tintStrength"],
          ["paletteStrength", "paletteStrength"],
        ];

        for (const [label, key] of keys) {
          const n = Number(l?.[key]);
          if (!Number.isFinite(n)) continue;
          addLine(label, n.toFixed(3));
        }

        if (!content.childElementCount) addLine("liquid", "--");
      }

      if (selected === "camera") {
        const c = snap.runtime?.camera ?? {};
        addLine("enabled", c.enabled == null ? "--" : c.enabled ? "1" : "0");
        addLine(
          "opacity.base",
          c.opacity01 == null ? "--" : pct(Number(c.opacity01))
        );
        addLine("opacity.mul", pct(snap.overlay.mul.camera));
        if (c.opacity01 != null) {
          addLine(
            "opacity.effective",
            pct(Number(c.opacity01) * snap.overlay.mul.camera)
          );
        }
        addHr();
        addLine("state", c.state ?? "--");
        addLine("segmentPerson", c.segmentPerson ? "1" : "0");
        addLine(
          "portraitEdge",
          c.portraitEdge01 == null ? "--" : pct(c.portraitEdge01)
        );
        addLine(
          "portraitArea",
          c.portraitArea01 == null ? "--" : pct(c.portraitArea01)
        );
      }

      if (selected === "cameraSeg") {
        const c = snap.runtime?.camera ?? {};
        addLine("segmentPerson", c.segmentPerson ? "1" : "0");
        addLine(
          "portraitEdge",
          c.portraitEdge01 == null ? "--" : pct(c.portraitEdge01)
        );
        addLine(
          "portraitArea",
          c.portraitArea01 == null ? "--" : pct(c.portraitArea01)
        );
      }

      if (selected === "depth") {
        const d = snap.runtime?.depth ?? {};
        addLine("enabled", d.enabled ? "1" : "0");
        addLine("source", d.source ?? "--");
        addLine("state", d.state ?? "--");
        addLine("fpsIn", d.fpsIn == null ? "--" : String(Math.round(d.fpsIn)));
        addLine(
          "fpsProc",
          d.fpsProc == null ? "--" : String(Math.round(d.fpsProc))
        );
        addLine("fresh", pct(snap.overlay.depthFresh01));
      }

      if (selected === "basic") {
        addLine("mul.basic", pct(snap.overlay.mul.basic));
      }

      if (selected === "video") {
        addLine("mul.video", pct(snap.overlay.mul.video));
      }
    }

    panel.appendChild(content);
    this.details.appendChild(panel);
  }

  private setNodeHotness(id: NodeId, hot01: number, dtMs: number) {
    const prev = this.nodeHotness.get(id) ?? 0;
    const tauMs = 850;
    const decay = dtMs > 0 ? Math.exp(-dtMs / tauMs) : 1;
    const next = clamp01(Math.max(prev * decay, clamp01(hot01)));
    this.nodeHotness.set(id, next);
    const el = this.nodeHotEls.get(id);
    if (el) el.style.opacity = String(next);
  }

  update(snapshot: DecisionTopologySnapshot) {
    this.prevSnapshot = this.snapshot;
    this.snapshot = snapshot;

    const subParts: string[] = [];
    subParts.push(snapshot.audio.playing ? "LIVE" : "PAUSED");
    subParts.push(`E ${pct(snapshot.audioFrame.energy01)}`);
    subParts.push(`Tempo ${fmtBpm(snapshot.audioFrame.tempoBpm)}`);
    subParts.push(`AI ${snapshot.aivj.enabled ? "ON" : "OFF"}`);
    const macroPresetLabel =
      snapshot.macroPreset?.label ?? snapshot.macroPreset?.id ?? null;
    if (macroPresetLabel) {
      subParts.push(
        `Preset ${macroPresetLabel}${
          snapshot.macroPreset?.autoApply ? " (auto)" : ""
        }`
      );
    }

    const owner = snapshot.aivj.macroOwner;
    const ttlMs = Number(snapshot.aivj.macroOwnerTtlMs ?? 0);
    if (owner && Number.isFinite(ttlMs) && ttlMs > 0) {
      const ttlS = `${Math.ceil(ttlMs / 100) / 10}s`;
      const label =
        owner === "human"
          ? "用户接管"
          : owner === "ai"
          ? "AI 接管"
          : "系统接管";
      subParts.push(`Macro ${label} (${ttlS})`);
    }
    this.subtitle.textContent = subParts.join(" | ");

    const prev = this.prevSnapshot;
    const dtMs = prev ? Math.max(0, snapshot.nowMs - prev.nowMs) : 0;

    const traceRaw = Array.isArray(snapshot.decisionTrace?.recent)
      ? snapshot.decisionTrace!.recent
      : [];
    const trace = this.filterTrace(traceRaw);
    const traceWindowMs = 900;
    const hotFromTrace = (match: (ev: DecisionTraceEvent) => boolean) => {
      let best = 0;
      for (const ev of trace) {
        const tMs = Number(ev?.tMs);
        if (!Number.isFinite(tMs)) continue;
        const ageMs = snapshot.nowMs - tMs;
        if (ageMs < 0 || ageMs > traceWindowMs) continue;
        if (!match(ev)) continue;
        const w01 = clamp01(Number(ev.weight01 ?? 0.85));
        const age01 = clamp01(1 - ageMs / traceWindowMs);
        best = Math.max(best, w01 * age01);
      }
      return best;
    };
    const hotByWriter = (writer: string) =>
      hotFromTrace((ev) => String(ev.writer ?? "") === writer);
    const hotByTargetPrefix = (prefix: string) =>
      hotFromTrace((ev) => String(ev.target ?? "").startsWith(prefix));

    // Apply filters to the graph itself (dim nodes/edges) while preserving selection behavior.
    {
      const filtersActive = isFiltersActive(this.traceFilters);
      const selected = this.selectedNode;

      const nodeActive = (id: NodeId) => {
        if (!filtersActive) return true;
        const param = parseParamNodeId(id);
        if (param) {
          return trace.some((e) => String(e.target ?? "") === param.target);
        }
        if (!isBaseNodeId(id)) return true;
        const base = id;
        if (!FILTERABLE_NODES.has(base)) return true;
        return trace.some((e) => eventMatchesNode(base, e));
      };

      const shouldDimNode = (id: NodeId) => {
        const selDim = Boolean(selected && id !== selected);
        const filterDim = filtersActive && !nodeActive(id);
        return selDim || filterDim;
      };

      try {
        const nodes = this.svg.querySelectorAll<SVGGElement>("[data-node]");
        nodes.forEach((el) => {
          const id = (el.getAttribute("data-node") ?? "") as NodeId;
          if (!id) return;
          const isSelected = Boolean(selected && id === selected);
          el.classList.toggle("is-selected", isSelected);
          el.classList.toggle("is-dim", shouldDimNode(id));
        });
      } catch {
        // ignore
      }

      try {
        const paths = this.svg.querySelectorAll<SVGPathElement>("[data-edge]");
        paths.forEach((el) => {
          const from = (el.getAttribute("data-from") ?? "") as NodeId;
          const to = (el.getAttribute("data-to") ?? "") as NodeId;
          const connected = Boolean(
            selected && (from === selected || to === selected)
          );
          const dim = shouldDimNode(from) || shouldDimNode(to);
          el.classList.toggle("is-connected", connected);
          el.classList.toggle("is-dim", dim);
        });

        const labels =
          this.svg.querySelectorAll<SVGTextElement>("[data-edge-label]");
        labels.forEach((el) => {
          const from = (el.getAttribute("data-from") ?? "") as NodeId;
          const to = (el.getAttribute("data-to") ?? "") as NodeId;
          const connected = Boolean(
            selected && (from === selected || to === selected)
          );
          const dim = shouldDimNode(from) || shouldDimNode(to);
          el.classList.toggle("is-connected", connected);
          el.classList.toggle("is-dim", dim);
        });
      } catch {
        // ignore
      }
    }

    // Update dynamic param nodes (if present)
    {
      const lastByTarget = new Map<string, DecisionTraceEvent>();
      for (const ev of trace) {
        const t = String(ev.target ?? "");
        if (t && !lastByTarget.has(t)) lastByTarget.set(t, ev);
      }
      for (const n of this.graphNodes) {
        const parsed = parseParamNodeId(n.id);
        if (!parsed) continue;
        const ev = lastByTarget.get(parsed.target);
        const value = (ev?.value ?? "").trim();
        const el = this.nodeValueEls.get(n.id);
        if (el) el.textContent = value ? value : "--";
        const hot = hotFromTrace(
          (x) => String(x.target ?? "") === parsed.target
        );
        this.setNodeHotness(n.id, hot, dtMs);
      }
    }

    const audioText = `${snapshot.audio.playing ? "playing" : "paused"} | ${
      snapshot.audio.source ?? "--"
    }`;
    this.nodeValueEls.get("audio")!.textContent = audioText;

    const macroOwner = snapshot.aivj.macroOwner ?? "--";
    this.nodeValueEls.get("ui")!.textContent = `owner=${macroOwner}`;

    const baseBank = snapshot.aivj.baseBank;
    this.nodeValueEls.get("visualState")!.textContent = `F${pct(
      baseBank.macros.fusion
    )} M${pct(baseBank.macros.motion)} S${pct(baseBank.macros.sparkle)}`;

    const cp = snapshot.controlPlane;
    const controlEl = this.nodeValueEls.get("control");
    if (controlEl) {
      if (!cp) {
        controlEl.textContent = "--";
      } else {
        const g = cp.gate ?? {};
        const gateText = `A${g.audioValid ? 1 : 0}B${g.beatTrusted ? 1 : 0}R${
          g.renderStable ? 1 : 0
        }`;
        const section = cp.sectionState ?? "--";
        const action = String(cp.scheduledAction ?? "--");
        const shortAction =
          action.length > 14 ? `${action.slice(0, 13)}…` : action;
        const deny = (cp.denyReasonsTop ?? []).slice(0, 2).join(",");
        const denyText = deny ? ` deny=${deny}` : "";
        controlEl.textContent = `gate=${gateText} sec=${section} act=${shortAction}${denyText}`;
      }
    }

    const beatOk = snapshot.beatTempo?.ok ?? false;
    const beatBpm =
      snapshot.beatTempo?.bpm ?? snapshot.audioFrame.tempoBpm ?? 0;
    const beatConf =
      snapshot.beatTempo?.confidence01 ??
      snapshot.audioFrame.beatConfidence01 ??
      0;
    const beatText = `${beatOk ? "ok" : "..."} | ${fmtBpm(
      beatBpm
    )} | conf=${pct(beatConf)}`;
    this.nodeValueEls.get("beat")!.textContent = beatText;

    const ac = snapshot.audioControls;
    this.nodeValueEls.get("audioControls")!.textContent = ac
      ? `mix=${pct(ac.mixToMacros)} | E=${pct(ac.snapshot.energy01)}`
      : `E=${pct(snapshot.audioFrame.energy01)}`;

    const a = snapshot.aivj;
    this.nodeValueEls.get("aivj")!.textContent = `${
      a.enabled ? "on" : "off"
    } | ${a.profile} | owner=${a.macroOwner ?? "--"}`;

    const b = a.runtimeBank ?? a.baseBank;
    const macroPresetText = macroPresetLabel ?? "--";
    this.nodeValueEls.get("macro")!.textContent = `F${pct(
      b.macros.fusion
    )} M${pct(b.macros.motion)} S${pct(
      b.macros.sparkle
    )} | preset=${macroPresetText} | hold=${fmtMs(a.manualHoldMs)}`;

    this.nodeValueEls.get("overlay")!.textContent = `scale=${pct(
      snapshot.overlay.scale01
    )} | mean=${pct(snapshot.overlay.meanOverlayMul01)} | D=${pct(
      snapshot.overlay.depthFresh01
    )}`;

    this.nodeValueEls.get("macroMapper")!.textContent = `map`;

    const pmOpacity = Number(snapshot.runtime?.projectm?.opacity01);
    const pmBaseText = Number.isFinite(pmOpacity) ? pct(pmOpacity) : "--";
    this.nodeValueEls.get(
      "projectm"
    )!.textContent = `base=${pmBaseText} | mul=${pct(
      snapshot.overlay.mul.projectm
    )}`;

    const liquidBrightness = Number(
      (snapshot.runtime?.liquid as any)?.brightness
    );
    this.nodeValueEls.get("liquid")!.textContent = Number.isFinite(
      liquidBrightness
    )
      ? `br=${liquidBrightness.toFixed(2)}`
      : `--`;

    const camEnabled = Boolean(snapshot.runtime?.camera?.enabled);
    this.nodeValueEls.get("camera")!.textContent = `${
      camEnabled ? "on" : "off"
    } | mul=${pct(snapshot.overlay.mul.camera)}`;

    const seg = snapshot.runtime?.camera?.segmentPerson;
    const pe = snapshot.runtime?.camera?.portraitEdge01 ?? 0;
    const pa = snapshot.runtime?.camera?.portraitArea01 ?? 0;
    this.nodeValueEls.get("cameraSeg")!.textContent = `${
      seg ? "seg" : "raw"
    } | e=${pct(pe)} a=${pct(pa)}`;

    const depthOn = Boolean(snapshot.runtime?.depth?.enabled);
    const depthFps = Number(snapshot.runtime?.depth?.fpsIn ?? 0);
    this.nodeValueEls.get("depth")!.textContent = `${
      depthOn ? "on" : "off"
    } | ${
      Number.isFinite(depthFps) && depthFps > 0
        ? `${Math.round(depthFps)}fps`
        : "--"
    } | fresh=${pct(snapshot.overlay.depthFresh01)}`;

    this.nodeValueEls.get("basic")!.textContent = `mul=${pct(
      snapshot.overlay.mul.basic
    )}`;
    this.nodeValueEls.get("video")!.textContent = `mul=${pct(
      snapshot.overlay.mul.video
    )}`;

    const verify = snapshot.runtime?.projectmVerify ?? {};
    const perPm = verify.perPm ?? {};
    const fgPm = perPm.fg ?? {};
    const bgPm = perPm.bg ?? {};
    const luma = Number(fgPm.avgLuma ?? verify.avgLuma);
    const lumaBg = Number(bgPm.avgLuma);
    const rgb = fgPm.avgColor ?? verify.avgColor;
    const rgbBg = bgPm.avgColor;
    const rgbText =
      rgb &&
      Number.isFinite(rgb.r) &&
      Number.isFinite(rgb.g) &&
      Number.isFinite(rgb.b)
        ? `rgb=${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`
        : "rgb=--";
    const bgText = Number.isFinite(lumaBg) ? lumaBg.toFixed(3) : "--";
    const rgbBgText =
      rgbBg &&
      Number.isFinite(rgbBg.r) &&
      Number.isFinite(rgbBg.g) &&
      Number.isFinite(rgbBg.b)
        ? `bg=${Math.round(rgbBg.r)},${Math.round(rgbBg.g)},${Math.round(
            rgbBg.b
          )}`
        : "bg=--";
    this.nodeValueEls.get("pmSampler")!.textContent = `luma=${
      Number.isFinite(luma) ? luma.toFixed(3) : "--"
    }/${bgText} | ${rgbText} | ${rgbBgText}`;

    const piOn = Boolean(verify.closedLoopPiEnabled);
    const piBias = Number(verify.closedLoopPiOpacity);
    this.nodeValueEls.get("pmClosedLoop")!.textContent = `${
      piOn ? "on" : "off"
    } | bias=${Number.isFinite(piBias) ? piBias.toFixed(3) : "--"}`;

    const clOn = Boolean(verify.colorLoopEnabled);
    const clStr = Number(verify.colorLoopStrength01);
    const clHue = Number(verify.colorLoopHue01);
    this.nodeValueEls.get("pmColorLoop")!.textContent = `${
      clOn ? "on" : "off"
    } | str=${Number.isFinite(clStr) ? pct(clStr) : "--"} hue=${
      Number.isFinite(clHue) ? pct(clHue) : "--"
    }`;

    const spatial = snapshot.runtime?.spatial;
    const drive = spatial ? spatial.externalOpacityDriveSigned : 0;
    this.nodeValueEls.get("coupling")!.textContent = `drive=${
      drive >= 0 ? "+" : ""
    }${drive.toFixed(2)}`;

    // --- Node hotness: recent writes (DecisionTrace) + deltas ---
    {
      const ownerChanged = Boolean(
        prev && prev.aivj.macroOwner !== snapshot.aivj.macroOwner
      );
      const enabledChanged = Boolean(
        prev && Boolean(prev.aivj.enabled) !== Boolean(snapshot.aivj.enabled)
      );

      const prevBank = prev
        ? prev.aivj.runtimeBank ?? prev.aivj.baseBank
        : null;
      const nextBank = snapshot.aivj.runtimeBank ?? snapshot.aivj.baseBank;
      const macroDelta01 = prevBank
        ? clamp01(
            absDiff(prevBank.macros.fusion, nextBank.macros.fusion) +
              absDiff(prevBank.macros.motion, nextBank.macros.motion) +
              absDiff(prevBank.macros.sparkle, nextBank.macros.sparkle)
          )
        : 0;

      const uiHot = Math.max(
        hotByWriter("inspector"),
        hotByWriter("presetTuning"),
        hotByWriter("midi"),
        ownerChanged ? 1 : 0
      );
      this.setNodeHotness("ui", uiHot, dtMs);
      this.setNodeHotness(
        "visualState",
        Math.max(0.2 * uiHot, 0.55 * macroDelta01),
        dtMs
      );

      const audioHot = clamp01(
        0.25 * snapshot.audioFrame.energy01 +
          (prev
            ? 3.2 *
              absDiff(prev.audioFrame.energy01, snapshot.audioFrame.energy01)
            : 0)
      );
      this.setNodeHotness("audio", audioHot, dtMs);

      const beatHot = clamp01(
        0.25 * beatConf +
          (prev
            ? Math.min(
                1,
                absDiff(prev.beatTempo?.confidence01 ?? 0, beatConf) * 2.5
              ) + Math.min(1, absDiff(prev.beatTempo?.bpm ?? 0, beatBpm) / 10)
            : 0)
      );
      this.setNodeHotness(
        "beat",
        Math.max(beatHot, hotByTargetPrefix("beatTempo.")),
        dtMs
      );

      const acPrev = prev?.audioControls?.snapshot;
      const acNext = snapshot.audioControls?.snapshot;
      const acDelta01 =
        acPrev && acNext
          ? clamp01(
              absDiff(acPrev.fusion01, acNext.fusion01) +
                absDiff(acPrev.motion01, acNext.motion01) +
                absDiff(acPrev.sparkle01, acNext.sparkle01)
            )
          : 0;
      this.setNodeHotness(
        "audioControls",
        clamp01(
          hotByTargetPrefix("audioControls.") +
            (acNext ? 0.2 * acNext.energy01 : 0) +
            2.5 * acDelta01
        ),
        dtMs
      );

      const aivjHot = clamp01(
        (snapshot.aivj.enabled ? 0.2 : 0) +
          (ownerChanged || enabledChanged ? 1 : 0) +
          hotFromTrace(
            (ev) =>
              String(ev.writer ?? "") === "ai" ||
              String(ev.writer ?? "") === "runtime"
          )
      );
      this.setNodeHotness("aivj", aivjHot, dtMs);
      this.setNodeHotness(
        "macro",
        Math.max(0.65 * macroDelta01, aivjHot * 0.35),
        dtMs
      );

      const macroMapperHot = Math.max(hotByWriter("macroMapper"), macroDelta01);
      this.setNodeHotness("macroMapper", macroMapperHot, dtMs);

      const overlayHot = clamp01(
        Math.max(
          hotByWriter("overlayBudget"),
          hotByTargetPrefix("overlayBudget."),
          prev
            ? 2.0 *
                absDiff(
                  prev.overlay.meanOverlayMul01,
                  snapshot.overlay.meanOverlayMul01
                ) +
                1.6 * absDiff(prev.overlay.scale01, snapshot.overlay.scale01) +
                1.3 *
                  absDiff(prev.overlay.pmTarget01, snapshot.overlay.pmTarget01)
            : 0
        )
      );
      this.setNodeHotness("overlay", overlayHot, dtMs);

      const couplingHot = clamp01(
        Math.max(
          hotByWriter("coupling"),
          prev
            ? 2.0 *
                absDiff(
                  prev.runtime?.spatial?.externalOpacityDriveSigned ?? 0,
                  drive
                )
            : 0,
          Math.abs(drive)
        )
      );
      this.setNodeHotness("coupling", couplingHot, dtMs);

      const samplerHot = clamp01(
        0.2 +
          (prev
            ? 1.2 *
              absDiff(
                prev.runtime?.projectmVerify?.perPm?.fg?.avgLuma ??
                  prev.runtime?.projectmVerify?.avgLuma ??
                  0,
                luma
              )
            : 0)
      );
      this.setNodeHotness("pmSampler", samplerHot, dtMs);

      const piHot = clamp01(
        Math.max(
          hotByWriter("closedLoopPi"),
          piOn ? 0.25 + clamp01(Math.abs(piBias)) : 0.05,
          prev
            ? 2.0 *
                absDiff(
                  prev.runtime?.projectmVerify?.closedLoopPiOpacity ?? 0,
                  piBias
                )
            : 0
        )
      );
      this.setNodeHotness("pmClosedLoop", piHot, dtMs);

      const colorHot = clamp01(
        Math.max(
          hotByWriter("colorLoop"),
          clOn ? 0.2 + clamp01(clStr) : 0.05,
          prev
            ? 1.0 *
                absDiff(
                  prev.runtime?.projectmVerify?.colorLoopHue01 ?? 0,
                  clHue
                ) +
                1.2 *
                  absDiff(
                    prev.runtime?.projectmVerify?.colorLoopStrength01 ?? 0,
                    clStr
                  )
            : 0
        )
      );
      this.setNodeHotness("pmColorLoop", colorHot, dtMs);

      this.setNodeHotness(
        "projectm",
        clamp01(Math.max(hotByTargetPrefix("projectm."), overlayHot * 0.35)),
        dtMs
      );
      this.setNodeHotness(
        "liquid",
        clamp01(
          Math.max(
            hotByTargetPrefix("liquid."),
            macroDelta01 * 0.6,
            colorHot * 0.55
          )
        ),
        dtMs
      );

      const segHot = clamp01(
        (seg ? 0.2 : 0) +
          (prev
            ? 1.6 *
              clamp01(
                absDiff(prev.runtime?.camera?.portraitEdge01 ?? 0, pe) +
                  absDiff(prev.runtime?.camera?.portraitArea01 ?? 0, pa)
              )
            : 0)
      );
      this.setNodeHotness("cameraSeg", segHot, dtMs);

      const camHot = clamp01(
        overlayHot * 0.25 + segHot * 0.35 + (camEnabled ? 0.1 : 0)
      );
      this.setNodeHotness("camera", camHot, dtMs);

      this.setNodeHotness(
        "depth",
        clamp01(0.15 * snapshot.overlay.depthFresh01 + overlayHot * 0.25),
        dtMs
      );
      this.setNodeHotness("video", clamp01(overlayHot * 0.25), dtMs);
      this.setNodeHotness("basic", clamp01(overlayHot * 0.25), dtMs);
    }

    const w = (v: number) => 1 + 4.2 * clamp01(v);

    const setEdge = (id: EdgeId, v01: number, label?: string) => {
      const path = this.edgePathEls.get(id);
      if (path) {
        path.style.strokeWidth = `${w(v01)}px`;
        path.style.opacity = String(0.25 + 0.75 * clamp01(v01));
      }
      const t = this.edgeLabelEls.get(id);
      if (t && label) t.textContent = label;
    };

    setEdge("ui->visualState", 0.4, "patch");
    setEdge("visualState->macro", 0.6, "base");

    setEdge("audio->beat", beatConf, `conf ${pct(beatConf)}`);
    setEdge(
      "audio->audioControls",
      snapshot.audioFrame.energy01,
      `E ${pct(snapshot.audioFrame.energy01)}`
    );
    setEdge(
      "beat->audioControls",
      clamp01(
        snapshot.beatTempo?.beatPulse01 ??
          snapshot.audioFrame.beatConfidence01 ??
          0
      ),
      "pulse"
    );
    setEdge(
      "beat->aivj",
      snapshot.audioFrame.beatStability01 ??
        snapshot.audioFrame.beatConfidence01 ??
        0,
      `stb ${pct(
        snapshot.audioFrame.beatStability01 ??
          snapshot.audioFrame.beatConfidence01 ??
          0
      )}`
    );
    setEdge("audioControls->macro", clamp01(ac?.mixToMacros ?? 0), "mix");
    setEdge("aivj->macro", a.enabled ? 1 : 0, a.enabled ? "ai" : "off");
    setEdge("macro->macroMapper", 1, "map");

    const widenF = clamp01(b.macros.fusion);
    const widenM = clamp01(b.macros.motion);
    const widenS = clamp01(b.macros.sparkle);
    setEdge("macroMapper->projectm", widenF, "F");
    setEdge("macroMapper->liquid", widenM, "M");
    setEdge("macroMapper->basic", 0.15 + 0.2 * widenF, "F");
    setEdge("macroMapper->camera", 0.15 + 0.2 * widenF, "F");
    setEdge("macroMapper->video", 0.15 + 0.2 * widenS, "S");
    setEdge("macroMapper->depth", 0.15 + 0.2 * widenM, "M");

    setEdge("overlay->camera", clamp01(snapshot.overlay.mul.camera), "mul");
    setEdge("overlay->projectm", clamp01(snapshot.overlay.mul.projectm), "mul");
    setEdge("overlay->video", clamp01(snapshot.overlay.mul.video), "mul");
    setEdge("overlay->depth", clamp01(snapshot.overlay.mul.depth), "mul");
    setEdge("overlay->basic", clamp01(snapshot.overlay.mul.basic), "mul");

    setEdge("camera->cameraSeg", seg ? 1 : 0.1, seg ? "seg" : "raw");
    setEdge("cameraSeg->coupling", clamp01(pe * (0.35 + 0.65 * pa)), "edge");
    setEdge("depth->coupling", clamp01(snapshot.overlay.depthFresh01), "fresh");

    const hasLuma = Number.isFinite(luma) ? 1 : 0;
    setEdge("projectm->pmSampler", hasLuma, "stats");
    setEdge("pmSampler->pmClosedLoop", piOn ? 1 : 0.1, "luma");
    setEdge("pmSampler->pmColorLoop", clOn ? 1 : 0.1, "rgb");
    setEdge(
      "pmClosedLoop->coupling",
      piOn ? clamp01(Math.abs(piBias)) : 0.05,
      "pi"
    );
    setEdge("coupling->projectm", clamp01(Math.abs(drive)), "drive");
    setEdge("pmColorLoop->liquid", clOn ? clamp01(clStr) : 0.05, "tint");

    this.renderDetails();
  }

  show() {
    this.state.hidden = false;
    this.applyUiState();
  }

  hide() {
    this.state.hidden = true;
    this.applyUiState();
  }

  dispose() {
    this.disposeFn?.();
    this.disposeFn = null;
    try {
      this.root.remove();
    } catch {
      // ignore
    }
    try {
      this.globalToggle.remove();
    } catch {
      // ignore
    }
  }
}

function diff01(prev: number | null, next: number | null) {
  if (prev == null || next == null) return null;
  const a = Number(prev);
  const b = Number(next);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return b - a;
}
