import { memo } from "react";
import { FolderIcon, DocumentIcon } from "@heroicons/react/24/solid";
import type { ProjectFile } from "../../lib/api";

type AtMenuProps = {
  files: ProjectFile[];
  selectedIndex: number;
  onSelect: (file: ProjectFile) => void;
  onHover: (idx: number) => void;
};

function FileIcon({ isDirectory }: { isDirectory: boolean }) {
  return isDirectory ? (
    <FolderIcon className="size-[14px] shrink-0 text-phi-text-tertiary group-[.is-active]:text-phi-text-secondary" />
  ) : (
    <DocumentIcon className="size-[14px] shrink-0 text-phi-text-tertiary group-[.is-active]:text-phi-text-secondary" />
  );
}

export const AtMenu = memo(function AtMenu({ files, selectedIndex, onSelect, onHover }: AtMenuProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-white shadow-xl">
        <div className="rounded-lg px-3 py-1.5 text-[13px] text-phi-text-muted">No files match</div>
      </div>
    );
  }
  return (
    <div
      role="listbox"
      aria-label="Files"
      className="max-h-[min(300px,42vh)] overflow-y-auto rounded-xl border border-phi-border-faint bg-phi-bg-elevated p-1 text-sm/6 text-phi-white shadow-xl transition duration-100 ease-out"
    >
      {files.map((f, idx) => {
        const active = idx === selectedIndex;
        // split path into dir + name for subtle secondary
        const slash = f.path.lastIndexOf("/");
        const dir = slash !== -1 ? f.path.slice(0, slash + 1) : "";
        const name = f.isDirectory ? `${f.name}/` : f.name;
        return (
          <button
            key={f.path + (f.isDirectory ? "/" : "")}
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(f);
            }}
            className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] focus:outline-none ${
              active ? "is-active bg-phi-overlay-strong text-phi-text-primary" : "text-phi-text-secondary hover:bg-phi-overlay-strong"
            }`}
          >
            <FileIcon isDirectory={f.isDirectory} />
            <span className="min-w-0 flex-1 truncate">
              {dir ? <span className="text-phi-text-muted">{dir}</span> : null}
              <span className={`font-medium ${active ? "text-phi-text-primary" : "text-phi-text-secondary"}`}>{name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
});
