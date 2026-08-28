import { ChatIcon } from "./icons";

type SidebarItemProps = {
  active?: boolean;
  label: string;
  onClick: () => void;
};

export function SidebarItem({ active = false, label, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 ${
        active
          ? "bg-phi-overlay-active text-phi-text-primary"
          : "text-phi-text-tertiary hover:bg-phi-overlay-hover hover:text-phi-text-secondary"
      }`}
    >
      <ChatIcon className={active ? "text-phi-icon-active" : "text-phi-icon group-hover:text-phi-text-secondary"} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
