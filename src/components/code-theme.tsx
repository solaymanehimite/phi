import { memo, useSyncExternalStore } from "react";
import { Highlight, themes, type PrismTheme } from "prism-react-renderer";
import { useInView } from "../hooks/useInView";
import { Prism } from "../lib/prism-setup";
import "../lib/prism-languages";
import { getEffectiveTheme, getStoredTheme } from "../hooks/useTheme";

// Eight bundled themes (plus Auto) — backgrounds stay transparent so Phi
// surfaces show through; only token foreground colors come from the theme.
export type CodeThemeId =
    | "nightOwl"
    | "dracula"
    | "oneDark"
    | "palenight"
    | "okaidia"
    | "oneLight"
    | "github"
    | "vsLight";

export type CodeThemeMeta = {
    label: string;
    mode: "dark" | "light";
    theme: PrismTheme;
};

export const CODE_THEMES: Record<CodeThemeId, CodeThemeMeta> = {
    nightOwl: { label: "Night Owl", mode: "dark", theme: themes.nightOwl },
    dracula: { label: "Dracula", mode: "dark", theme: themes.dracula },
    oneDark: { label: "One Dark", mode: "dark", theme: themes.oneDark },
    palenight: { label: "Palenight", mode: "dark", theme: themes.palenight },
    okaidia: { label: "Okaidia", mode: "dark", theme: themes.okaidia },
    oneLight: { label: "One Light", mode: "light", theme: themes.oneLight },
    github: { label: "GitHub", mode: "light", theme: themes.github },
    vsLight: { label: "VS Light", mode: "light", theme: themes.vsLight },
};

export type CodeThemeChoice = "auto" | CodeThemeId;

const STORAGE_KEY = "phi:code-theme";

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
    for (const listener of listeners) listener();
}

function readChoice(): CodeThemeChoice {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        if (value === "auto" || (value != null && value in CODE_THEMES)) {
            return value as CodeThemeChoice;
        }
    } catch {
        // private mode / no storage — fall through to auto
    }
    return "auto";
}

export function setCodeTheme(choice: CodeThemeChoice) {
    try {
        localStorage.setItem(STORAGE_KEY, choice);
    } catch {
        // non-persisted, still apply for this session
    }
    emit();
}

function subscribe(listener: Listener) {
    listeners.add(listener);
    // App theme changes arrive as <html data-theme> mutations or OS changes
    const observer = new MutationObserver((mutations) => {
        if (mutations.some((m) => m.attributeName === "data-theme")) listener();
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onMedia = () => listener();
    media.addEventListener?.("change", onMedia);
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        observer.disconnect();
        media.removeEventListener?.("change", onMedia);
        window.removeEventListener("storage", onStorage);
    };
}

// Primitive string snapshot — referentially stable for useSyncExternalStore
function getSnapshot(): CodeThemeChoice {
    return readChoice();
}

function resolveTheme(choice: CodeThemeChoice): PrismTheme {
    if (choice !== "auto") return CODE_THEMES[choice].theme;
    return getEffectiveTheme(getStoredTheme()) === "light"
        ? CODE_THEMES.oneLight.theme
        : CODE_THEMES.nightOwl.theme;
}

export function useCodeTheme(): { choice: CodeThemeChoice; theme: PrismTheme } {
    const choice = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return { choice, theme: resolveTheme(choice) };
}

// --- language detection -----------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
    ts: "typescript",
    mts: "typescript",
    cts: "typescript",
    tsx: "tsx",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    json: "json",
    webmanifest: "json",
    jsonc: "json",
    json5: "json5",
    css: "css",
    scss: "scss",
    less: "less",
    html: "markup",
    htm: "markup",
    xml: "markup",
    svg: "markup",
    vue: "markup",
    svelte: "markup",
    astro: "markup",
    md: "markdown",
    mdx: "markdown",
    markdown: "markdown",
    py: "python",
    pyw: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    ksh: "bash",
    sql: "sql",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    env: "ini",
    conf: "ini",
    editorconfig: "ini",
    java: "java",
    scala: "scala",
    kt: "kotlin",
    kts: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    hh: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    m: "objectivec",
    mm: "objectivec",
    lua: "lua",
    r: "r",
    pl: "perl",
    pm: "perl",
    groovy: "groovy",
    dart: "dart",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    clj: "clojure",
    jl: "julia",
    tex: "latex",
    sty: "latex",
    ps1: "powershell",
    psm1: "powershell",
    bat: "batch",
    cmd: "batch",
    vim: "vim",
    diff: "diff",
    patch: "diff",
    mk: "makefile",
    cmake: "cmake",
    proto: "protobuf",
    graphql: "graphql",
    gql: "graphql",
    coffee: "coffeescript",
    glsl: "glsl",
    vert: "glsl",
    frag: "glsl",
};

