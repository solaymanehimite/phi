import {
  ArrowDownIcon as HeroArrowDownIcon,
  ArrowUpIcon as HeroArrowUpIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon as HeroChevronDownIcon,
  ChevronDoubleLeftIcon as HeroPanelLeftIcon,
  PencilSquareIcon,
  StopIcon as HeroStopIcon,
} from "@heroicons/react/24/solid";
import type { ComponentProps } from "react";

type IconProps = ComponentProps<typeof HeroArrowUpIcon>;

export function ComposeIcon(props: IconProps) {
  return <PencilSquareIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function PanelLeftIcon(props: IconProps) {
  return <HeroPanelLeftIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function ChatIcon(props: IconProps) {
  return <ChatBubbleLeftIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <HeroChevronDownIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function ArrowDownIcon(props: IconProps) {
  return <HeroArrowDownIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function ArrowUpIcon(props: IconProps) {
  return <HeroArrowUpIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}

export function StopIcon(props: IconProps) {
  return <HeroStopIcon {...props} className={`size-4 ${props.className ?? ""}`} />;
}
