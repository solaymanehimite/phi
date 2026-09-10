import { memo, useState } from "react";
import { IconArrowUp, IconX } from "@tabler/icons-react";
import { Button } from "./ui/button";
import type { QueuedMessage } from "../hooks/useMessageQueue";

type Props = {
  items: QueuedMessage[];
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  /** Interrupt the running turn and send this queued message right now. */
  onSendNow: (id: string) => void;
};

function preview(text: string, max = 120): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max).trim()}…` : single;
}

const QueuedRow = memo(function QueuedRow({
  item,
  onRemove,
  onEdit,
  onSendNow,
}: {
  item: QueuedMessage;
  onRemove: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onSendNow: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const label = preview(item.text, 30);

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.text) onEdit(item.id, trimmed);
    setEditing(false);
    setDraft(item.text);
  };

  return (
    <div className="flex min-w-0 items-center gap-1.5" data-queued-id={item.id}>
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
          aria-label={`Edit queued message: ${label}`}
          className="h-8 min-w-0 flex-1 rounded-md border border-phi-border-strong bg-phi-bg-elevated px-2 text-[14px] leading-6 text-phi-text-primary outline-none focus:border-phi-accent/50"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-[14px] leading-6 text-phi-text-secondary" title={item.text}>
          {preview(item.text)}
          {item.images?.length ? (
            <span className="ml-1.5 text-phi-text-muted">+{item.images.length} image{item.images.length > 1 ? "s" : ""}</span>
          ) : null}
        </span>
      )}
      {!editing && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setDraft(item.text);
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Send now (interrupt): ${label}`}
            title="Interrupt and send now"
            onClick={() => onSendNow(item.id)}
          >
            <IconArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="icon"
            aria-label={`Remove: ${label}`}
            title="Remove"
            onClick={() => onRemove(item.id)}
          >
            <IconX className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
});

/**
 * Queued follow-ups in a narrower card fused to the top of the composer:
 * no bottom border, square bottom corners, no gap. The composer keeps its
 * own rounded top underneath.
 */
export const QueueIndicator = memo(function QueueIndicator({ items, onRemove, onEdit, onSendNow }: Props) {
  if (items.length === 0) return null;
  return (
    <div
      data-queue-indicator="queued"
      role="status"
      aria-label={`${items.length} queued message${items.length > 1 ? "s" : ""}`}
      className="mx-auto flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-2 rounded-b-none rounded-t-xl border-x border-b-0 border-t border-phi-border-strong bg-phi-bg-surface px-3 py-2"
    >
      <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
        {items.map((item) => (
          <QueuedRow
            key={item.id}
            item={item}
            onRemove={onRemove}
            onEdit={onEdit}
            onSendNow={onSendNow}
          />
        ))}
      </div>
    </div>
  );
});
