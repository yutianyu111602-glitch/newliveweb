import { listen } from "../bindings/domBindings";

export function initMediaDevicesChangeController(opts: {
  onChange: () => void;
  navigatorObj?: Navigator;
}) {
  const { onChange, navigatorObj = navigator } = opts;

  if (
    !navigatorObj ||
    !("mediaDevices" in navigatorObj) ||
    typeof navigatorObj.mediaDevices?.addEventListener !== "function"
  ) {
    return;
  }

  const handler = () => {
    try {
      onChange();
    } catch {
      // ignore
    }
  };

  const dispose = listen(navigatorObj.mediaDevices, "devicechange", handler);
  return {
    dispose: () => {
      dispose();
    },
  };
}
