import { Prism } from "prism-react-renderer";

// prismjs grammar components reference a bare global `Prism`. Point it at the
// exact Prism instance the renderer uses, so extra grammars register there.
// This module must be imported before any `prismjs/components/*` import.
(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;

export { Prism };
