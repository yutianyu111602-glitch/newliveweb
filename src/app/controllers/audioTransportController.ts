import type { AudioBus } from "../../audio/AudioBus";
import type { AudioFrame } from "../../types/audioFrame";
import {
  createMixxxConnector,
  type MixxxConnector,
} from "../bindings/mixxxConnector";
import {
  bindButton,
  bindFileInput,
  bindInputValue,
  bindSelect,
  listen,
  type DomBinding,
} from "../bindings/domBindings";

export type AudioTransportDom = {
  fileInput: HTMLInputElement | null | undefined;
  urlInput: HTMLInputElement | null | undefined;
  urlButton: HTMLButtonElement | null | undefined;
  mixxxConnectButton: HTMLButtonElement | null | undefined;
  toggleButton: HTMLButtonElement | null | undefined;
  inputDeviceSelect: HTMLSelectElement | null | undefined;
  inputUseButton: HTMLButtonElement | null | undefined;
  systemAudioUseButton: HTMLButtonElement | null | undefined;
  volumeSlider: HTMLInputElement | null | undefined;
  volumeText: HTMLElement | null | undefined;
  seekSlider: HTMLInputElement | null | undefined;
  statusLabel: HTMLElement | null | undefined;
  timeLabel: HTMLElement | null | undefined;
  audioLevelBar: HTMLElement | null | undefined;
  audioLevelText: HTMLElement | null | undefined;
};

export type AudioTransportKeys = {
  preferredSourceKey: string;
  inputDeviceIdKey: string;
  trackVolumeKey: string;
  mixxxUrlKey: string;
};

export type AudioTransportController = {
  mixxxConnector: MixxxConnector | null;
  refreshAudioInputDevices: () => Promise<void>;
  useSelectedAudioInputDevice: () => Promise<void>;
  useSystemAudioCapture: () => Promise<void>;
  tryAutoLoadDefaultAudio: () => Promise<void>;
  bindAudioResumeOnGesture: () => void;
  updateTimeline: () => void;
  syncAiDebugUiState: () => void;
  updatePlayButton: () => void;
  onAudioFrame: (frame: AudioFrame) => void;
  applyShowAudio: (audio: {
    inputDeviceId: string | null;
    volume: number;
  }) => Promise<void>;
  dispose?: () => void;
};

