type RendererInfo = {
  pixelRatio: number;
  outputColorSpace: string | number;
  toneMapping: string | number;
  toneMappingExposure?: number;
  premultipliedAlpha?: boolean | null;
  compositor?: {
    enabled: boolean;
    blendMode: string;
    targetMode: "viewport" | "fixed";
    fixedWidth: number;
    fixedHeight: number;
    poolSize: number;
    shaderVersion?: string;
    rtColorSpace?: string;

    // Optional profile fields (when provided by SceneManager.getCompositorProfile).
    bypassProjectM?: boolean;
    passesLastFrame?: number;
    cpuMsLastFrame?: number;
    ensureMsLastFrame?: number;
    bgMsLastFrame?: number;
    pmMsLastFrame?: number;
    compositeMsLastFrame?: number;
    rtKey?: string | null;
    rtWidth?: number;
    rtHeight?: number;
    viewportWidth?: number;
    viewportHeight?: number;
    lastRtReallocMs?: number;
    rtAllocCount?: number;
    rtEvictCount?: number;
  };
};

type ProjectMInfo = {
  initialized?: boolean;
  aborted?: boolean;
  abortReason?: string | null;
  framesRendered?: number;
  lastAudioRms?: number;
  lastAudioPeak?: number;
  lastAudioCopyOk?: boolean;
  lastAudioSamplesPerChannel?: number;
  avgLumaEnabled?: boolean;
  avgLuma?: number;
  finalAvgLuma?: number;
  avgColorR?: number;
  avgColorG?: number;
  avgColorB?: number;
  perPm?: {
    fg?: {
      avgLuma?: number;
      avgColorR?: number;
      avgColorG?: number;
      avgColorB?: number;
    };
    bg?: {
      avgLuma?: number;
      avgColorR?: number;
      avgColorG?: number;
      avgColorB?: number;
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

type AudioContextInfo = {
  state: string;
  ready: boolean;
  playing: boolean;
  smoothing?: { mode: string; alpha: number };
  source?: string;
  url?: string | null;
  streamStatus?: string | null;
  inputLabel?: string | null;
  inputDeviceId?: string | null;
  backgroundType?: string;
  backgroundStatus?: string | null;
};

type AivjInfo = {
  enabled: boolean;
  macroBankMode: "ai" | "midiLock";
  midiMacroBankBound: number; // 0..8
  midiBindingsTotal: number;
  userBank?: {
    fusion: number;
    motion: number;
    sparkle: number;
    m4: number;
    m5: number;
    m6: number;
    m7: number;
    m8: number;
  };
  aiBank?: {
    fusion: number;
    motion: number;
    sparkle: number;
    m4: number;
    m5: number;
    m6: number;
    m7: number;
    m8: number;
  };
  runtimeMixToAi01?: number; // 0..1

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

export class DiagnosticsPanel {
  private root: HTMLDivElement;
  private audioModeValue: HTMLDivElement;
  private levelFill: HTMLDivElement;
  private levelText: HTMLDivElement;
  private energyFill: HTMLDivElement;
  private energyText: HTMLDivElement;
  private tempoText: HTMLDivElement;
  private confFill: HTMLDivElement;
  private confText: HTMLDivElement;
  private rendererText: HTMLDivElement;
  private projectmText: HTMLDivElement;
  private technoText: HTMLDivElement;
  private aivjText: HTMLDivElement;
  private writerText: HTMLDivElement;
  private overlayText: HTMLDivElement;
  private layersText: HTMLDivElement;
  private controlText: HTMLDivElement;
  private soakText: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "diagnostics-panel";
    this.root.className = "nw-panel nw-panel--diagnostics";

    this.audioModeValue = this.addTextRow("Audio");
    const level = this.addBarRow("Level");
    this.levelFill = level.fill;
    this.levelText = level.value;
    const energy = this.addBarRow("Energy");
    this.energyFill = energy.fill;
    this.energyText = energy.value;
    this.tempoText = this.addTextRow("Tempo");
    const conf = this.addBarRow("Conf");
    this.confFill = conf.fill;
    this.confText = conf.value;
    this.rendererText = this.addTextRow("Renderer");
    this.projectmText = this.addTextRow("ProjectM");
    this.technoText = this.addTextRow("Techno");
    this.aivjText = this.addTextRow("AIVJ");
    this.writerText = this.addTextRow("Writer");
    this.overlayText = this.addTextRow("Overlay");
    this.layersText = this.addTextRow("Layers");
    this.controlText = this.addTextRow("Control");
    this.soakText = this.addTextRow("Soak");

    container.appendChild(this.root);
  }

  updateAudioContext(info: AudioContextInfo) {
    const mode = info.source ? String(info.source) : "(unknown)";
    const playingText = info.playing ? "playing" : "paused";
    const ctx = String(info.state);
    const liveText =
      info.source === "stream" || info.source === "input" ? "LIVE" : "Track";
    const streamText = info.streamStatus
      ? ` | ${String(info.streamStatus)}`
      : "";
    const label = String(info.inputLabel ?? "").trim();
    const deviceId = String(info.inputDeviceId ?? "").trim();
    const deviceSuffix = deviceId
      ? `(${deviceId.slice(0, 8)}${deviceId.length > 8 ? "…" : ""})`
      : "";
    const inputText = label
      ? ` | input=${label}${deviceSuffix}`
      : deviceSuffix
      ? ` | input=${deviceSuffix}`
      : "";
    const bgText = info.backgroundType
      ? ` | bg=${String(info.backgroundType)}${
          info.backgroundStatus ? `(${String(info.backgroundStatus)})` : ""
        }`
      : "";
    this.audioModeValue.textContent = `${liveText} | ${mode} | ${playingText} | ctx=${ctx}${streamText}${inputText}${bgText}`;
  }

  updateAudioFrame(opts: {
    energy: number;
    energyRaw?: number;
    rms: number;
    peak: number;
    bands?: { low: number; mid: number; high: number };
    bandsRaw?: { low: number; mid: number; high: number };
    bandsStage?: { low: number; mid: number; high: number };
    features?: {
      flux?: number;
      centroid?: number;
      loudness?: number;
      flatness?: number;
      zcr?: number;

      kick01Raw?: number;
      kick01Long?: number;
      bass01Raw?: number;
      bass01Long?: number;
      clap01Raw?: number;
      clap01Long?: number;
      synth01Raw?: number;
      synth01Long?: number;
      hihat01Raw?: number;
      hihat01Long?: number;

      tempoBpm?: number;
      beatPulse?: number;
      beatConfidence?: number;
    };
    isSilent?: boolean;
    controls?: {
      enabled?: boolean;
      fusion01?: number;
      motion01?: number;
      sparkle01?: number;
    };
  }) {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const pct = (v: number) => Math.round(clamp01(v) * 100);

    const energy01 = Number.isFinite(opts.energy) ? clamp01(opts.energy) : 0;
    const peak01 = Number.isFinite(opts.peak) ? clamp01(opts.peak) : 0;
    this.energyFill.style.width = `${pct(energy01)}%`;
    this.energyText.textContent = `${pct(energy01)}%`;
    this.levelFill.style.width = `${pct(peak01)}%`;
    this.levelText.textContent = `${pct(peak01)}%`;

    const tempoBpm = Number(opts.features?.tempoBpm ?? 0);
    const conf01 = clamp01(Number(opts.features?.beatConfidence ?? 0));
    this.tempoText.textContent =
      Number.isFinite(tempoBpm) && tempoBpm > 0
        ? `${tempoBpm.toFixed(1)} bpm`
        : "--";
    this.confFill.style.width = `${pct(conf01)}%`;
    this.confText.textContent = `${pct(conf01)}%`;

    const f = opts.features;
    const kR = clamp01(Number(f?.kick01Raw ?? 0));
    const kL = clamp01(Number(f?.kick01Long ?? 0));
    const bR = clamp01(Number(f?.bass01Raw ?? 0));
    const bL = clamp01(Number(f?.bass01Long ?? 0));
    const cR = clamp01(Number(f?.clap01Raw ?? 0));
    const cL = clamp01(Number(f?.clap01Long ?? 0));
    const sR = clamp01(Number(f?.synth01Raw ?? 0));
    const sL = clamp01(Number(f?.synth01Long ?? 0));
    const hR = clamp01(Number(f?.hihat01Raw ?? 0));
    const hL = clamp01(Number(f?.hihat01Long ?? 0));

    const any = kR + kL + bR + bL + cR + cL + sR + sL + hR + hL;
    this.technoText.textContent = any
      ? `K ${pct(kR)}/${pct(kL)}  B ${pct(bR)}/${pct(bL)}  C ${pct(cR)}/${pct(
          cL
        )}  S ${pct(sR)}/${pct(sL)}  H ${pct(hR)}/${pct(hL)}`
      : "--";
  }

  updateAivj(info: AivjInfo) {
    const pct = (v: number) =>
      `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    const mode = info.macroBankMode === "midiLock" ? "MIDI lock" : "AI";
    const bindings = `${info.midiMacroBankBound}/8 (total ${info.midiBindingsTotal})`;
    const mix =
      info.runtimeMixToAi01 == null ? "--" : pct(info.runtimeMixToAi01);

    const fmtBank = (b: NonNullable<AivjInfo["userBank"]>) =>
      `F${pct(b.fusion)} M${pct(b.motion)} S${pct(b.sparkle)} | M4${pct(
        b.m4
      )} M5${pct(b.m5)} M6${pct(b.m6)} M7${pct(b.m7)} M8${pct(b.m8)}`;

    const parts: string[] = [];
    parts.push(info.enabled ? "on" : "off");
    parts.push(`bank=${mode}`);
    parts.push(`bindings=${bindings}`);
    parts.push(`mixToAI=${mix}`);
    if (info.debug) {
      const section = info.debug.section
        ? `/${String(info.debug.section)}`
        : "";
      const stage = info.debug.stage ? `@${String(info.debug.stage)}` : "";
      const ageMs = Number(info.debug.targetAgeMs ?? 0);
      const ageText = Number.isFinite(ageMs) ? `${Math.round(ageMs)}ms` : "--";
      const dbgMix =
        info.debug.mix01 == null ? "--" : pct(Number(info.debug.mix01));
      const accent =
        info.debug.accent01 == null ? "--" : pct(Number(info.debug.accent01));
      const pulse =
        info.debug.slotPulse01 == null
          ? "--"
          : pct(Number(info.debug.slotPulse01));
      const source = info.debug.accentSource ?? "--";
      parts.push(
        `dbg=${String(
          info.debug.mode
        )}${section}${stage} age=${ageText} mix=${dbgMix} acc=${accent} pulse=${pulse} src=${source}`
      );
    }
    if (info.userBank) parts.push(`user=[${fmtBank(info.userBank)}]`);
    if (info.aiBank) parts.push(`ai=[${fmtBank(info.aiBank)}]`);
    this.aivjText.textContent = parts.join(" | ");
  }

  updateProjectM(info: ProjectMInfo) {
    const frames = Number(info.framesRendered ?? 0);
    const rms = Number(info.lastAudioRms ?? 0);
    const peak = Number(info.lastAudioPeak ?? 0);
    const ok = info.lastAudioCopyOk;
    const n = Number(info.lastAudioSamplesPerChannel ?? 0);
    const avgLumaEnabled = Boolean((info as any).avgLumaEnabled);
    const avgLuma = Number((info as any).avgLuma);
    const avgColorR = Number((info as any).avgColorR);
    const avgColorG = Number((info as any).avgColorG);
    const avgColorB = Number((info as any).avgColorB);
    const perPm = (info as any).perPm ?? {};
    const fgPm = perPm?.fg ?? {};
    const bgPm = perPm?.bg ?? {};
    const fgLuma = Number(fgPm.avgLuma);
    const bgLuma = Number(bgPm.avgLuma);
    const fgColor = {
      r: Number(fgPm.avgColorR),
      g: Number(fgPm.avgColorG),
      b: Number(fgPm.avgColorB),
    };
    const bgColor = {
      r: Number(bgPm.avgColorR),
      g: Number(bgPm.avgColorG),
      b: Number(bgPm.avgColorB),
    };
    const piEnabled = Boolean((info as any).closedLoopPiEnabled);
    const piTarget = Number((info as any).closedLoopPiTarget);
    const piError = Number((info as any).closedLoopPiError);
    const piOpacity = Number((info as any).closedLoopPiOpacity);
    const colorLoopEnabled = Boolean((info as any).colorLoopEnabled);
    const colorLoopHue01 = Number((info as any).colorLoopHue01);
    const colorLoopStrength01 = Number((info as any).colorLoopStrength01);
    const colorLoopContrastMul = Number((info as any).colorLoopContrastMul);

    const init = info.initialized === false ? "init=0" : "init=1";
    const abort = info.aborted
      ? `abort=${String(info.abortReason ?? "1")}`
      : "abort=0";
    const copy = ok == null ? "copy=?" : ok ? "copy=ok" : "copy=FAIL";
    const samples = n ? `n=${n}` : "n=0";

    const parts: string[] = [];
    parts.push(init);
    parts.push(abort);
    parts.push(`frames=${Number.isFinite(frames) ? frames : 0}`);
    parts.push(copy);
    parts.push(samples);
    if (Number.isFinite(rms) && rms > 0) parts.push(`rms=${rms.toFixed(3)}`);
    if (Number.isFinite(peak) && peak > 0)
      parts.push(`peak=${peak.toFixed(3)}`);
    if (avgLumaEnabled && Number.isFinite(avgLuma)) {
      parts.push(`luma=${avgLuma.toFixed(3)}`);
    }
    if (
      Number.isFinite(avgColorR) &&
      Number.isFinite(avgColorG) &&
      Number.isFinite(avgColorB)
    ) {
      parts.push(
        `rgb=${avgColorR.toFixed(2)},${avgColorG.toFixed(
          2
        )},${avgColorB.toFixed(2)}`
      );
    }
    if (Number.isFinite(fgLuma)) parts.push(`lumaFg=${fgLuma.toFixed(3)}`);
    if (Number.isFinite(bgLuma)) parts.push(`lumaBg=${bgLuma.toFixed(3)}`);
    if (
      Number.isFinite(fgColor.r) &&
      Number.isFinite(fgColor.g) &&
      Number.isFinite(fgColor.b)
    ) {
      parts.push(
        `rgbFg=${fgColor.r.toFixed(2)},${fgColor.g.toFixed(
          2
        )},${fgColor.b.toFixed(2)}`
      );
    }
    if (
      Number.isFinite(bgColor.r) &&
      Number.isFinite(bgColor.g) &&
      Number.isFinite(bgColor.b)
    ) {
      parts.push(
        `rgbBg=${bgColor.r.toFixed(2)},${bgColor.g.toFixed(
          2
        )},${bgColor.b.toFixed(2)}`
      );
    }
    if (piEnabled) {
      if (Number.isFinite(piTarget)) parts.push(`piT=${piTarget.toFixed(2)}`);
      if (Number.isFinite(piError)) parts.push(`piE=${piError.toFixed(3)}`);
      if (Number.isFinite(piOpacity)) parts.push(`pi=${piOpacity.toFixed(3)}`);
    }
    if (colorLoopEnabled) {
      if (Number.isFinite(colorLoopHue01))
        parts.push(`cH=${colorLoopHue01.toFixed(2)}`);
      if (Number.isFinite(colorLoopStrength01))
        parts.push(`cS=${colorLoopStrength01.toFixed(2)}`);
      if (Number.isFinite(colorLoopContrastMul))
        parts.push(`cC=${colorLoopContrastMul.toFixed(2)}`);
    }
    this.projectmText.textContent = parts.join(" | ");
  }

  updateRuntimeDebug(info: {
    macroOwner: string | null;
    macroOwnerTtlMs: number;
    aivjManualHoldMs: number;
    midiLock: boolean;
    aivjEnabled: boolean;
    overlay: {
      energy01: number;
      depthFresh01: number;
      nActive: number;
      scale: number;
      meanOverlayMul: number;
      pmTarget: number;
      basic: number;
      camera: number;
      video: number;
      depth: number;
      projectm: number;
    };
    layers?: {
      liquid?: number;
      basic?: number;
      camera?: number;
      video?: number;
      depth?: number;
      pmFg?: { opacity?: number; drive?: number };
      pmBg?: { opacity?: number; drive?: number };
    };
    soak?: {
      avgLoadMs?: number;
      hardTop?: string[];
      softTop?: string[];
      aestheticTop?: string[];
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
      calibration?: {
        enabled?: boolean;
        autoOffMs?: number;
      };
    };
  }) {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const pct = (v: number) => `${Math.round(clamp01(v) * 100)}%`;

    const ttl = Number.isFinite(info.macroOwnerTtlMs)
      ? Math.max(0, Math.round(info.macroOwnerTtlMs))
      : 0;
    const hold = Number.isFinite(info.aivjManualHoldMs)
      ? Math.max(0, Math.round(info.aivjManualHoldMs))
      : 0;

    const owner = info.macroOwner ? String(info.macroOwner) : "--";
    this.writerText.textContent = [
      `owner=${owner}`,
      `ttl=${ttl}ms`,
      `aivj=${info.aivjEnabled ? "on" : "off"}`,
      `midiLock=${info.midiLock ? "1" : "0"}`,
      `manualHold=${hold}ms`,
    ].join(" | ");

    const o = info.overlay;
    this.overlayText.textContent = [
      `E=${pct(o.energy01)}`,
      `D=${pct(o.depthFresh01)}`,
      `n=${Math.max(0, Math.round(o.nActive))}`,
      `scale=${pct(o.scale)}`,
      `mean=${pct(o.meanOverlayMul)}`,
      `pmT=${pct(o.pmTarget)}`,
      `mul B${pct(o.basic)} C${pct(o.camera)} V${pct(o.video)} D${pct(
        o.depth
      )} PM${pct(o.projectm)}`,
    ].join(" | ");

    const layerInfo = info.layers;
    if (layerInfo) {
      const fmtPct = (value?: number) =>
        Number.isFinite(value) ? pct(Number(value)) : "--";
      const fmtSigned = (value?: number) => {
        if (!Number.isFinite(value)) return "--";
        const n = Number(value);
        const sign = n >= 0 ? "+" : "";
        return `${sign}${n.toFixed(2)}`;
      };

      const parts: string[] = [];
      const liquid = fmtPct(layerInfo.liquid);
      if (liquid !== "--") parts.push(`LQ ${liquid}`);

      const pmFg = layerInfo.pmFg;
      if (pmFg) {
        const op = fmtPct(pmFg.opacity);
        const drive = fmtSigned(pmFg.drive);
        parts.push(`PMF ${op}${drive !== "--" ? ` d${drive}` : ""}`);
      }
      const pmBg = layerInfo.pmBg;
      if (pmBg) {
        const op = fmtPct(pmBg.opacity);
        const drive = fmtSigned(pmBg.drive);
        parts.push(`PMB ${op}${drive !== "--" ? ` d${drive}` : ""}`);
      }

      const overlays: string[] = [];
      const pushOverlay = (label: string, value?: number) => {
        const op = fmtPct(value);
        if (op !== "--") overlays.push(`${label}${op}`);
      };
      pushOverlay("B", layerInfo.basic);
      pushOverlay("C", layerInfo.camera);
      pushOverlay("V", layerInfo.video);
      pushOverlay("D", layerInfo.depth);
      if (overlays.length) parts.push(overlays.join(" "));

      this.layersText.textContent = parts.length ? parts.join(" | ") : "--";
    } else {
      this.layersText.textContent = "--";
    }

    if (info.soak) {
      const avg = Number(info.soak.avgLoadMs ?? 0);
      const hardTop = Array.isArray(info.soak.hardTop)
        ? info.soak.hardTop.slice(0, 3).join(",")
        : "--";
      const softTop = Array.isArray(info.soak.softTop)
        ? info.soak.softTop.slice(0, 3).join(",")
        : "--";
      const aestheticTop = Array.isArray(info.soak.aestheticTop)
        ? info.soak.aestheticTop.slice(0, 3).join(",")
        : "--";
      this.soakText.textContent = [
        `avg=${Number.isFinite(avg) ? Math.round(avg) : 0}ms`,
        `hard=${hardTop || "--"}`,
        `soft=${softTop || "--"}`,
        `aest=${aestheticTop || "--"}`,
      ].join(" | ");
    } else {
      this.soakText.textContent = "--";
    }

    if (!info.controlPlane) {
      this.controlText.textContent = "--";
      return;
    }

    const g = info.controlPlane.gate ?? {};
    const cd = info.controlPlane.cooldown ?? {};
    const flags = info.controlPlane.freezeFlags ?? {};
    const action = info.controlPlane.scheduledAction ?? "--";
    const deny = (info.controlPlane.denyReasonsTop ?? []).slice(0, 3).join(",");
    const section = info.controlPlane.sectionState ?? "--";
    const finalWriter = info.controlPlane.finalWriter ?? "--";
    const lastEvent = info.controlPlane.lastEvent ?? "--";
    const phase = info.controlPlane.phase;
    const preset = info.controlPlane.preset;
    const stats = info.controlPlane.presetStats;
    const calib = info.controlPlane.calibration;
    const shortPreset = (id?: string | null) => {
      if (!id) return "--";
      const text = String(id);
      const tail = text.split("/").pop() ?? text;
      return tail.length > 16 ? `${tail.slice(0, 13)}...` : tail;
    };
    const gateText = `A${g.audioValid ? 1 : 0} B${g.beatTrusted ? 1 : 0} R${
      g.renderStable ? 1 : 0
    }`;
    const freezeText = `F${flags.rebuild ? 1 : 0}${flags.resCooldown ? 1 : 0}${
      flags.beatCooldown ? 1 : 0
    }`;
    const phaseText = phase
      ? `ph=${(phase.phase01 ?? 0).toFixed(2)} FG${phase.fgWindow ? 1 : 0} BG${
          phase.bgWindow ? 1 : 0
        }`
      : "ph=--";
    const presetText = preset
      ? `fg=${shortPreset(preset.fgId)} bg=${shortPreset(preset.bgId)}`
      : "fg=-- bg=--";
    const statsText = stats
      ? `H${Math.max(0, Math.round(stats.hardFails ?? 0))} S${Math.max(
          0,
          Math.round(stats.softFails ?? 0)
        )} E${Math.max(0, Math.round(stats.aestheticFails ?? 0))} A${Math.max(
          0,
          Math.round(stats.anchorFallbacks ?? 0)
        )}`
      : "H0 S0 E0 A0";
    const cooldownText = `cd=a${Math.max(
      0,
      Math.round(cd.audioMs ?? 0)
    )} b${Math.max(0, Math.round(cd.beatMs ?? 0))} r${Math.max(
      0,
      Math.round(cd.renderMs ?? 0)
    )} m3${Math.max(0, Math.round(cd.m3Ms ?? 0))} fg${Math.max(
      0,
      Math.round(cd.fgMs ?? 0)
    )} bg${Math.max(0, Math.round(cd.bgMs ?? 0))} fr${Math.max(
      0,
      Math.round(cd.fgRecentMs ?? 0)
    )} br${Math.max(0, Math.round(cd.bgRecentMs ?? 0))}`;
    const calibText = calib?.enabled
      ? `calib=on ${Math.max(0, Math.round(calib.autoOffMs ?? 0))}ms`
      : "calib=off";
    this.controlText.textContent = [
      `gate=${gateText}`,
      `sec=${section}`,
      `act=${action}`,
      `deny=${deny || "--"}`,
      cooldownText,
      phaseText,
      presetText,
      statsText,
      calibText,
      `freeze=${freezeText}`,
      `writer=${finalWriter}`,
      `evt=${lastEvent}`,
    ].join(" | ");
  }

  updateRenderer(info: RendererInfo) {
    const pr = Number(info.pixelRatio);
    const prText = Number.isFinite(pr) ? pr.toFixed(2) : "--";
    const cs = String(info.outputColorSpace);
    const tm = String(info.toneMapping);

    const c = info.compositor;
    const compText = c
      ? c.enabled
        ? `comp=on(${String(c.blendMode)}) ${
            c.targetMode === "fixed"
              ? `${Math.round(Number(c.fixedWidth))}x${Math.round(
                  Number(c.fixedHeight)
                )}`
              : "viewport"
          } pool=${Math.max(0, Math.round(Number(c.poolSize)))}${
            c.shaderVersion ? ` sh=${String(c.shaderVersion)}` : ""
          }${c.rtColorSpace ? ` rt=${String(c.rtColorSpace)}` : ""}`
        : "comp=off"
      : "";

    const cpuMs = c ? Number(c.cpuMsLastFrame) : NaN;
    const passes = c ? Number(c.passesLastFrame) : NaN;
    const cpuText =
      Number.isFinite(cpuMs) && cpuMs > 0
        ? `cpu=${cpuMs.toFixed(2)}ms${
            Number.isFinite(passes)
              ? ` p=${Math.max(0, Math.round(passes))}`
              : ""
          }`
        : "";
    const rtW = c ? Number(c.rtWidth) : NaN;
    const rtH = c ? Number(c.rtHeight) : NaN;
    const rtText =
      Number.isFinite(rtW) && Number.isFinite(rtH) && rtW > 0 && rtH > 0
        ? `rt=${Math.round(rtW)}x${Math.round(rtH)}`
        : "";

    this.rendererText.textContent = [
      `pr=${prText}`,
      `cs=${cs}`,
      `tm=${tm}`,
      compText,
      cpuText,
      rtText,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  private addTextRow(title: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "nw-diag-row";

    const label = document.createElement("div");
    label.className = "nw-diag-label";
    label.textContent = title;

    const value = document.createElement("div");
    value.className = "nw-diag-value";
    value.textContent = "--";

    row.appendChild(label);
    row.appendChild(value);
    this.root.appendChild(row);
    return value;
  }

  private addBarRow(title: string): {
    fill: HTMLDivElement;
    value: HTMLDivElement;
  } {
    const row = document.createElement("div");
    row.className = "nw-diag-row";

    const label = document.createElement("div");
    label.className = "nw-diag-label";
    label.textContent = title;

    const value = document.createElement("div");
    value.className = "nw-diag-value";

    const bar = document.createElement("div");
    bar.className = "nw-diag-bar";
    const fill = document.createElement("div");
    fill.className = "nw-diag-barFill";
    bar.appendChild(fill);

    const text = document.createElement("div");
    text.className = "nw-diag-barValue";
    text.textContent = "--";

    value.appendChild(bar);
    value.appendChild(text);

    row.appendChild(label);
    row.appendChild(value);
    this.root.appendChild(row);
    return { fill, value: text };
  }

  dispose() {
    try {
      this.root.remove();
    } catch {
      // ignore
    }
  }
}
