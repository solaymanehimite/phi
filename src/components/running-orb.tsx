import { Orb } from "@aicss/react";
import { useEffect, useState } from "react";

/* S3 dot-matrix orb with a scale pop on appear/disappear.
   The wrapper stays mounted and animates its width so siblings
   slide instead of snapping when the orb arrives/leaves. */
export function RunningOrb({ running, size = 18, gap = 8 }: { running?: boolean; size?: number; gap?: number }) {
    const [renderOrb, setRenderOrb] = useState(Boolean(running));
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (running) {
            setRenderOrb(true);
            setLeaving(false);
            return;
        }
        if (!renderOrb) return;
        setLeaving(true);
        const t = window.setTimeout(() => {
            setRenderOrb(false);
            setLeaving(false);
        }, 200);
        return () => window.clearTimeout(t);
    }, [running, renderOrb]);

    // Wrapper stays expanded while the shrink-out plays, then collapses.
    const open = Boolean(running) || leaving;
    return (
        <span
            aria-hidden
            style={{ width: open ? size : 0, marginRight: open ? gap : 0 }}
            className={`flex shrink-0 items-center overflow-hidden transition-all duration-200 ease-out ${open ? "opacity-100" : "opacity-0"}`}
        >
            {renderOrb && (
                <span className={`flex shrink-0 ${leaving ? "phi-orb-exit" : "phi-orb-enter"}`}>
                    <Orb variant="S3" size={size} />
                </span>
            )}
        </span>
    );
}
