import { useEffect, useMemo, useState } from "react";

export function colorToHex(color: string): string {
    const value = color.trim();
    if (value.startsWith("#")) {
        if (value.length === 4) {
            const [r, g, b] = value.slice(1);
            return `#${r}${r}${g}${g}${b}${b}`;
        }
        return value.slice(0, 7);
    }
    const channels = value.match(/\d+/g);
    if (!channels || channels.length < 3) return "#000000";
    const [r, g, b] = channels.slice(0, 3).map(Number);
    return rgbToHex(r, g, b);
}

export function hexToRgb(hex: string): [number, number, number] {
    const short = hex.replace("#", "");
    const full = short.length === 3 ? short.split("").map((channel) => channel + channel).join("") : short;
    const value = parseInt(full.slice(0, 6), 16);
    if (Number.isNaN(value)) return [0, 0, 0];
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function getAlpha(original: string): string | null {
    const match = original.match(/\/\s*([0-9.]+)\s*\)/) || original.match(/,\s*([0-9.]+)\s*\)/);
    if (!match) return null;
    const alpha = match[1];
    if (alpha === "1" || alpha === "1.0") return null;
    const channels = original.match(/\d+/g);
    if ((channels && channels.length >= 4) || original.includes("/")) return alpha;
    return null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
        if (max === red) hue = ((green - blue) / delta) % 6;
        else if (max === green) hue = (blue - red) / delta + 2;
        else hue = (red - green) / delta + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
    }
    return [hue, max === 0 ? 0 : (delta / max) * 100, max * 100];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 100) / 100;
    const value = clamp(v, 0, 100) / 100;
    const chroma = value * saturation;
    const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
    const match = value - chroma;
    let red = 0;
    let green = 0;
    let blue = 0;
    if (hue < 60) [red, green, blue] = [chroma, x, 0];
    else if (hue < 120) [red, green, blue] = [x, chroma, 0];
    else if (hue < 180) [red, green, blue] = [0, chroma, x];
    else if (hue < 240) [red, green, blue] = [0, x, chroma];
    else if (hue < 300) [red, green, blue] = [x, 0, chroma];
    else [red, green, blue] = [chroma, 0, x];
    return [
        Math.round((red + match) * 255),
        Math.round((green + match) * 255),
        Math.round((blue + match) * 255),
    ];
}

function hsvToHex(h: number, s: number, v: number): string {
    return rgbToHex(...hsvToRgb(h, s, v));
}

