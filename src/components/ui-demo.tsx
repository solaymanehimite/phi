import { useState, type ReactNode } from "react";
import {
    IconCheckFilled,
    IconDotsFilled,
    IconMessageCircleFilled,
    IconMoodSmileFilled,
    IconPencilFilled,
    IconPlusFilled,
    IconSearch,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { Alert } from "./ui/alert";
import { Button, buttonClass, type ButtonVariant } from "./ui/button";
import { InlineCode } from "./ui/code";
import { GroupCollapsibleTrigger } from "./ui/collapsible";
import { DialogOverlay, DialogPanel, DialogTitle } from "./ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { EmptyState } from "./ui/empty-state";
import { Input } from "./ui/input";
import { Menu, MenuEmpty, MenuItem, MenuLabel } from "./ui/menu";
import { NavItem } from "./ui/nav-item";
import { Hint } from "./ui/hint";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Select } from "./ui/select";
import { Well } from "./ui/surface";
import { Switch } from "./ui/switch";

const SECTIONS = [
    { id: "buttons", label: "Buttons" },
    { id: "inputs", label: "Inputs" },
    { id: "alerts", label: "Alerts" },
    { id: "pills", label: "Hint" },
    { id: "code", label: "Inline code" },
    { id: "surfaces", label: "Well" },
    { id: "collapsibles", label: "Group collapsible" },
    { id: "menus", label: "Menus" },
    { id: "dropdowns", label: "Dropdowns" },
    { id: "popovers", label: "Popovers" },
    { id: "nav", label: "Nav items" },
    { id: "dialogs", label: "Dialogs" },
    { id: "empty", label: "Empty states" },
    { id: "selects", label: "Selects" },
    { id: "switches", label: "Switches" },
] as const;

function DemoSection({
    id,
    title,
    description,
    children,
}: {
    id: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section id={`ui-demo-${id}`} aria-label={title} className="scroll-mt-4">
            <h2 className="text-[14px] font-semibold text-phi-text-primary">{title}</h2>
            <p className="mt-0.5 text-[12px] text-phi-text-muted">{description}</p>
            <div className="mt-3 rounded-xl border border-phi-border bg-phi-bg-surface p-4">
                {children}
            </div>
        </section>
    );
}

function RowLabel({ children }: { children: ReactNode }) {
    return (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-phi-text-muted">
            {children}
        </p>
    );
}

const BUTTON_VARIANTS: ButtonVariant[] = [
    "primary",
    "secondary",
    "ghost",
    "icon",
    "danger",
    "mini",
];

