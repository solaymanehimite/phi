import { useEffect, useState } from "react";
import { hasDraftFor } from "./useDraft";

export function useHasDraft(file: string | null): boolean {
  const [has, setHas] = useState(() => hasDraftFor(file));
  useEffect(() => {
    const check = () => setHas(hasDraftFor(file));
    check();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes("phi:draft")) check();
    };
    const onCustom = () => check();
    window.addEventListener("storage", onStorage);
    window.addEventListener("phi:draft-change" as any, onCustom);
    const id = window.setInterval(check, 800);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("phi:draft-change" as any, onCustom);
      window.clearInterval(id);
    };
  }, [file]);
  return has;
}
