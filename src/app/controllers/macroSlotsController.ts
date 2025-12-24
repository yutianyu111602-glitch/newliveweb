import type { MacroSlot } from "../../features/visualState/visualStateStore";
import { listen } from "../bindings/domBindings";

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function escapeHtml(text: string) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type MacroSlotsController = {
  render: () => void;
  dispose: () => void;
};

function setKnobVars(knob: HTMLElement | null, value01: number) {
  if (!knob) return;
  const v = clamp01(value01, 0.5);
  const angle = -135 + v * 270;
  try {
    knob.style.setProperty("--nw-knob-value", String(v));
    knob.style.setProperty("--nw-knob-angle", `${angle}deg`);
  } catch {
    // ignore
  }
}

export function initMacroSlotsController(opts: {
  addSlotButton: HTMLButtonElement | null | undefined;
  container: HTMLElement | null | undefined;
  getSlots: () => MacroSlot[];
  addSlot: () => void;
  updateSlot: (slotId: string, patch: Partial<MacroSlot>) => void;
  onValueChanged: () => void;
  onTargetsChanged: () => void;
}): MacroSlotsController {
  const {
    addSlotButton,
    container,
    getSlots,
    addSlot,
    updateSlot,
    onValueChanged,
    onTargetsChanged,
  } = opts;

  const render = () => {
    if (!container) return;
    const slots = getSlots();
    if (!slots.length) {
      container.innerHTML = "";
      onTargetsChanged();
      return;
    }

    container.innerHTML = slots
      .map((slot) => {
        const safeLabel = escapeHtml(slot.label);
        const value01 = clamp01(slot.value, 0.5);
        const pct = Math.round(value01 * 100);
        return `
        <div class="nw-slot" data-slot-id="${escapeHtml(slot.id)}">
          <div class="nw-slot__top">
            <input
              class="toolbar__input nw-slot__label"
              type="text"
              data-role="slot-label"
              value="${safeLabel}"
              placeholder="Macro"
              title="Edit label"
            />
          </div>

          <div class="nw-slot__mid" title="${safeLabel}">
            <div class="nw-knob nw-knob--sm" data-role="slot-knob" style="--nw-knob-value:${value01}; --nw-knob-angle:${
          -135 + value01 * 270
        }deg;">
              <div class="nw-knob__dial" aria-hidden="true"></div>
              <input
                class="nw-knob__input"
                type="range"
                data-role="slot-value"
                min="0"
                max="1"
                step="0.01"
                value="${value01}"
              />
            </div>
            <div class="nw-slot__value" data-role="slot-value-text">${pct}%</div>
          </div>

          <div class="nw-slot__bottom">
            <label class="toolbar__switch toolbar__switch--mini" title="Participate in global Random">
              <input type="checkbox" data-role="slot-randomize" ${
                slot.randomize ? "checked" : ""
              } />
              <span>rnd</span>
            </label>

            <label class="toolbar__switch toolbar__switch--mini" title="Pinned slots do not change during Random">
              <input type="checkbox" data-role="slot-pinned" ${
                slot.pinned ? "checked" : ""
              } />
              <span>pin</span>
            </label>
          </div>
        </div>
      `;
      })
      .join("");

    // Ensure all knobs are initialized (in case CSS vars were stripped by sanitizer).
    try {
      container
        .querySelectorAll<HTMLInputElement>("input[data-role='slot-value']")
        .forEach((input) => {
          const knob = input.closest(
            "[data-role='slot-knob']"
          ) as HTMLElement | null;
          setKnobVars(knob, Number(input.value));
        });
    } catch {
      // ignore
    }

    onTargetsChanged();
  };

  const onAdd = () => {
    try {
      addSlot();
      render();
    } catch {
      // ignore
    }
  };

  const onInput = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const role = target.getAttribute("data-role");
    const wrapper = target.closest("[data-slot-id]") as HTMLElement | null;
    if (!wrapper) return;
    const slotId = wrapper.getAttribute("data-slot-id");
    if (!slotId) return;

    if (role === "slot-value") {
      const input = target as HTMLInputElement;
      const nextValue = clamp01(Number(input.value), 0.5);
      updateSlot(slotId, { value: nextValue });

      // Live UI update: knob rotation + percent readout (no re-render).
      const knob = input.closest(
        "[data-role='slot-knob']"
      ) as HTMLElement | null;
      setKnobVars(knob, nextValue);
      const valueText = wrapper.querySelector<HTMLElement>(
        "[data-role='slot-value-text']"
      );
      if (valueText) valueText.textContent = `${Math.round(nextValue * 100)}%`;

      onValueChanged();
      return;
    }

    if (role === "slot-label") {
      const input = target as HTMLInputElement;
      const nextLabel = String(input.value ?? "").trim() || "Macro";
      updateSlot(slotId, { label: nextLabel });
      // Keep MIDI targets in sync without re-rendering the slot list (avoids caret jumps).
      onTargetsChanged();
    }
  };

  const onChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const role = target.getAttribute("data-role");
    const wrapper = target.closest("[data-slot-id]") as HTMLElement | null;
    if (!wrapper) return;
    const slotId = wrapper.getAttribute("data-slot-id");
    if (!slotId) return;
    const checkbox = target as HTMLInputElement;

    if (role === "slot-randomize") {
      updateSlot(slotId, { randomize: Boolean(checkbox.checked) });
      return;
    }

    if (role === "slot-pinned") {
      updateSlot(slotId, { pinned: Boolean(checkbox.checked) });
    }
  };

  const disposers = [
    listen(addSlotButton, "click", onAdd),
    listen(container, "input", onInput),
    listen(container, "change", onChange),
  ];

  return {
    render,
    dispose: () => {
      for (const d of disposers) d();
    },
  };
}