function ChannelSlider({
    label,
    value,
    min,
    max,
    step = 0.1,
    precision = 1,
    gradient,
    ariaLabel,
    suffix,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    precision?: number;
    gradient: string;
    ariaLabel: string;
    suffix?: string;
    onChange: (next: number) => void;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const format = (next: number) => precision === 0
        ? String(Math.round(next))
        : next.toFixed(precision).replace(/\.?0+$/, "");

    useEffect(() => {
        if (!focused) setDraft(null);
    }, [value, focused]);

    const commit = (raw: string) => {
        if (raw.trim() === "") {
            setDraft(null);
            return;
        }
        const next = Number(raw);
        if (!Number.isNaN(next)) onChange(clamp(next, min, max));
        setDraft(null);
    };

    return (
        <div className="flex items-center gap-2">
            <span aria-hidden className="w-3 shrink-0 text-center font-mono text-[10px] font-semibold text-phi-text-tertiary">{label}</span>
            <input
                type="range"
                aria-label={ariaLabel}
                min={min}
                max={max}
                step={step}
                value={clamp(value, min, max)}
                onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
                className="phi-color-slider min-w-0 flex-1"
                style={{ backgroundImage: gradient }}
            />
            <span className="flex w-[52px] shrink-0 items-center gap-0.5 rounded-md border border-phi-border bg-phi-bg-sunken px-1 py-0.5 focus-within:border-phi-accent/40">
                <input
                    type="number"
                    aria-label={`${ariaLabel} value`}
                    min={min}
                    max={max}
                    step={step}
                    value={draft ?? format(clamp(value, min, max))}
                    onChange={(event) => setDraft(event.target.value)}
                    onFocus={() => {
                        setFocused(true);
                        setDraft(format(clamp(value, min, max)));
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        commit(event.target.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commit(event.currentTarget.value);
                            event.currentTarget.blur();
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            setDraft(null);
                            event.currentTarget.blur();
                        }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-right font-mono text-[10px] text-phi-text-secondary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                {suffix && <span className="font-mono text-[9px] text-phi-text-faint">{suffix}</span>}
            </span>
        </div>
    );
}

export function HexField({ hex, onCommit }: { hex: string; onCommit: (nextHex: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setDraft(null);
    }, [hex, focused]);

    const commit = (raw: string) => {
        const value = raw.trim();
        if (!value) {
            setDraft(null);
            return;
        }
        const normalized = value.startsWith("#") ? value : `#${value}`;
        if (/^#[0-9a-fA-F]{6}$/.test(normalized) || /^#[0-9a-fA-F]{3}$/.test(normalized)) {
            onCommit(colorToHex(normalized));
        }
        setDraft(null);
    };

    return (
        <input
            aria-label="Hex color value"
            spellCheck={false}
            value={draft ?? hex}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => {
                setFocused(true);
                setDraft(hex);
            }}
            onBlur={(event) => {
                setFocused(false);
                commit(event.target.value);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    commit(event.currentTarget.value);
                    event.currentTarget.blur();
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    setDraft(null);
                    event.currentTarget.blur();
                }
            }}
            className="w-[88px] rounded-md border border-phi-border bg-phi-bg-sunken px-1.5 py-1 text-center font-mono text-[11px] text-phi-text-secondary outline-none focus:border-phi-accent/40"
        />
    );
}

export function HsvRgbSliders({ hex, onChange }: { hex: string; onChange: (nextHex: string) => void }) {
    const [r, g, b] = useMemo(() => hexToRgb(hex), [hex]);
    const [h, s, v] = useMemo(() => rgbToHsv(r, g, b), [r, g, b]);
    const setRgb = (red: number, green: number, blue: number) => onChange(rgbToHex(red, green, blue));
    const setHsv = (hue: number, saturation: number, value: number) => onChange(hsvToHex(hue, saturation, value));
    const saturationStart = hsvToHex(h, 0, v);
    const saturationEnd = hsvToHex(h, 100, v);
    const valueEnd = hsvToHex(h, s === 0 ? 0 : s, 100);

    return (
        <div className="space-y-3 px-0.5 pt-2.5">
            <div className="space-y-1.5">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-phi-text-faint">HSV</p>
                <ChannelSlider label="H" value={h} min={0} max={360} ariaLabel="Hue" suffix="°" gradient="linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" onChange={(next) => setHsv(next, s, v)} />
                <ChannelSlider label="S" value={s} min={0} max={100} ariaLabel="Saturation" suffix="%" gradient={`linear-gradient(to right, ${saturationStart}, ${saturationEnd})`} onChange={(next) => setHsv(h, next, v)} />
                <ChannelSlider label="V" value={v} min={0} max={100} ariaLabel="Value (brightness)" suffix="%" gradient={`linear-gradient(to right, #000000, ${valueEnd})`} onChange={(next) => setHsv(h, s, next)} />
            </div>
            <div className="space-y-1.5">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-phi-text-faint">RGB</p>
                <ChannelSlider label="R" value={r} min={0} max={255} step={1} precision={0} ariaLabel="Red" gradient={`linear-gradient(to right, rgb(0 ${g} ${b}), rgb(255 ${g} ${b}))`} onChange={(next) => setRgb(next, g, b)} />
                <ChannelSlider label="G" value={g} min={0} max={255} step={1} precision={0} ariaLabel="Green" gradient={`linear-gradient(to right, rgb(${r} 0 ${b}), rgb(${r} 255 ${b}))`} onChange={(next) => setRgb(r, next, b)} />
                <ChannelSlider label="B" value={b} min={0} max={255} step={1} precision={0} ariaLabel="Blue" gradient={`linear-gradient(to right, rgb(${r} ${g} 0), rgb(${r} ${g} 255))`} onChange={(next) => setRgb(r, g, next)} />
            </div>
        </div>
    );
}

export const COLOR_SLIDER_CSS = `
.phi-color-slider { -webkit-appearance: none; appearance: none; height: 10px; border-radius: 9999px; outline: none; cursor: pointer; border: 1px solid var(--color-phi-border); }
.phi-color-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 9999px; background: #fff; border: 2px solid rgba(0,0,0,0.55); box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: ew-resize; }
.phi-color-slider::-moz-range-thumb { width: 12px; height: 12px; border-radius: 9999px; background: #fff; border: 2px solid rgba(0,0,0,0.55); box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: ew-resize; }
.phi-color-slider:focus-visible { outline: 2px solid color-mix(in srgb, var(--color-phi-accent) 60%, transparent); outline-offset: 2px; }
`;