export function initAudioTransportController(opts: {
  dom: AudioTransportDom;
  audioBus: AudioBus;
  storage: Storage;
  keys: AudioTransportKeys;
  isShowMode: boolean;
  testTrack: {
    url: string;
    filePath: string;
    shouldAutoLoad: () => boolean;
  };
  setStatus: (message: string, isError?: boolean) => void;
  onStatusUpdated?: () => void;
}): AudioTransportController {
  const { dom, audioBus, storage, keys, isShowMode, testTrack, setStatus } =
    opts;

  const fileInput = dom.fileInput;
  const urlInput = dom.urlInput;
  const urlButton = dom.urlButton;
  const mixxxConnectButton = dom.mixxxConnectButton;
  const toggleButton = dom.toggleButton;
  const inputDeviceSelect = dom.inputDeviceSelect;
  const inputUseButton = dom.inputUseButton;
  const systemAudioUseButton = dom.systemAudioUseButton;
  const volumeSlider = dom.volumeSlider;
  const volumeText = dom.volumeText;
  const seekSlider = dom.seekSlider;
  const statusLabel = dom.statusLabel;
  const timeLabel = dom.timeLabel;
  const audioLevelBar = dom.audioLevelBar;
  const audioLevelText = dom.audioLevelText;

  const audioSectionEl =
    (statusLabel?.closest?.(".toolbar__section") as HTMLElement | null) ?? null;

  let autoAudioAttempted = false;
  let audioResumeBound = false;
  let seekActive = false;
  let mixxxConnector: MixxxConnector | null = null;

  let disposed = false;

  const uiBindings: DomBinding[] = [];

  const dispose = () => {
    if (disposed) return;
    disposed = true;

    for (const b of uiBindings.splice(0)) {
      try {
        b.dispose();
      } catch {
        // ignore
      }
    }

    // Cancels any retry timers.
    resetMixxxSession();
  };

  function escapeHtml(text: string) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp01Local(value: unknown, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }

  function setVolumeUi(gain01: number) {
    const g = clamp01Local(gain01, 0.8);
    const pct = Math.round(g * 100);
    if (volumeSlider) volumeSlider.value = String(pct);
    if (volumeText) volumeText.textContent = `${pct}%`;
  }

  function getStoredTrackVolume(): number | null {
    try {
      const raw = storage.getItem(keys.trackVolumeKey);
      if (raw == null) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(1, n));
    } catch {
      return null;
    }
  }

  function applyTrackVolumeFromStorage(fallback = 0.8) {
    const v = getStoredTrackVolume() ?? fallback;
    audioBus.setVolume(clamp01Local(v, fallback));
    setVolumeUi(v);
  }

  function enablePlaybackControls() {
    if (toggleButton?.disabled) {
      toggleButton.disabled = false;
    }
  }

  function updatePlayButton() {
    if (!toggleButton) return;
    if (isShowMode) {
      toggleButton.textContent = "Input only";
      toggleButton.disabled = true;
      return;
    }
    if (audioBus.currentSource === "stream") {
      toggleButton.textContent = "Track";
      return;
    }
    toggleButton.textContent = audioBus.isPlaying ? "Pause" : "Play";
  }

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) {
      return "00:00";
    }
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const updateTimeline = () => {
    if (!timeLabel) return;
    const currentSec = audioBus.currentTime;
    const current = formatTime(currentSec);
    if (audioBus.currentSource === "stream") {
      timeLabel.textContent = `${current} / LIVE`;
      if (seekSlider) {
        seekSlider.disabled = true;
        if (!seekActive) seekSlider.value = "0";
      }
      return;
    }
    const duration = audioBus.duration;
    const total =
      Number.isFinite(duration) && duration > 0
        ? formatTime(duration)
        : "--:--";
    timeLabel.textContent = `${current} / ${total}`;

    if (seekSlider) {
      const canSeek =
        Number.isFinite(duration) && duration > 0 && audioBus.isReady;
      seekSlider.disabled = !canSeek;
      if (canSeek && !seekActive) {
        const t = Math.max(0, Math.min(1, currentSec / duration));
        seekSlider.value = String(Math.round(t * 1000));
      }
      if (!canSeek && !seekActive) {
        seekSlider.value = "0";
      }
    }
  };

  function resetMixxxSession() {
    mixxxConnector?.resetSession();
  }

  function syncAiDebugUiState() {
    const audioStatusEl = statusLabel as HTMLElement | null;
    const targets = [audioSectionEl, audioStatusEl].filter(
      (x): x is HTMLElement => !!x
    );
    if (!targets.length) return;

    const mixxxSnap = mixxxConnector?.getSnapshot?.() ?? null;
    const connectionState =
      mixxxSnap && mixxxSnap.state !== "idle" ? mixxxSnap.state : null;

    const audioState = (() => {
      if (!audioBus.isReady) return "idle";
      if (audioBus.currentSource === "stream") {
        return audioBus.audioContextState === "running" ? "playing" : "paused";
      }
      return audioBus.isPlaying ? "playing" : "paused";
    })();

    for (const el of targets) {
      el.dataset.audioState = audioState;
      if (connectionState) el.dataset.connectionState = connectionState;
      else delete el.dataset.connectionState;
    }

    if (audioStatusEl) {
      if (connectionState && connectionState !== "connected") {
        const detail =
          connectionState === "error"
            ? mixxxSnap?.lastErrorName ?? "error"
            : connectionState;
        audioStatusEl.setAttribute("data-ai-alert", String(detail));
      } else {
        audioStatusEl.removeAttribute("data-ai-alert");
      }
    }
  }

  async function refreshAudioInputDevices() {
    if (!inputDeviceSelect) return;
    if (
      !("mediaDevices" in navigator) ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      inputDeviceSelect.innerHTML = '<option value="">系统默认</option>';
      return;
    }

    const classifyInput = (label: string): { tag: string; rank: number } => {
      const hay = label.toLowerCase();
      const isLoopback =
        hay.includes("loopback") ||
        hay.includes("stereo mix") ||
        hay.includes("立体声混音") ||
        hay.includes("blackhole") ||
        hay.includes("soundflower") ||
        hay.includes("vb-audio") ||
        hay.includes("vb cable") ||
        hay.includes("cable output") ||
        hay.includes("voicemeeter") ||
        hay.includes("virtual") ||
        hay.includes("monitor of") ||
        hay.includes("wasapi") ||
        hay.includes("mix") ||
        hay.includes("回放");

      if (isLoopback) return { tag: "【回环/声卡回放】", rank: 0 };
      if (
        hay.includes("mic") ||
        hay.includes("microphone") ||
        hay.includes("麦克风")
      )
        return { tag: "【麦克风】", rank: 2 };
      return { tag: "【输入】", rank: 1 };
    };

    const formatLabel = (label: string, deviceId: string): string => {
      const safeLabel = label || `音频输入（${deviceId.slice(0, 8)}…）`;
      const { tag } = classifyInput(safeLabel);
      return `${tag} ${safeLabel}`;
    };

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const remembered = storage.getItem(keys.inputDeviceIdKey) ?? "";

      const options = [
        { id: "", label: "系统默认", rawLabel: "" },
        ...inputs
          .map((d) => ({
            id: d.deviceId,
            rawLabel: d.label ? d.label : "",
            label: formatLabel(d.label ? d.label : "", d.deviceId),
          }))
          .sort((a, b) => {
            const ar = classifyInput(a.rawLabel || a.label).rank;
            const br = classifyInput(b.rawLabel || b.label).rank;
            return ar - br;
          }),
      ];

      inputDeviceSelect.innerHTML = options
        .map(
          (o: any) =>
            `<option value="${escapeHtml(o.id)}">${escapeHtml(
              o.label
            )}</option>`
        )
        .join("");

      if (remembered) inputDeviceSelect.value = remembered;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("enumerateDevices failed:", err);
      inputDeviceSelect.innerHTML = '<option value="">系统默认</option>';
    }
  }

  async function useSelectedAudioInputDevice() {
    const deviceId = String(inputDeviceSelect?.value ?? "");
    try {
      resetMixxxSession();
      await audioBus.loadInputDevice(deviceId || undefined);
      // Ensure analysis graph starts immediately (some browsers keep the context suspended
      // unless explicitly resumed from a user gesture).
      await audioBus.resumeContext();
      storage.setItem(keys.preferredSourceKey, "input");
      if (deviceId) storage.setItem(keys.inputDeviceIdKey, deviceId);
      else storage.removeItem(keys.inputDeviceIdKey);

      await refreshAudioInputDevices();

      audioBus.setVolume(0);
      setVolumeUi(0);

      const label = audioBus.inputSourceInfo.label;
      setStatus(label ? `🎚️ 已使用输入：${label}` : "🎚️ 已使用输入：系统默认");

      if (label) {
        const hay = label.toLowerCase();
        const looksLikeLoopback =
          hay.includes("loopback") ||
          hay.includes("stereo mix") ||
          hay.includes("blackhole") ||
          hay.includes("soundflower") ||
          hay.includes("vb-audio") ||
          hay.includes("voicemeeter") ||
          hay.includes("cable") ||
          hay.includes("monitor of");
        if (!looksLikeLoopback) {
          setStatus(
            "提示：如果你要抓“电脑播放的声音”，请选择回环/虚拟声卡设备（Loopback/BlackHole/Stereo Mix/VB-CABLE 等）",
            false
          );
        }
      }

      enablePlaybackControls();
      updatePlayButton();
    } catch (error) {
      const e = error as any;
      const name = typeof e?.name === "string" ? e.name : "";
      // eslint-disable-next-line no-console
      if (name === "NotSupportedError") {
        console.warn("Audio input capture not supported:", error);
      } else {
        console.error("Audio input capture failed:", error);
      }

      const message = (() => {
        if (name === "NotAllowedError" || name === "SecurityError") {
          return "音频输入权限被拒绝（检查浏览器权限）";
        }
        if (name === "NotFoundError" || name === "OverconstrainedError") {
          return "找不到匹配的音频输入设备";
        }
        if (name === "NotReadableError" || name === "AbortError") {
          return "音频输入设备被占用/不可用";
        }
        if (name === "NotSupportedError") {
          return "当前环境不支持音频输入捕获";
        }
        return "无法使用该输入设备（看控制台日志）";
      })();

      setStatus(message, true);
    }
  }

  async function useSystemAudioCapture() {
    if (
      !("mediaDevices" in navigator) ||
      typeof navigator.mediaDevices.getDisplayMedia !== "function"
    ) {
      setStatus("当前浏览器不支持“系统音频捕获”（需要 Chrome/Edge 等）", true);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      resetMixxxSession();
      setStatus(
        "请选择一个“标签页/窗口/屏幕”，并勾选“共享音频”（Share audio）…"
      );

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      } as unknown as any);

      const audioTracks = stream.getAudioTracks?.() ?? [];
      if (!audioTracks.length) {
        try {
          for (const t of stream.getTracks()) t.stop();
        } catch {
          // ignore
        }
        stream = null;
        setStatus(
          "未获取到系统音频：请优先选择“标签页”并勾选“共享音频/Share audio”",
          true
        );
        return;
      }

      try {
        for (const t of stream.getVideoTracks()) t.stop();
      } catch {
        // ignore
      }

      await audioBus.loadMediaStream(stream, {
        label: "系统音频捕获",
        kind: "system",
      });
      // Start the AudioContext immediately so UI (meter/waveform) reflects the capture.
      await audioBus.resumeContext();
      storage.setItem(keys.preferredSourceKey, "input");
      if (inputDeviceSelect) inputDeviceSelect.value = "";
      storage.removeItem(keys.inputDeviceIdKey);

      audioBus.setVolume(0);
      setVolumeUi(0);

      const label = String(audioTracks[0]?.label ?? "").trim();
      const labelText = label ? ` | ${label}` : "";
      setStatus(`🔊 系统音频捕获已开启（看“电平”确认有信号）${labelText}`);
      enablePlaybackControls();
      updatePlayButton();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("System audio capture failed:", error);
      if (stream) {
        try {
          for (const t of stream.getTracks()) t.stop();
        } catch {
          // ignore
        }
        stream = null;
      }
      const e = error as any;
      const name = typeof e?.name === "string" ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("系统音频捕获被拒绝（检查浏览器共享权限）", true);
        return;
      }
      setStatus("系统音频捕获失败（看控制台日志）", true);
    }
  }

  async function tryAutoLoadDefaultAudio() {
    if (isShowMode) return;
    if (autoAudioAttempted) return;
    autoAudioAttempted = true;

    bindAudioResumeOnGesture();
  }

  function bindAudioResumeOnGesture() {
    if (audioResumeBound) return;
    audioResumeBound = true;
    const resume = (ev?: Event) => {
      const t = (ev?.target as HTMLElement | null) ?? null;
      if (
        t &&
        (t.closest?.("#audio-input-use") ||
          t.closest?.("#audio-input-device") ||
          t.closest?.("#show-setup"))
      ) {
        return;
      }

      // Always try to resume the audio context on the first user gesture.
      // This is required by autoplay policies and affects both track playback and live analysis.
      try {
        void audioBus.resumeContext();
      } catch {
        // ignore
      }

      const preferred = storage.getItem(keys.preferredSourceKey);
      // Default behavior: use system-default audio input.
      // We do this on a user gesture to satisfy autoplay/permission policies.
      if (!isShowMode && (preferred === "input" || preferred == null)) {
        void useSelectedAudioInputDevice();
        return;
      }

      // Never auto-load a test track in show mode.
      if (isShowMode) return;

      if (!testTrack.shouldAutoLoad()) {
        setStatus(
          "Test track auto-load skipped (set ?testTrackPath=... to enable)"
        );
        return;
      }
      if (!audioBus.isReady) {
        // eslint-disable-next-line no-console
        console.log(`[Audio] Attempting to load: ${testTrack.url}`);
        // eslint-disable-next-line no-console
        console.log(`[Audio] File path: ${testTrack.filePath}`);

        const loadPromise = audioBus.loadUrl(testTrack.url);
        void (async () => {
          try {
            const head = await fetch(testTrack.url, { method: "HEAD" }).catch(
              () => null
            );
            if (head && !head.ok) {
              // eslint-disable-next-line no-console
              console.warn(
                `[Audio] HEAD not ok: ${head.status} ${head.statusText}`
              );
            }

            await loadPromise;

            applyTrackVolumeFromStorage(0.8);

            setStatus(`✅ Loaded: ${testTrack.filePath}`);
            enablePlaybackControls();
            updatePlayButton();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Test track auto-load failed:", error);
            // eslint-disable-next-line no-console
            console.log("Check if file exists at:", testTrack.filePath);
            // eslint-disable-next-line no-console
            console.log(
              "Tip: pass ?testTrackPath=/abs/path/to/file.mp3 to configure a local test track"
            );
            setStatus(`⚠️ Test track unavailable (see console)`, true);
          }
        })();
      } else {
        applyTrackVolumeFromStorage(0.8);
      }
    };

    uiBindings.push({
      sync: () => {},
      dispose: listen(window, "pointerdown", resume, { once: true }),
    });
    uiBindings.push({
      sync: () => {},
      dispose: listen(window, "keydown", resume, { once: true }),
    });
  }

  async function applyShowAudio(audio: {
    inputDeviceId: string | null;
    volume: number;
  }) {
    if (inputDeviceSelect) inputDeviceSelect.value = audio.inputDeviceId ?? "";
    await useSelectedAudioInputDevice();
    audioBus.setVolume(clamp01Local(audio.volume, 0));
    setVolumeUi(clamp01Local(audio.volume, 0));
  }

  function initMixxxConnector() {
    mixxxConnector = createMixxxConnector({
      urlStorageKey: keys.mixxxUrlKey,
      getUrlFromUi: () => String(urlInput?.value ?? ""),
      loadUrlAsLiveStream: async (url) => {
        await audioBus.loadUrl(url, { loop: false });
      },
      setPreferredSourceTrack: () => {
        try {
          storage.setItem(keys.preferredSourceKey, "track");
        } catch {
          // ignore
        }
      },
      setStatus,
      enablePlaybackControls,
      updatePlayButton,
    });

    mixxxConnector.prefillUrlInput(urlInput);

    return mixxxConnector;
  }

  function initSeekHandling() {
    if (!seekSlider) return;

    const commitSeek = () => {
      seekActive = false;
      const duration = audioBus.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (audioBus.currentSource === "stream") return;
      const ratio = clamp01Local(Number(seekSlider.value) / 1000, 0);
      audioBus.seek(duration * ratio);
    };

    const onSeekPointerDown = () => {
      seekActive = true;
    };
    const onSeekBlur = () => {
      seekActive = false;
    };
    const onSeekInput = () => {
      const duration = audioBus.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (audioBus.currentSource === "stream") return;
      const ratio = clamp01Local(Number(seekSlider.value) / 1000, 0);
      const previewSec = duration * ratio;
      const total = formatTime(duration);
      if (timeLabel)
        timeLabel.textContent = `${formatTime(previewSec)} / ${total}`;
    };

    uiBindings.push({
      sync: () => {},
      dispose: listen(seekSlider, "pointerdown", onSeekPointerDown),
    });
    uiBindings.push({
      sync: () => {},
      dispose: listen(seekSlider, "pointerup", commitSeek),
    });
    uiBindings.push({
      sync: () => {},
      dispose: listen(seekSlider, "change", commitSeek),
    });
    uiBindings.push({
      sync: () => {},
      dispose: listen(seekSlider, "blur", onSeekBlur),
    });
    uiBindings.push({
      sync: () => {},
      dispose: listen(seekSlider, "input", onSeekInput),
    });
  }

  function initUiHandlers() {
    uiBindings.push(
      bindFileInput({
        el: fileInput,
        set: async (file) => {
          try {
            resetMixxxSession();
            await audioBus.loadFile(file);
            setStatus(`Loaded: ${file.name}`);
            enablePlaybackControls();
            updatePlayButton();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Audio load failed", error);
            setStatus("Failed to load file", true);
          }
        },
      })
    );

    uiBindings.push(
      bindButton(urlButton ?? null, () => {
        void (async () => {
          const url = urlInput?.value.trim();
          if (!url) {
            setStatus("Enter an audio URL first", true);
            return;
          }
          try {
            resetMixxxSession();
            await audioBus.loadUrl(url);
            setStatus(`Streaming: ${url}`);
            enablePlaybackControls();
            updatePlayButton();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Audio URL load failed", error);
            setStatus("Unable to load URL", true);
          }
        })();
      })
    );

    uiBindings.push(
      bindButton(mixxxConnectButton ?? null, () => {
        void mixxxConnector?.connect(true);
      })
    );

    const onToggleClick = () => {
      if (isShowMode) {
        setStatus("Show mode: input only", true);
        updatePlayButton();
        return;
      }

      if (!audioBus.isReady) {
        if (!testTrack.url) {
          setStatus(
            "No audio loaded (use File/URL, or pass ?testTrackPath=...)",
            true
          );
          return;
        }
        void (async () => {
          try {
            setStatus("Loading test track…");
            await audioBus.loadUrl(testTrack.url);
            applyTrackVolumeFromStorage(0.8);
            audioBus.play();
            setStatus(`✅ Using test track: ${testTrack.filePath}`);
            enablePlaybackControls();
            updatePlayButton();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Load test track failed:", error);
            setStatus("Unable to load test track (see console)", true);
          }
        })();
        return;
      }

      if (audioBus.currentSource === "stream") {
        void (async () => {
          try {
            storage.setItem(keys.preferredSourceKey, "track");

            if (!testTrack.url) {
              setStatus(
                "No test track configured (use File/URL, or pass ?testTrackPath=...)",
                true
              );
              return;
            }

            setStatus("Switching to test track…");
            await audioBus.loadUrl(testTrack.url);

            applyTrackVolumeFromStorage(0.8);

            audioBus.play();
            setStatus(`✅ Using test track: ${testTrack.filePath}`);
            enablePlaybackControls();
            updatePlayButton();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Switch to test track failed:", error);
            setStatus("Unable to switch to test track (see console)", true);
          }
        })();
        return;
      }

      audioBus.toggle();
      updatePlayButton();
    };
    uiBindings.push(bindButton(toggleButton ?? null, onToggleClick));

    void refreshAudioInputDevices();
    uiBindings.push(
      bindButton(inputUseButton ?? null, () => {
        try {
          audioBus.prewarmContext();
        } catch {
          // ignore
        }
        void useSelectedAudioInputDevice();
      })
    );

    uiBindings.push(
      bindSelect({
        el: inputDeviceSelect ?? null,
        get: () => String(inputDeviceSelect?.value ?? ""),
        set: (deviceIdRaw) => {
          const deviceId = String(deviceIdRaw ?? "");

          try {
            audioBus.prewarmContext();
          } catch {
            // ignore
          }
          try {
            if (deviceId) storage.setItem(keys.inputDeviceIdKey, deviceId);
            else storage.removeItem(keys.inputDeviceIdKey);
          } catch {
            // ignore
          }

          void useSelectedAudioInputDevice();
        },
      })
    );

    uiBindings.push(
      bindButton(systemAudioUseButton ?? null, () => {
        try {
          audioBus.prewarmContext();
        } catch {
          // ignore
        }
        void useSystemAudioCapture();
      })
    );

    uiBindings.push(
      bindInputValue({
        el: volumeSlider ?? null,
        event: "input",
        get: () => String(volumeSlider?.value ?? "0"),
        set: (raw) => {
          const pct = Number(raw);
          const gain = clamp01Local(pct / 100, 0.8);
          audioBus.setVolume(gain);
          if (volumeText) volumeText.textContent = `${Math.round(gain * 100)}%`;

          if (!isShowMode && audioBus.currentSource !== "stream") {
            try {
              storage.setItem(keys.trackVolumeKey, String(gain));
            } catch {
              // ignore
            }
          }
        },
      })
    );
  }

  // UI meter smoothing: fast attack + slow release.
  let uiMeterEnv = 0;
  let uiMeterPeak = 0;
  let uiMeterLastMs = performance.now();
  let uiMeterNoiseRms = 0;

  function clamp01ForMeter(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function computeUiMeterLevel(frame: AudioFrame): number {
    const now = performance.now();
    const dtSec = Math.max(0.001, (now - uiMeterLastMs) / 1000);
    uiMeterLastMs = now;

    // Prefer post-gain signal so the meter matches the visual-driving audio.
    const peak = clamp01ForMeter(frame.peak ?? (frame as any).peakRaw);
    const rms = clamp01ForMeter(frame.rms ?? (frame as any).rmsRaw);

    // UI-silence should be based on the same signal we display (raw when available).
    const reportedSilent = Boolean(
      (frame as any).isSilent ?? (frame as any).isSilentRaw
    );
    const inferredSilent = peak < 1e-3 && rms < 1e-3;
    const uiSilent = reportedSilent || inferredSilent;

    // If the pipeline reports silence, clamp aggressively (prevents “stuck” meters).
    if (uiSilent && peak < 0.02 && rms < 0.01) {
      uiMeterPeak = Math.max(0, uiMeterPeak - dtSec * 2.0);
      uiMeterEnv = uiMeterEnv + (0 - uiMeterEnv) * (1 - Math.exp(-dtSec * 10));
      return Math.max(0, Math.min(1, uiMeterEnv));
    }

    // Display mapping: prefer RMS for stability; keep some peak influence for responsiveness.
    // This keeps the meter readable while avoiding 1↔100 spikes from transient peaks.
    const baseRaw = Math.min(1, Math.max(0, Math.max(rms * 3.2, peak * 0.6)));
    // Noise floor gate: learn a baseline RMS in low-activity periods to avoid “~20% on silence”.
    // This only affects UI display (not the visual-driving audio).
    const trackNoise = peak < 0.06;
    if (trackNoise) {
      const noiseAlpha = 1 - Math.exp(-dtSec * 0.6);
      uiMeterNoiseRms = uiMeterNoiseRms + (rms - uiMeterNoiseRms) * noiseAlpha;
    }
    const floor = Math.max(0.005, Math.min(0.25, uiMeterNoiseRms * 2.8));
    const base = baseRaw <= floor ? 0 : (baseRaw - floor) / (1 - floor);
    const level = 1 - Math.exp(-base * 3.6);

    const attack = 1 - Math.exp(-dtSec * 18);
    const release = 1 - Math.exp(-dtSec * 5.5);
    uiMeterEnv =
      level >= uiMeterEnv
        ? uiMeterEnv + (level - uiMeterEnv) * attack
        : uiMeterEnv + (level - uiMeterEnv) * release;

    uiMeterPeak = Math.max(level, uiMeterPeak - dtSec * 0.9);

    return Math.max(uiMeterEnv, uiMeterPeak * 0.92);
  }

  function onAudioFrame(frame: AudioFrame) {
    if (audioLevelBar && audioLevelText) {
      const level = computeUiMeterLevel(frame);
      const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
      audioLevelBar.style.width = `${pct}%`;
      audioLevelText.textContent = `电平：${pct}%`;
    }
  }

  // Initialize UI from persisted Track volume (before any audio loads).
  if (!isShowMode) {
    setVolumeUi(getStoredTrackVolume() ?? 0.8);
  }

  initMixxxConnector();
  initSeekHandling();
  initUiHandlers();

  if (isShowMode) {
    if (fileInput) fileInput.disabled = true;
    if (urlInput) urlInput.disabled = true;
    if (urlButton) urlButton.disabled = true;
    if (mixxxConnectButton) mixxxConnectButton.disabled = true;
    if (toggleButton) toggleButton.disabled = true;
    if (volumeSlider) {
      volumeSlider.disabled = true;
      volumeSlider.value = "0";
    }
    if (volumeText) volumeText.textContent = "0%";
    updatePlayButton();
    setStatus("Show mode: input only (use Input + Use input / Show)");
  }

  if (opts.onStatusUpdated) {
    try {
      opts.onStatusUpdated();
    } catch {
      // ignore
    }
  }

  return {
    mixxxConnector,
    refreshAudioInputDevices,
    useSelectedAudioInputDevice,
    useSystemAudioCapture,
    tryAutoLoadDefaultAudio,
    bindAudioResumeOnGesture,
    updateTimeline,
    syncAiDebugUiState,
    updatePlayButton,
    onAudioFrame,
    applyShowAudio,
    dispose,
  };
}
