import { memo, useState } from "react";
import { IconClockPlus, IconPencil, IconTrash, IconBolt } from "@tabler/icons-react";
import { Button } from "./ui/button";
import type { QueuedMessage } from "../hooks/useMessageQueue";

type Props = {
  items: QueuedMessage[];
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  /** Interrupt the running turn and send this queued message right now. */
  onSendNow: (id: string) => void;
  onClear: () => void;
  /** Another indicator (compaction) sits directly above — square the top. */
  attachedAbove?: boolean;
};

function preview(text: string, max = 120): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max).trim()}…` : single;
}

const QueuedRow = memo(function QueuedRow({
  item,
  position,
  onRemove,
  onEdit,
  onSendNow,
}: {
  item: QueuedMessage;
  position: number;
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onSendNow: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.text) onEdit(item.id, trimmed);
    setEditing(false);
    setDraft(item.text);
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-queued-id={item.id}>
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-md bg-phi-overlay text-[10px] font-semibold tabular-nums text-phi-text-tertiary"
      >
        {position}
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(item.text);
            }
          }}
          onBlur={commitEdit}
          aria-label={`Edit queued message ${position}`}
          className="h-7 min-w-0 flex-1 rounded-md border border-phi-border-strong bg-phi-bg-elevated px-2 text-[12px] text-phi-text-primary outline-none focus:border-phi-accent/50"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px] text-phi-text-secondary" title={item.text}>
          {preview(item.text)}
          {item.images?.length ? (
            <span className="ml-1.5 text-phi-text-muted">+{item.images.length} image{item.images.length > 1 ? "s" : ""}</span>
          ) : null}
        </span>
      )}
      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="mini"
            size="icon"
            aria-label={`Send queued message ${position} now (interrupt)`}
            title="Interrupt and send now"
            onClick={() => onSendNow(item.id)}
          >
            <IconBolt className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="mini"
            size="icon"
            aria-label={`Edit queued message ${position}`}
            title="Edit"
            onClick={() => {
              setDraft(item.text);
              setEditing(true);
            }}
          >
            <IconPencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="mini"
            size="icon"
            aria-label={`Discard queued message ${position}`}
            title="Discard"
            onClick={() => onRemove(item.id)}
          >
            <IconTrash className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
});

/**
 * Queued follow-ups, attached directly above the composer with the same
 * borderless square-bottom treatment as the compaction indicator — no
 * spacing, no bottom border, no status dots.
 */
export const QueueIndicator = memo(function QueueIndicator({ items, onRemove, onEdit, onSendNow, onClear, attachedAbove }: Props) {
  if (items.length === 0) return null;
  return (
    <div
      data-queue-indicator="queued"
      role="status"
      aria-label={`${items.length} queued message${items.length > 1 ? "s" : ""}`}
      className={`mx-auto flex w-full max-w-3xl flex-col gap-1.5 rounded-b-none border-x border-b-0 border-phi-border-strong bg-phi-bg-surface px-3 py-2 ${attachedAbove ? "rounded-t-none border-t-0" : "rounded-t-xl border-t"}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconClockPlus aria-hidden className="size-4 shrink-0 text-phi-text-tertiary" />
          <span className="truncate text-[12px] font-medium text-phi-text-secondary">
            Queued {items.length} — sends in order after this turn
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClear}
            className="!h-6 !px-2 !text-[11px] !text-phi-text-muted"
          >
            Clear
          </Button>
        </div>
      </div>
      <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
        {items.map((item, index) => (
          <QueuedRow
            key={item.id}
            item={item}
            position={index + 1}
            onRemove={onRemove}
            onEdit={onEdit}
            onSendNow={onSendNow}
          />
        ))}
      </div>
    </div>
  );
});