export function UiDemoPanel() {
    const [switchOn, setSwitchOn] = useState(true);
    const [switchOff, setSwitchOff] = useState(false);
    const [groupCollapsed, setGroupCollapsed] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectValue, setSelectValue] = useState("phi-dark");
    const [navActive, setNavActive] = useState("chats");
    const [menuActive, setMenuActive] = useState(1);

    const scrollTo = (id: string) => {
        document.getElementById(`ui-demo-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="flex min-h-0 flex-1">
            <aside className="hidden w-[188px] shrink-0 flex-col overflow-y-auto pb-5 pt-2 sm:flex lg:w-[220px]">
                <nav aria-label="Component sections" className="space-y-0.5 px-2">
                    {SECTIONS.map((s) => (
                        <NavItem
                            key={s.id}
                            label={s.label}
                            onClick={() => scrollTo(s.id)}
                        />
                    ))}
                </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="shrink-0 px-6 pb-5 pt-12">
                    <div className="mx-auto w-full max-w-3xl">
                        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-phi-text-primary">
                            UI demo
                        </h1>
                        <p className="mt-1 text-[12px] text-phi-text-muted">
                            Every reusable component in <InlineCode>src/components/ui</InlineCode>,
                            with all variants and states. For visual review — nothing here writes state.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5 sm:hidden">
                            {SECTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => scrollTo(s.id)}
                                    className="rounded-full border border-phi-border-faint px-2.5 py-1 text-[11px] font-medium text-phi-text-tertiary"
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-1">
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-16">
                        <DemoSection
                            id="buttons"
                            title="Button"
                            description="6 variants. Primary / danger render icon-size by default; others map to xs / sm / md. All support size override + disabled."
                        >
                            <div className="flex flex-col gap-5">
                                <div>
                                    <RowLabel>Variants (default size)</RowLabel>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="primary" size="sm"><IconSendFilled className="size-3.5" /> Send</Button>
                                        <Button variant="secondary">Test connection</Button>
                                        <Button variant="secondary" size="xs">Code theme</Button>
                                        <Button variant="ghost">Cancel</Button>
                                        <Button variant="icon" aria-label="More options"><IconDotsFilled className="size-4" /></Button>
                                        <Button variant="danger" size="sm">Stop</Button>
                                        <Button variant="mini" aria-label="Copy"><IconPencilFilled className="size-3.5" /></Button>
                                    </div>
                                </div>
                                <div>
                                    <RowLabel>Sizes (secondary variant)</RowLabel>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="secondary" size="xs">Extra small</Button>
                                        <Button variant="secondary" size="sm">Small</Button>
                                        <Button variant="secondary" size="md">Medium</Button>
                                        <Button variant="icon" size="icon" aria-label="Search"><IconSearch className="size-4" /></Button>
                                    </div>
                                </div>
                                <div>
                                    <RowLabel>Disabled</RowLabel>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="primary" size="sm" disabled><IconSendFilled className="size-3.5" /> Send</Button>
                                        <Button variant="secondary" disabled>Test connection</Button>
                                        <Button variant="ghost" disabled>Cancel</Button>
                                        <Button variant="danger" size="sm" disabled>Stop</Button>
                                    </div>
                                </div>
                                <div>
                                    <RowLabel>buttonClass — non-button elements in button styles</RowLabel>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <a href="#ui-demo-buttons" onClick={(e) => e.preventDefault()} className={buttonClass("secondary", "sm")}>
                                            Link as button
                                        </a>
                                        <span className={buttonClass("secondary", "xs")}>Span as chip</span>
                                    </div>
                                </div>
                                <p className="text-[11px] text-phi-text-faint">
                                    Variants: {BUTTON_VARIANTS.map((v) => <InlineCode key={v}>{v}</InlineCode>).reduce<ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ", ", el]), [])}
                                </p>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="inputs"
                            title="Input"
                            description="3 variants: search (sidebar / palette filter), inline (row rename), default (settings + project forms)."
                        >
                            <div className="flex flex-col gap-5">
                                <div>
                                    <RowLabel>Search (default)</RowLabel>
                                    <Input variant="search" placeholder="Search sessions…" aria-label="Demo search input" />
                                </div>
                                <div>
                                    <RowLabel>Inline</RowLabel>
                                    <div className="flex items-center gap-2">
                                        <Input variant="inline" defaultValue="my-session-name" aria-label="Demo inline input" />
                                        <Button variant="mini" aria-label="Confirm"><IconCheckFilled className="size-3.5" /></Button>
                                    </div>
                                </div>
                                <div>
                                    <RowLabel>Default (form field)</RowLabel>
                                    <div className="flex flex-col gap-2">
                                        <Input variant="default" placeholder="Project name" aria-label="Demo project name" />
                                        <Input variant="default" placeholder="Disabled field" disabled aria-label="Demo disabled input" />
                                    </div>
                                </div>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="alerts"
                            title="Alert"
                            description="Inline banner for model errors, auth warnings, load failures. Error + warning carry role=alert."
                        >
                            <div className="flex flex-col gap-2">
                                <Alert variant="error">Error — streaming failed. Check the sidecar and retry.</Alert>
                                <Alert variant="warning">Warning — no models available. Run <InlineCode>pi auth</InlineCode> to connect one.</Alert>
                                <Alert variant="info">Info — 3 sessions were archived this week.</Alert>
                                <Alert variant="muted">Muted — this notice was dismissed and kept for context.</Alert>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="pills"
                            title="Hint"
                            description="The muted count chip used at the right of palette rows."
                        >
                            <div className="flex items-center gap-3 rounded-lg border border-phi-border bg-phi-overlay px-3 py-2 text-[13px] text-phi-text-secondary">
                                <span className="min-w-0 flex-1 truncate">claude-opus-4-6</span>
                                <Hint>anthropic · 12</Hint>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="code"
                            title="InlineCode"
                            description="Single token source for backticked text inside copy."
                        >
                            <p className="text-[13px] leading-6 text-phi-text-secondary">
                                Sessions live in <InlineCode>~/.pi/agent/sessions</InlineCode> and the
                                sidecar speaks over <InlineCode>/api/health</InlineCode>. Long tokens wrap:{" "}
                                <InlineCode>provider/anthropic/claude-opus-4-6-thinking-max-effort-variant</InlineCode>
                            </p>
                        </DemoSection>

                        <DemoSection
                            id="surfaces"
                            title="Well"
                            description="The sunken well for tool output, diffs, code."
                        >
                            <div className="flex flex-col gap-3">
                                <Well className="px-3 py-2.5">
                                    <p className="font-mono text-[12px] leading-5 text-phi-text-secondary">$ pi sessions list --cwd ~/projects/phi</p>
                                    <p className="font-mono text-[12px] leading-5 text-phi-text-muted">3 sessions · newest first</p>
                                </Well>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="collapsibles"
                            title="Group collapsible"
                            description="The sidebar group trigger with animated chevron."
                        >
                            <div className="flex flex-col gap-3">
                                <div className="rounded-lg border border-phi-border">
                                    <GroupCollapsibleTrigger collapsed={groupCollapsed} onClick={() => setGroupCollapsed((v) => !v)}>
                                        <span className="flex-1">Phi — ~/Dev/ship/Phi</span>
                                        <Hint>4</Hint>
                                    </GroupCollapsibleTrigger>
                                    {!groupCollapsed && (
                                        <div className="px-2 pb-2">
                                            <NavItem label="Refactor tab switching" onClick={() => {}} icon={IconMessageCircleFilled} />
                                            <NavItem label="Theme tokens audit" onClick={() => {}} icon={IconMessageCircleFilled} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="menus"
                            title="Menu primitives"
                            description="Floating menu shell behind dropdowns and the @ / palettes. MenuItem supports keyboard-active state."
                        >
                            <div className="flex flex-col gap-3">
                                <Menu className="max-w-sm">
                                    <MenuLabel>Files</MenuLabel>
                                    {[0, 1, 2].map((i) => (
                                        <MenuItem key={i} active={menuActive === i} onMouseEnter={() => setMenuActive(i)} onClick={() => setMenuActive(i)}>
                                            <IconMessageCircleFilled className="size-4 shrink-0 text-phi-text-muted" />
                                            <span className="min-w-0 flex-1 truncate">src/components/{["tabs.tsx", "sidebar.tsx", "composer.tsx"][i]}</span>
                                            <Hint>{["2k", "8k", "5k"][i]}</Hint>
                                        </MenuItem>
                                    ))}
                                    <MenuLabel>Commands</MenuLabel>
                                    <MenuItem onClick={() => {}}>
                                        <IconPlusFilled className="size-4 shrink-0 text-phi-text-muted" />
                                        <span className="min-w-0 flex-1 truncate">New chat in Phi</span>
                                        <Hint>⌘N</Hint>
                                    </MenuItem>
                                </Menu>
                                <Menu className="max-w-sm">
                                    <MenuEmpty>No results found.</MenuEmpty>
                                </Menu>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="dropdowns"
                            title="DropdownMenu"
                            description="HeadlessUI menu. Trigger only shows on row hover / focus — hover the card below to reveal it."
                        >
                            <div className="group flex max-w-sm items-center gap-2 rounded-lg border border-phi-border bg-phi-overlay px-3 py-2">
                                <IconMessageCircleFilled className="size-4 shrink-0 text-phi-text-muted" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-phi-text-secondary">Hover me — trigger appears</span>
                                <span className="text-[11px] text-phi-text-faint">2h</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger aria-label="Session options">
                                        <IconDotsFilled className="size-4" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        <DropdownMenuItem icon={<IconPencilFilled className="size-4" />} onClick={() => {}}>Rename</DropdownMenuItem>
                                        <DropdownMenuItem icon={<IconTrashFilled className="size-4" />} onClick={() => {}}>Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="popovers"
                            title="Popover"
                            description="Anchored floating panel — model selector, code theme picker, theme editor."
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <Popover className="relative">
                                    <PopoverTrigger className={buttonClass("secondary", "xs", "group w-44 !text-[11px]")}>
                                        <span className="min-w-0 flex-1 truncate text-left">Bottom-end panel</span>
                                    </PopoverTrigger>
                                    <PopoverContent anchor={{ to: "bottom start", gap: 8 }} className="w-56 p-1">
                                        <MenuItem active onClick={() => {}}><span className="flex-1">Dark theme</span><IconCheckFilled className="size-3.5 text-phi-accent" /></MenuItem>
                                        <MenuItem onClick={() => {}}>Light theme</MenuItem>
                                        <MenuItem onClick={() => {}}>System</MenuItem>
                                    </PopoverContent>
                                </Popover>
                                <Popover className="relative">
                                    <PopoverTrigger className={buttonClass("secondary", "sm")}>
                                        Plain popover
                                    </PopoverTrigger>
                                    <PopoverContent anchor={{ to: "bottom start", gap: 8 }} className="max-w-60 p-3">
                                        <p className="text-[12px] leading-5 text-phi-text-secondary">Any content fits — alerts, forms, previews.</p>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="nav"
                            title="NavItem"
                            description="One hover, one active, one focus ring — shared by sidebar, settings rail, and this page."
                        >
                            <div className="flex max-w-sm flex-col gap-0.5">
                                {[
                                    { id: "chats", label: "Chats", icon: IconMessageCircleFilled },
                                    { id: "settings", label: "Settings", icon: IconSettingsFilled },
                                    { id: "drafts", label: "Draft with trailing slot", icon: IconSendFilled },
                                ].map((item) => (
                                    <NavItem
                                        key={item.id}
                                        label={item.label}
                                        icon={item.icon}
                                        active={navActive === item.id}
                                        onClick={() => setNavActive(item.id)}
                                        ariaCurrent={navActive === item.id ? "page" : undefined}
                                    >
                                        {item.id === "drafts" ? (
                                            <>
                                                <span className="min-w-0 flex-1 truncate">Draft with trailing slot</span>
                                                <Hint>3</Hint>
                                            </>
                                        ) : undefined}
                                    </NavItem>
                                ))}
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="dialogs"
                            title="Dialog"
                            description="Full-screen scrim + centered panel + title. Closes on backdrop click or Cancel."
                        >
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open dialog</Button>
                            </div>
                            {dialogOpen && (
                                <DialogOverlay role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialogOpen(false); }}>
                                    <DialogPanel>
                                        <DialogTitle>Delete provider?</DialogTitle>
                                        <p className="mt-1 text-[12.5px] leading-5 text-phi-text-secondary">
                                            Models from <InlineCode>acme</InlineCode> will no longer be listed. Sessions already on them keep working.
                                        </p>
                                        <div className="mt-4 flex justify-end gap-2">
                                            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                                            <Button variant="danger" size="sm" onClick={() => setDialogOpen(false)}>Delete</Button>
                                        </div>
                                    </DialogPanel>
                                </DialogOverlay>
                            )}
                        </DemoSection>

                        <DemoSection
                            id="empty"
                            title="EmptyState"
                            description="Centered empty copy — one voice for sidebar, palette, model list."
                        >
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-lg border border-phi-border">
                                    <EmptyState
                                        title="No sessions found"
                                        description="Run pi in this workspace to create one."
                                        detail="Sessions appear here automatically."
                                    />
                                </div>
                                <div className="rounded-lg border border-phi-border">
                                    <EmptyState compact title="No results" description="Try a different search.">
                                        <Button variant="secondary" size="xs" className="mt-3">Clear search</Button>
                                    </EmptyState>
                                </div>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="selects"
                            title="Select"
                            description="Bordered chip with chevron — the code theme picker. Consumer absolute / fixed / sticky wins over the default relative anchor."
                        >
                            <div className="flex flex-wrap items-center gap-3">
                                <Select value={selectValue} onChange={(e) => setSelectValue(e.target.value)} aria-label="Demo code theme">
                                    <option value="phi-dark">Phi dark</option>
                                    <option value="phi-light">Phi light</option>
                                    <option value="github">GitHub</option>
                                </Select>
                                <Select disabled defaultValue="phi-dark" aria-label="Demo disabled select">
                                    <option value="phi-dark">Disabled</option>
                                </Select>
                                <span className="text-[12px] text-phi-text-muted">Current: <InlineCode>{selectValue}</InlineCode></span>
                            </div>
                        </DemoSection>

                        <DemoSection
                            id="switches"
                            title="Switch"
                            description="Accent track when on, overlay track when off. Always needs an accessible label."
                        >
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-3 text-[13px] text-phi-text-secondary">
                                    <Switch checked={switchOn} label="Demo switch on" onClick={() => setSwitchOn((v) => !v)} />
                                    Notifications {switchOn ? "on" : "off"}
                                </label>
                                <label className="flex items-center gap-3 text-[13px] text-phi-text-secondary">
                                    <Switch checked={switchOff} label="Demo switch off" onClick={() => setSwitchOff((v) => !v)} />
                                    Compact mode {switchOff ? "on" : "off"}
                                </label>
                                <div className="flex items-center gap-3 text-[13px] text-phi-text-muted">
                                    <Switch checked={false} label="Demo disabled switch" disabled />
                                    Disabled off
                                </div>
                                <div className="flex items-center gap-3 text-[13px] text-phi-text-muted">
                                    <Switch checked label="Demo disabled on switch" disabled />
                                    Disabled on
                                </div>
                            </div>
                        </DemoSection>

                        <p className="flex items-center gap-2 text-[12px] text-phi-text-faint">
                            <IconMoodSmileFilled className="size-4" />
                            End of the catalog — add new <InlineCode>ui/*</InlineCode> exports here before shipping them.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
