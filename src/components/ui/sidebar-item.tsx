import { IconMessageCircleFilled } from "@tabler/icons-react";
import { NavItem } from "./nav-item";

type SidebarItemProps = {
  active?: boolean;
  label: string;
  onClick: () => void;
};

/** @deprecated Use NavItem — kept for compat. */
export function SidebarItem({ active = false, label, onClick }: SidebarItemProps) {
  return <NavItem active={active} label={label} onClick={onClick} icon={IconMessageCircleFilled} />;
}
