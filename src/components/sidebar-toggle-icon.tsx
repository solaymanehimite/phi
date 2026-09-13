import { useState } from "react";

type SidebarToggleIconProps = {
    /** Whether the sidebar is currently expanded. Sets the filled pane width. */
    expanded: boolean;
    className?: string;
};

const EASING = "cubic-bezier(0.4,0,0.2,1)";

// Outer rounded square (3..21) — identical to Tabler's IconLayoutSidebarFilled.
const OUTER =
    "M6 21a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3z";

// Inner cutout: right edge fixed at 19 (stock 2-unit rim), left edge at the
// pane boundary. Same command structure as stock, so it renders the same way.
const hole = (paneEdge: number) =>
    `M18 5H${paneEdge}V19H18a1 1 0 0 0 1 -1V6a1 1 0 0 0 -1 -1Z`;

const pathFor = (expanded: boolean) => `${OUTER}${hole(expanded ? 10 : 7)}`;

/**
 * Stock filled sidebar glyph with no chevron. The filled pane is the default
 * stock width (edge at 10) when expanded and narrower (edge at 7) when
 * collapsed, morphing between the two. Both states share the same path
 * structure so the CSS `d` transition interpolates; the `d` attribute stays
 * as the fallback render.
 */
export function SidebarToggleIcon({ expanded, className = "" }: SidebarToggleIconProps) {
    const [reduceMotion] = useState(
        () =>
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    const d = pathFor(expanded);

    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={className}
        >
            <path
                d={d}
                style={{
                    d: `path("${d}")`,
                    transition: reduceMotion ? "none" : `d 500ms ${EASING}`,
                }}
            />
        </svg>
    );
}
