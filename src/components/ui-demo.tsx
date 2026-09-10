import { useState, type ReactNode } from "react";
import {
    IconDotsFilled,
    IconMessageCircleFilled,
    IconPencilFilled,
    IconSearch,
    IconSendFilled,
    IconSettingsFilled,
    IconTrashFilled,
} from "@tabler/icons-react";
import { Alert } from "./ui/alert";
import { Button, buttonClass } from "./ui/button";
import { InlineCode } from "./ui/code";
import { Composer } from "./composer";
import { QueueIndicator } from "./queue-indicator";
import type { QueuedMessage } from "../hooks/useMessageQueue";
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
    { id: "steering", label: "Steering & queue" },
] as const;

function DemoSection({
    id,
    title,
    children,
}: {
    id: string;
    title: string;
    children: ReactNode;
}) {
    return (
        <section id={`ui-demo-${id}`} aria-label={title} className="scroll-mt-4">
            <h2 className="text-[13px] font-medium text-phi-text-tertiary">{title}</h2>
            <div className="mt-3">{children}</div>
        </section>
    );
}

export function UiDemoPanel() {
    const [switchOn, setSwitchOn] = useState(true);
    const [switchOff, setSwitchOff] = useState(false);
    const [groupCollapsed, setGroupCollapsed] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectValue, setSelectValue] = useState("phi-dark");
    const [navActive, setNavActive] = useState("chats");
    const [menuActive, setMenuActive] = useState(0);
    // Steering & queue demo state — mirrors the live stack in App.tsx:
    // QueueIndicator floating above a streaming Composer.
    const [demoQueue, setDemoQueue] = useState<QueuedMessage[]>([
        { id: "demo-1", text: "Also update the empty-state copy while you're in there", createdAt: Date.now() },
        { id: "demo-2", text: "And check the mobile layout for the sidebar", createdAt: Date.now() },
    ]);
    const [demoAbortArmed, setDemoAbortArmed] = useState(false);

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
                        <DemoSection id="buttons" title="Button">
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="primary" size="sm"><IconSendFilled className="size-3.5" /> Send</Button>
                                <Button variant="secondary">Test connection</Button>
                                <Button variant="ghost">Cancel</Button>
                                <Button variant="icon" aria-label="More options"><IconDotsFilled className="size-4" /></Button>
                                <Button variant="danger" size="sm">Stop</Button>
                                <Button variant="mini" aria-label="Copy"><IconPencilFilled className="size-3.5" /></Button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button variant="secondary" size="xs">Extra small</Button>
                                <Button variant="secondary" size="sm">Small</Button>
                                <Button variant="secondary" size="md">Medium</Button>
                                <Button variant="icon" size="icon" aria-label="Search"><IconSearch className="size-4" /></Button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button variant="primary" size="sm" disabled><IconSendFilled className="size-3.5" /> Send</Button>
                                <Button variant="secondary" disabled>Test connection</Button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <a href="#ui-demo-buttons" onClick={(e) => e.preventDefault()} className={buttonClass("secondary", "sm")}>
                                    Link as button
                                </a>
                            </div>
                        </DemoSection>

                        <DemoSection id="inputs" title="Input">
                            <div className="flex max-w-sm flex-col gap-2">
                                <Input variant="search" placeholder="Search sessions…" aria-label="Demo search input" />
                                <Input variant="inline" defaultValue="my-session-name" aria-label="Demo inline input" />
                                <Input variant="default" placeholder="Project name" aria-label="Demo project name" />
                                <Input variant="default" placeholder="Disabled field" disabled aria-label="Demo disabled input" />
                            </div>
                        </DemoSection>

                        <DemoSection id="alerts" title="Alert">
                            <div className="flex flex-col gap-2">
                                <Alert variant="error">Error — streaming failed. Check the sidecar and retry.</Alert>
                                <Alert variant="warning">Warning — no models available. Run <InlineCode>pi auth</InlineCode> to connect one.</Alert>
                                <Alert variant="info">Info — 3 sessions were archived this week.</Alert>
                                <Alert variant="muted">Muted — this notice was dismissed and kept for context.</Alert>
                            </div>
                        </DemoSection>

                        <DemoSection id="pills" title="Hint">
                            <div className="flex items-center gap-3 text-[13px] text-phi-text-secondary">
                                <span className="min-w-0 flex-1 truncate">claude-opus-4-6</span>
                                <Hint>anthropic · 12</Hint>
                            </div>
                        </DemoSection>

                        <DemoSection id="code" title="InlineCode">
                            <p className="text-[13px] leading-6 text-phi-text-secondary">
                                Sessions live in <InlineCode>~/.pi/agent/sessions</InlineCode>.
                            </p>
                        </DemoSection>

                        <DemoSection id="surfaces" title="Well">
                            <Well className="px-3 py-2.5">
                                <p className="font-mono text-[12px] leading-5 text-phi-text-secondary">$ pi sessions list --cwd ~/projects/phi</p>
                                <p className="font-mono text-[12px] leading-5 text-phi-text-muted">3 sessions · newest first</p>
                            </Well>
                        </DemoSection>

                        <DemoSection id="collapsibles" title="Group collapsible">
                            <GroupCollapsibleTrigger collapsed={groupCollapsed} onClick={() => setGroupCollapsed((v) => !v)}>
                                <span className="flex-1">Phi — ~/Dev/ship/Phi</span>
                                <Hint>4</Hint>
                            </GroupCollapsibleTrigger>
                            {!groupCollapsed && (
                                <div className="px-2 pb-2">
                                    <NavItem label="Refactor tab switching" onClick={() => {}} icon={IconMessageCircleFilled} />
                                </div>
                            )}
                        </DemoSection>

                        <DemoSection id="menus" title="Menu primitives">
                            <div className="flex flex-col gap-3">
                                <Menu className="max-w-sm">
                                    <MenuLabel>Files</MenuLabel>
                                    {[0, 1].map((i) => (
                                        <MenuItem key={i} active={menuActive === i} onMouseEnter={() => setMenuActive(i)} onClick={() => setMenuActive(i)}>
                                            <IconMessageCircleFilled className="size-4 shrink-0 text-phi-text-muted" />
                                            <span className="min-w-0 flex-1 truncate">src/components/{["tabs.tsx", "sidebar.tsx"][i]}</span>
                                            <Hint>{["2k", "8k"][i]}</Hint>
                                        </MenuItem>
                                    ))}
                                </Menu>
                                <Menu className="max-w-sm">
                                    <MenuEmpty>No results found.</MenuEmpty>
                                </Menu>
                            </div>
                        </DemoSection>

                        <DemoSection id="dropdowns" title="DropdownMenu">
                            <div className="group flex max-w-sm items-center gap-2">
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

                        <DemoSection id="popovers" title="Popover">
                            <Popover className="relative">
                                <PopoverTrigger className={buttonClass("secondary", "xs", "group w-44 !text-[11px]")}>
                                    <span className="min-w-0 flex-1 truncate text-left">Bottom-end panel</span>
                                </PopoverTrigger>
                                <PopoverContent anchor={{ to: "bottom start", gap: 8 }} className="w-56 p-1">
                                    <MenuItem active onClick={() => {}}><span className="flex-1">Dark theme</span></MenuItem>
                                    <MenuItem onClick={() => {}}>Light theme</MenuItem>
                                    <MenuItem onClick={() => {}}>System</MenuItem>
                                </PopoverContent>
                            </Popover>
                        </DemoSection>

                        <DemoSection id="nav" title="NavItem">
                            <div className="flex max-w-sm flex-col gap-0.5">
                                <NavItem
                                    label="Chats"
                                    icon={IconMessageCircleFilled}
                                    active={navActive === "chats"}
                                    onClick={() => setNavActive("chats")}
                                    ariaCurrent={navActive === "chats" ? "page" : undefined}
                                />
                                <NavItem
                                    label="Settings"
                                    icon={IconSettingsFilled}
                                    active={navActive === "settings"}
                                    onClick={() => setNavActive("settings")}
                                    ariaCurrent={navActive === "settings" ? "page" : undefined}
                                >
                                    <span className="min-w-0 flex-1 truncate">Settings</span>
                                    <Hint>3</Hint>
                                </NavItem>
                            </div>
                        </DemoSection>

                        <DemoSection id="dialogs" title="Dialog">
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

                        <DemoSection id="empty" title="EmptyState">
                            <div className="flex flex-col gap-6">
                                <EmptyState
                                    title="No sessions found"
                                    description="Run pi in this workspace to create one."
                                    detail="Sessions appear here automatically."
                                />
                                <EmptyState compact title="No results" description="Try a different search.">
                                    <Button variant="secondary" size="xs" className="mt-3">Clear search</Button>
                                </EmptyState>
                            </div>
                        </DemoSection>

                        <DemoSection id="selects" title="Select">
                            <div className="flex flex-wrap items-center gap-3">
                                <Select value={selectValue} onChange={(e) => setSelectValue(e.target.value)} aria-label="Demo code theme">
                                    <option value="phi-dark">Phi dark</option>
                                    <option value="phi-light">Phi light</option>
                                </Select>
                                <Select disabled defaultValue="phi-dark" aria-label="Demo disabled select">
                                    <option value="phi-dark">Disabled</option>
                                </Select>
                            </div>
                        </DemoSection>

                        <DemoSection id="switches" title="Switch">
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
                                    Disabled
                                </div>
                            </div>
                        </DemoSection>

                        <DemoSection id="steering" title="Steering & queue">
                            <p className="mb-3 text-[12.5px] leading-5 text-phi-text-muted">
                                Live stack from the chat view: <InlineCode>QueueIndicator</InlineCode> floating above a streaming <InlineCode>Composer</InlineCode>. Type a follow-up and hit Enter to queue it; arm Esc to preview the two-step stop.
                            </p>
                            {/* Same stack as App.tsx: queue floats narrower above the composer. */}
                            <div className="mx-auto flex w-full max-w-3xl flex-col gap-0">
                                <QueueIndicator
                                    items={demoQueue}
                                    onRemove={(id) => setDemoQueue((prev) => prev.filter((q) => q.id !== id))}
                                    onEdit={(id, text) => setDemoQueue((prev) => prev.map((q) => (q.id === id ? { ...q, text } : q)))}
                                    onSendNow={(id) => setDemoQueue((prev) => prev.filter((q) => q.id !== id))}
                                />
                                <Composer
                                    onSend={() => {}}
                                    abortArmed={demoAbortArmed}
                                    onQueue={(message) => {
                                        const trimmed = message.trim();
                                        if (!trimmed) return;
                                        setDemoQueue((prev) => [
                                            ...prev,
                                            { id: `demo-${Date.now().toString(36)}`, text: trimmed, createdAt: Date.now() },
                                        ]);
                                    }}
                                    isStreaming
                                    draftKey="ui-demo-steering"
                                />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() =>
                                        setDemoQueue((prev) => [
                                            ...prev,
                                            { id: `demo-${Date.now().toString(36)}`, text: "Take a look at the failing test in tabs.tsx too", createdAt: Date.now() },
                                        ])
                                    }
                                >
                                    Add sample follow-up
                                </Button>
                                <Button variant={demoAbortArmed ? "primary" : "secondary"} size="xs" onClick={() => setDemoAbortArmed((v) => !v)}>
                                    {demoAbortArmed ? "Esc armed" : "Arm Esc"}
                                </Button>
                                <Button variant="ghost" size="xs" onClick={() => setDemoQueue([])}>
                                    Clear queue
                                </Button>
                            </div>
                        </DemoSection>
                    </div>
                </div>
            </div>
        </div>
    );
}
