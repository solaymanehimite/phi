import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "./ui/button";
import { ArrowUpIcon, ChevronDownIcon } from "./ui/icons";

type ComposerProps = {
  onSend: (message: string) => void;
};

export function Composer({ onSend }: ComposerProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = message.trim();
    if (!content) return;

    onSend(content);
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-3xl rounded-[17px] border border-white/[0.095] bg-[#151516] p-2 shadow-[0_14px_45px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.025)] transition-[border-color,box-shadow] focus-within:border-white/[0.16] focus-within:shadow-[0_16px_50px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.018)]"
    >
      <textarea
        ref={textareaRef}
        value={message}
        rows={2}
        aria-label="Message Pi"
        placeholder="Message Pi…"
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={handleKeyDown}
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`;
        }}
        className="block max-h-[180px] min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-[14px] leading-6 text-[#e1e1e3] outline-none placeholder:text-[#5e5e63]"
      />

      <div className="flex items-center justify-between gap-3 px-0.5 pb-0.5">
        <label className="relative inline-flex h-8 items-center rounded-lg text-[12px] text-[#8b8b91] transition-colors hover:bg-white/[0.05] hover:text-[#bdbdc1] focus-within:ring-2 focus-within:ring-[#d6a85f]/40">
          <select
            aria-label="Model"
            defaultValue="auto"
            className="h-full cursor-pointer appearance-none bg-transparent py-0 pl-2.5 pr-7 outline-none"
          >
            <option value="auto">Auto</option>
            <option value="sonnet">Claude Sonnet</option>
            <option value="gpt">GPT-5</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-1.5 size-3.5" />
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={!message.trim()}
          aria-label="Send message"
          title="Send message"
        >
          <ArrowUpIcon />
        </Button>
      </div>
    </form>
  );
}
