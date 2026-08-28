import {
  ArrowUp,
  ChevronDown,
  MessageSquare,
  PanelLeft,
  Square,
  SquarePen,
} from "lucide-react";
import type { ComponentProps } from "react";

type IconProps = ComponentProps<typeof ArrowUp>;

export function ComposeIcon(props: IconProps) {
  return <SquarePen {...props} size={16} strokeWidth={2.25} />;
}

export function PanelLeftIcon(props: IconProps) {
  return <PanelLeft {...props} size={16} strokeWidth={2.25} />;
}

export function ChatIcon(props: IconProps) {
  return <MessageSquare {...props} size={16} strokeWidth={2.25} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <ChevronDown {...props} size={16} strokeWidth={2.25} />;
}

export function ArrowUpIcon(props: IconProps) {
  return <ArrowUp {...props} size={16} strokeWidth={2.25} />;
}

export function StopIcon(props: IconProps) {
  return <Square {...props} size={16} strokeWidth={2.25} className={`fill-current ${props.className ?? ""}`} />;
}
