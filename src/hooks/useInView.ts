import { useEffect, useRef, useState } from "react";

/**
 * Viewport-lazy gate for expensive work (Prism tokenization).
 * Returns a ref to attach to the placeholder and whether the
 * placeholder is within (rootMargin-expanded) viewport.
 * Once visible, stays visible — highlighting never un-mounts on scroll-away.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
    rootMargin = "800px 0px",
) {
    const ref = useRef<T | null>(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        if (inView) return;
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") {
            setInView(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting) {
                        setInView(true);
                        break;
                    }
                }
            },
            { root: null, rootMargin, threshold: 0 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [inView, rootMargin]);

    return { ref, inView };
}
