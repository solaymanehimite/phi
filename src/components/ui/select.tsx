import { useClose } from "@headlessui/react";
import { IconCheckFilled, IconChevronDownFilled } from "@tabler/icons-react";
import { useState } from "react";
import { MenuItem } from "./menu";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type SelectOption = {
    value: string;
    label: string;
};

type SelectProps = {
    options: SelectOption[];
    /** Controlled value. Omit + use defaultValue for uncontrolled. */
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    className?: string;
    disabled?: boolean;
    ariaLabel?: string;
    placeholder?: string;
};

/** Dropdown select — the code theme picker treatment: a secondary trigger
 *  opening a menu of rows with a check on the current one. Never a native
 *  `<select>`, so the trigger and the list always match the theme. */
export function Select({
    options,
    value,
    defaultValue,
    onChange,
    className = "",
    disabled,
    ariaLabel,
    placeholder,
}: SelectProps) {
    const [internal, setInternal] = useState(defaultValue ?? options[0]?.value ?? "");
    const current = value ?? internal;
    const selected = options.find((o) => o.value === current);

    return (
        <Popover className={`min-w-0 ${className}`}>
            <SelectPanel
                options={options}
                current={current}
                disabled={disabled}
                ariaLabel={ariaLabel}
                placeholder={placeholder}
                onPick={(next) => {
                    if (value === undefined) setInternal(next);
                    onChange?.(next);
                }}
            />
        </Popover>
    );
}

function SelectPanel({
    options,
    current,
    disabled,
    ariaLabel,
    placeholder,
    onPick,
}: {
    options: SelectOption[];
    current: string;
    disabled?: boolean;
    ariaLabel?: string;
    placeholder?: string;
    onPick: (value: string) => void;
}) {
    const close = useClose();
    const selected = options.find((o) => o.value === current);

    return (
        <>
            <PopoverTrigger
                disabled={disabled}
                aria-label={ariaLabel}
                className="group flex h-7 w-full items-center gap-2 rounded-lg border border-phi-border-strong bg-phi-bg-elevated px-2.5 text-left text-[12px] font-medium text-phi-text-secondary transition-colors hover:bg-phi-overlay-active hover:text-phi-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-phi-accent/40 disabled:pointer-events-none disabled:opacity-50"
            >
                <span className="min-w-0 flex-1 truncate">
                    {selected?.label ?? placeholder ?? ""}
                </span>
                <IconChevronDownFilled className="size-3.5 shrink-0 text-phi-text-muted transition-transform group-data-open:rotate-180" />
            </PopoverTrigger>
            <PopoverContent anchor={{ to: "bottom start", gap: 8 }} className="w-48 !rounded-xl p-1">
                {options.map((option) => {
                    const active = option.value === current;
                    return (
                        <MenuItem
                            key={option.value}
                            active={active}
                            onClick={() => {
                                onPick(option.value);
                                close();
                            }}
                        >
                            <span className="min-w-0 flex-1 truncate">{option.label}</span>
                            {active && <IconCheckFilled className="size-3.5 shrink-0 text-phi-accent" />}
                        </MenuItem>
                    );
                })}
            </PopoverContent>
        </>
    );
}
