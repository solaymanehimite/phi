import { memo } from "react";
import { IconFolderFilled } from "@tabler/icons-react";
import { FileIcon as SymbolsFileIcon } from "@react-symbols/icons/utils";
import type { ProjectFile } from "../../lib/api";
import { Menu, MenuEmpty, MenuItem } from "../ui/menu";

type AtMenuProps = {
  files: ProjectFile[];
  selectedIndex: number;
  onSelect: (file: ProjectFile) => void;
  onHover: (idx: number) => void;
};

function FileIcon({ isDirectory, fileName }: { isDirectory: boolean; fileName: string }) {
  if (isDirectory) {
    return (
      <IconFolderFilled className="size-[14px] shrink-0 text-phi-text-tertiary group-data-[active=true]:text-phi-text-secondary" />
    );
  }
  return (
    <SymbolsFileIcon
      fileName={fileName}
      autoAssign
      width={14}
      height={14}
      className="shrink-0"
      aria-hidden="true"
    />
  );
}

export const AtMenu = memo(function AtMenu({ files, selectedIndex, onSelect, onHover }: AtMenuProps) {
  if (files.length === 0) {
    return (
      <Menu>
        <MenuEmpty>No files match</MenuEmpty>
      </Menu>
    );
  }
  return (
    <Menu
      role="listbox"
      aria-label="Files"
      className="max-h-[min(300px,42vh)] overflow-y-auto !bg-transparent backdrop-blur-xl transition duration-100 ease-out"
    >
      {files.map((f, idx) => {
        const active = idx === selectedIndex;
        // split path into dir + name for subtle secondary
        const slash = f.path.lastIndexOf("/");
        const dir = slash !== -1 ? f.path.slice(0, slash + 1) : "";
        const name = f.isDirectory ? `${f.name}/` : f.name;
        return (
          <MenuItem
            key={f.path + (f.isDirectory ? "/" : "")}
            role="option"
            aria-selected={active}
            active={active}
            onMouseEnter={() => onHover(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(f);
            }}
            className="gap-2.5 px-2.5"
          >
            <FileIcon isDirectory={f.isDirectory} fileName={f.name} />
            <span className="min-w-0 flex-1 truncate">
              {dir ? <span className="text-phi-text-muted">{dir}</span> : null}
              <span className={`font-medium ${active ? "text-phi-text-primary" : "text-phi-text-secondary"}`}>{name}</span>
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
});
