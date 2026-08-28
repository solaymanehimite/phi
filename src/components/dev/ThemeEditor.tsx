import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, Copy, Palette, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";

type Token = {
  name: string;
  label: string;
  group: string;
};

const TOKENS: Token[] = [
  // Backgrounds
  { name: "--color-phi-bg-app", label: "bg-app", group: "Background" },
  { name: "--color-phi-bg-main", label: "bg-main", group: "Background" },
  { name: "--color-phi-bg-sidebar", label: "bg-sidebar", group: "Background" },
  { name: "--color-phi-bg-surface", label: "bg-surface", group: "Background" },
  { name: "--color-phi-bg-elevated", label: "bg-elevated", group: "Background" },
  { name: "--color-phi-bg-sunken", label: "bg-sunken", group: "Background" },
  { name: "--color-phi-bg-inverse", label: "bg-inverse", group: "Background" },
  { name: "--color-phi-bg-disabled", label: "bg-disabled", group: "Background" },
  // Text
  { name: "--color-phi-text-primary", label: "text-primary", group: "Text" },
  { name: "--color-phi-text-secondary", label: "text-secondary", group: "Text" },
  { name: "--color-phi-text-tertiary", label: "text-tertiary", group: "Text" },
  { name: "--color-phi-text-muted", label: "text-muted", group: "Text" },
  { name: "--color-phi-text-faint", label: "text-faint", group: "Text" },
  { name: "--color-phi-text-inverse", label: "text-inverse", group: "Text" },
  { name: "--color-phi-text-disabled", label: "text-disabled", group: "Text" },
  { name: "--color-phi-text-brand", label: "text-brand", group: "Text" },
  { name: "--color-phi-icon", label: "icon", group: "Text" },
  { name: "--color-phi-icon-active", label: "icon-active", group: "Text" },
  // Accent / Brand
  { name: "--color-phi-accent", label: "accent", group: "Accent" },
  { name: "--color-phi-white", label: "white", group: "Accent" },
  { name: "--color-phi-white-muted", label: "white-muted", group: "Accent" },
  // Borders
  { name: "--color-phi-border", label: "border", group: "Border" },
  { name: "--color-phi-border-strong", label: "border-strong", group: "Border" },
  { name: "--color-phi-border-faint", label: "border-faint", group: "Border" },
  { name: "--color-phi-border-subtle", label: "border-subtle", group: "Border" },
  { name: "--color-phi-separator", label: "separator", group: "Border" },
  // Overlays
  { name: "--color-phi-overlay", label: "overlay", group: "Overlay" },
  { name: "--color-phi-overlay-hover", label: "overlay-hover", group: "Overlay" },
  { name: "--color-phi-overlay-active", label: "overlay-active", group: "Overlay" },
  { name: "--color-phi-overlay-strong", label: "overlay-strong", group: "Overlay" },
  { name: "--color-phi-overlay-muted", label: "overlay-muted", group: "Overlay" },
  { name: "--color-phi-overlay-code", label: "overlay-code", group: "Overlay" },
  { name: "--color-phi-overlay-focus", label: "overlay-focus", group: "Overlay" },
  // Inputs
  { name: "--color-phi-input-border", label: "input-border", group: "Input" },
  { name: "--color-phi-input-border-focus", label: "input-border-focus", group: "Input" },
  { name: "--color-phi-input-bg", label: "input-bg", group: "Input" },
  { name: "--color-phi-input-bg-focus", label: "input-bg-focus", group: "Input" },
  // Status
  { name: "--color-phi-error", label: "error", group: "Status" },
  { name: "--color-phi-error-bg", label: "error-bg", group: "Status" },
  { name: "--color-phi-error-border", label: "error-border", group: "Status" },
  { name: "--color-phi-error-text", label: "error-text", group: "Status" },
  { name: "--color-phi-streaming", label: "streaming", group: "Status" },
  // Thinking effort
  { name: "--color-phi-thinking-low", label: "thinking-low", group: "Thinking" },
  { name: "--color-phi-thinking-minimal", label: "thinking-minimal", group: "Thinking" },
  { name: "--color-phi-thinking-medium", label: "thinking-medium", group: "Thinking" },
  { name: "--color-phi-thinking-high", label: "thinking-high", group: "Thinking" },
  { name: "--color-phi-thinking-xhigh", label: "thinking-xhigh", group: "Thinking" },
  { name: "--color-phi-thinking-max", label: "thinking-max", group: "Thinking" },
];

function getComputedVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorToHex(color: string): string {
  const v = color.trim();
  if (v.startsWith("#")) {
    // normalize 3-char hex
    if (v.length === 4) {
      const r = v[1], g = v[2], b = v[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return v.slice(0, 7);
  }
  // rgb(255 255 255 / 0.06) or rgb(255,255,255) or rgba
  const nums = v.match(/\d+/g);
  if (!nums || nums.length < 3) return "#000000";
  const [r, g, b] = nums.slice(0, 3).map(Number);
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function getAlpha(original: string): string | null {
  // extracts alpha from "rgb(255 255 255 / 0.06)" or "rgba(255,255,255,0.1)"
  const m = original.match(/\/\s*([0-9.]+)\s*\)/) || original.match(/,\s*([0-9.]+)\s*\)/);
  if (!m) return null;
  const a = m[1];
  if (a === "1" || a === "1.0") return null;
  // only treat as alpha if original had 4 numbers
  const nums = original.match(/\d+/g);
  if (nums && nums.length >= 4) return a;
  // for rgb(... / alpha) pattern, return if slash present
  if (original.includes("/")) return a;
  return null;
}

export function ThemeEditor() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // hydrate from computed styles
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const t of TOKENS) {
      const v = getComputedVar(t.name);
      if (v) initial[t.name] = v;
    }
    setValues(initial);
  }, []);

  const setToken = (name: string, hex: string) => {
    const original = values[name] ?? getComputedVar(name) ?? hex;
    const alpha = getAlpha(original);
    let cssValue = hex;
    if (alpha !== null) {
      const [r, g, b] = hexToRgb(hex);
      // preserve original alpha syntax: rgb(r g b / alpha)
      cssValue = `rgb(${r} ${g} ${b} / ${alpha})`;
    }
    document.documentElement.style.setProperty(name, cssValue);
    setValues((prev) => ({ ...prev, [name]: cssValue }));
  };

  const cssCode = useMemo(() => {
    const lines = TOKENS.map((t) => {
      const v = values[t.name] ?? getComputedVar(t.name);
      return `  ${t.name}: ${v};`;
    }).join("\n");
    return `:root {\n${lines}\n}`;
  }, [values]);

  const copyCss = async () => {
    await navigator.clipboard.writeText(cssCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const groups = useMemo(() => {
    const map = new Map<string, Token[]>();
    for (const t of TOKENS) {
      const arr = map.get(t.group) ?? [];
      arr.push(t);
      map.set(t.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <Popover className="fixed bottom-4 right-4 z-50">
      <PopoverButton
        aria-label="Open theme editor"
        className="grid size-11 place-items-center rounded-full bg-phi-bg-elevated border border-phi-border-strong text-phi-text-secondary shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:bg-phi-overlay-strong hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 data-open:bg-phi-overlay-active"
      >
        <Palette size={18} />
      </PopoverButton>

      <PopoverPanel
        anchor={{ to: "top end", gap: 12 }}
        className="w-[360px] max-h-[min(72vh,640px)] overflow-hidden rounded-2xl border border-phi-border-strong bg-phi-bg-elevated shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)] [--anchor-gap:12px] flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-phi-border-faint px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium text-phi-text-primary">Theme Editor</p>
            <p className="text-[11px] text-phi-text-muted">Temporary — changes live via CSS vars</p>
          </div>
          <PopoverButton
            aria-label="Close"
            className="grid size-7 place-items-center rounded-lg text-phi-text-muted hover:bg-phi-overlay hover:text-phi-text-primary"
          >
            <X size={14} />
          </PopoverButton>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {groups.map(([group, tokens]) => (
            <div key={group}>
              <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-phi-text-muted uppercase">{group}</p>
              <div className="space-y-1">
                {tokens.map((t) => {
                  const val = values[t.name] ?? "";
                  const hex = val ? colorToHex(val) : "#000000";
                  const isActive = active === t.name;
                  return (
                    <div
                      key={t.name}
                      className={`rounded-lg border ${isActive ? "border-phi-accent/30 bg-phi-overlay" : "border-transparent hover:bg-phi-overlay-muted"} px-2 py-1.5`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => setActive(isActive ? null : t.name)}
                          aria-label={`Pick color for ${t.label}`}
                          className="size-7 shrink-0 rounded-md border border-phi-border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                          style={{ background: val || hex }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] leading-none text-phi-text-secondary">{t.label}</p>
                          <p className="truncate font-mono text-[10.5px] leading-none text-phi-text-faint mt-0.5">{val || "—"}</p>
                        </div>
                        <HexColorInput
                          prefixed
                          alpha={false}
                          className="w-[88px] rounded-md border border-phi-border bg-phi-bg-sunken px-1.5 py-1 text-center font-mono text-[11px] text-phi-text-secondary outline-none focus:border-phi-accent/40"
                          color={hex}
                          onChange={(nextHex) => setToken(t.name, nextHex)}
                        />
                      </div>
                      {isActive && (
                        <div className="pt-2">
                          <HexColorPicker
                            color={hex}
                            onChange={(nextHex) => setToken(t.name, nextHex)}
                            className="!w-full"
                          />
                          <style>{`.react-colorful { width: 100% !important } .react-colorful__saturation { border-radius: 10px 10px 0 0 } .react-colorful__hue, .react-colorful__alpha { height: 14px; border-radius: 0 0 10px 10px }`}</style>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-phi-border-faint p-2">
          <button
            onClick={copyCss}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-phi-bg-inverse text-phi-text-inverse px-3 py-2 text-[13px] font-medium hover:bg-phi-white transition"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy CSS"}
          </button>
          <p className="pt-1.5 text-center font-mono text-[10px] leading-none text-phi-text-faint">Copies :root block to clipboard</p>
        </div>
      </PopoverPanel>
    </Popover>
  );
}
