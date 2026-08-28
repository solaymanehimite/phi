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
      className={`group flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d6a85f]/40 ${
        active
          ? "bg-white/[0.075] text-[#e3e3e5]"
          : "text-[#79797f] hover:bg-white/[0.045] hover:text-[#bdbdc1]"
      }`}
    >
      <ChatIcon className={active ? "text-[#b9b9be]" : "text-[#5f5f65]"} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
