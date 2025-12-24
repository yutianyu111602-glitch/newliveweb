export type MixxxConnState = 'idle' | 'connecting' | 'connected' | 'error';

export type MediaElementStatusSnapshot = {
  networkState: number;
  readyState: number;
  ended: boolean;
  paused: boolean;
  errorCode: number | null;
};

export type MixxxSnapshot = {
  state: MixxxConnState;
  url: string | null;
  lastErrorName: string | null;
  retries: number;
};

export type MixxxConnector = {
  connect: (manual: boolean) => Promise<void>;
  resetSession: () => void;
  getSnapshot: () => MixxxSnapshot;
  checkStreamHealth: (status: MediaElementStatusSnapshot | null) => void;
  prefillUrlInput: (input: HTMLInputElement | null | undefined) => void;
};

export function createMixxxConnector(opts: {
  urlStorageKey: string;
  setPreferredSourceTrack: () => void;
  getUrlFromUi: () => string;
  loadUrlAsLiveStream: (url: string) => Promise<void>;
  setStatus: (message: string, isError?: boolean) => void;
  enablePlaybackControls: () => void;
  updatePlayButton: () => void;
}) : MixxxConnector {
  const {
    urlStorageKey,
    setPreferredSourceTrack,
    getUrlFromUi,
    loadUrlAsLiveStream,
    setStatus,
    enablePlaybackControls,
    updatePlayButton,
  } = opts;

  const MIXXX_RETRY_MAX = 5;
  const MIXXX_RETRY_BASE_MS = 750;
  const MIXXX_RETRY_MAX_MS = 15000;

  let mixxx: MixxxSnapshot & { retryTimer: number | null } = {
    state: 'idle',
    url: null,
    lastErrorName: null,
    retries: 0,
    retryTimer: null,
  };

  function cancelRetry() {
    if (mixxx.retryTimer != null) {
      window.clearTimeout(mixxx.retryTimer);
      mixxx.retryTimer = null;
    }
  }

  function resetSession() {
    cancelRetry();
    mixxx = { state: 'idle', url: null, lastErrorName: null, retries: 0, retryTimer: null };
  }

  function scheduleRetry() {
    if (mixxx.state !== 'error') return;
    if (!mixxx.url) return;
    if (mixxx.retries >= MIXXX_RETRY_MAX) return;

    cancelRetry();
    const delay = Math.min(MIXXX_RETRY_MAX_MS, MIXXX_RETRY_BASE_MS * Math.pow(2, mixxx.retries));
    mixxx.retries += 1;
    mixxx.retryTimer = window.setTimeout(() => {
      void connect(false);
    }, delay);
  }

  async function connect(manual: boolean) {
    const url = String(getUrlFromUi() ?? '').trim();
    if (!url) {
      setStatus('Enter Mixxx stream URL first (Audio URL input)', true);
      return;
    }

    cancelRetry();
    mixxx.url = url;
    mixxx.state = 'connecting';
    mixxx.lastErrorName = null;
    if (manual) mixxx.retries = 0;

    try {
      localStorage.setItem(urlStorageKey, url);
    } catch {
      // ignore
    }

    setStatus('🎛️ Mixxx: connecting…');

    try {
      await loadUrlAsLiveStream(url);
      setPreferredSourceTrack();
      mixxx.state = 'connected';
      mixxx.lastErrorName = null;
      mixxx.retries = 0;
      setStatus('🎛️ Mixxx: connected');
      enablePlaybackControls();
      updatePlayButton();
    } catch (error) {
      const e = error as { name?: unknown };
      mixxx.state = 'error';
      mixxx.lastErrorName = typeof e?.name === 'string' ? e.name : 'Error';
      const suffix = mixxx.lastErrorName ? ` (${mixxx.lastErrorName})` : '';
      setStatus(`🎛️ Mixxx: error${suffix} (see console)`, true);
      // eslint-disable-next-line no-console
      console.error('Mixxx connect failed:', error);
      scheduleRetry();
    }
  }

  function checkStreamHealth(status: MediaElementStatusSnapshot | null) {
    if (mixxx.state !== 'connected' || !mixxx.url) return;
    if (!status) return;

    if (status.errorCode != null || status.ended) {
      mixxx.state = 'error';
      mixxx.lastErrorName = status.errorCode != null ? `MediaError(${status.errorCode})` : 'ended';
      setStatus(`🎛️ Mixxx: disconnected (${mixxx.lastErrorName})`, true);
      scheduleRetry();
    }
  }

  function prefillUrlInput(input: HTMLInputElement | null | undefined) {
    if (!input) return;
    try {
      const remembered = localStorage.getItem(urlStorageKey);
      if (remembered && !String(input.value ?? '').trim()) {
        input.value = remembered;
      }
    } catch {
      // ignore
    }
  }

  return {
    connect,
    resetSession: resetSession,
    getSnapshot: () => ({ state: mixxx.state, url: mixxx.url, lastErrorName: mixxx.lastErrorName, retries: mixxx.retries }),
    checkStreamHealth,
    prefillUrlInput,
  };
}