// Markdown fence tags / explicit language hints, including common aliases.
// Empty string means "explicitly plain".
const LANG_ALIASES: Record<string, string> = {
    "": "",
    plain: "",
    plaintext: "",
    text: "",
    txt: "",
    none: "",
    nohighlight: "",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    fish: "bash",
    console: "bash",
    terminal: "bash",
    dos: "batch",
    ps1: "powershell",
    js: "javascript",
    ts: "typescript",
    py: "python",
    yml: "yaml",
    md: "markdown",
    markdown: "markdown",
    html: "markup",
    xml: "markup",
    svg: "markup",
    vue: "markup",
    "c++": "cpp",
    cc: "cpp",
    "c#": "csharp",
    cs: "csharp",
    rs: "rust",
    kt: "kotlin",
    rb: "ruby",
    pl: "perl",
    ex: "elixir",
    erl: "erlang",
    clj: "clojure",
    jl: "julia",
    tex: "latex",
    "shell-session": "bash",
    shellsession: "bash",
    dockerfile: "docker",
    makefile: "makefile",
    cmake: "cmake",
    gitignore: "ignore",
    jsonc: "json",
    json5: "json5",
};

const FILENAME_TO_LANG: Record<string, string> = {
    dockerfile: "docker",
    makefile: "makefile",
    gnumakefile: "makefile",
    gemfile: "ruby",
    rakefile: "ruby",
    vagrantfile: "ruby",
    brewfile: "ruby",
    podfile: "ruby",
    ".bashrc": "bash",
    ".bash_profile": "bash",
    ".zshrc": "bash",
    ".profile": "bash",
    ".vimrc": "vim",
    ".gvimrc": "vim",
    ".gitignore": "ignore",
    ".dockerignore": "ignore",
    ".npmignore": "ignore",
};

export function grammarFor(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const key = id.toLowerCase();
    return (Prism.languages as Record<string, unknown>)[key] ? key : undefined;
}

/** Resolve a Prism language id from a fence tag and/or a file path. */
export function detectLanguage(
    opts: { path?: string | null; language?: string | null } = {},
): string | undefined {
    if (opts.language) {
        const raw = opts.language.toLowerCase();
        const aliased = raw in LANG_ALIASES ? LANG_ALIASES[raw] : raw;
        const found = grammarFor(aliased || undefined);
        if (found) return found;
    }
    if (opts.path) {
        const base = opts.path.split("/").pop() ?? opts.path;
        const lower = base.toLowerCase();
        if (lower in FILENAME_TO_LANG) return FILENAME_TO_LANG[lower];
        if (lower.startsWith("dockerfile")) return "docker";
        if (lower.startsWith("cmakelists")) return "cmake";
        const dot = lower.lastIndexOf(".");
        if (dot >= 0) {
            const mapped = EXT_TO_LANG[lower.slice(dot + 1)];
            const found = grammarFor(mapped);
            if (found) return found;
        }
    }
    return undefined;
}

// --- components -------------------------------------------------------------

// Skip highlighting for very large blobs to keep streaming/scroll smooth.
const MAX_HIGHLIGHT_CHARS = 30_000;

/** Block code with syntax colors. Falls back to plain text when unknown/too large. */
export const HighlightedCode = memo(function HighlightedCode({
    code,
    language,
}: {
    code: string;
    language?: string;
}) {
    const { theme } = useCodeTheme();
    const grammar = grammarFor(language);
    if (!grammar || code.length > MAX_HIGHLIGHT_CHARS) {
        return <>{code}</>;
    }
    return (
        <Highlight theme={theme} code={code} language={grammar}>
            {({ tokens, getLineProps, getTokenProps }) => (
                <>
                    {tokens.map((line, i) => (
                        <div key={i} {...getLineProps({ line })}>
                            {line.map((token, key) => (
                                <span key={key} {...getTokenProps({ token })} />
                            ))}
                        </div>
                    ))}
                </>
            )}
        </Highlight>
    );
});

/**
 * Viewport-lazy syntax highlight. Renders plain text (identical layout —
 * token spans never change metrics) until scrolled near the viewport,
 * then upgrades to full Prism colors. This keeps offscreen code blocks
 * out of the click-to-paint critical path with zero layout shift.
 */
export const LazyHighlightedCode = memo(function LazyHighlightedCode({
    code,
    language,
}: {
    code: string;
    language?: string;
}) {
    const { ref, inView } = useInView();
    if (!inView) {
        return <span ref={ref}>{code}</span>;
    }
    return (
        <span ref={ref}>
            <HighlightedCode code={code} language={language} />
        </span>
    );
});

/** Single-line shell command for the compact tool-call header. */
export const InlineShell = memo(function InlineShell({ code }: { code: string }) {
    const { theme } = useCodeTheme();
    const singleLine = code.replace(/\s*\n\s*/g, " ");
    if (!singleLine || singleLine.length > 2000) {
        return <>{singleLine || code}</>;
    }
    return (
        <Highlight theme={theme} code={singleLine} language="bash">
            {({ tokens, getTokenProps }) => (
                <>
                    {tokens.flatMap((line, li) =>
                        line.map((token, key) => (
                            <span key={`${li}-${key}`} {...getTokenProps({ token })} />
                        )),
                    )}
                </>
            )}
        </Highlight>
    );
});
