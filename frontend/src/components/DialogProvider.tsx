import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type DialogState =
  | { kind: "confirm"; title: string; message: string; danger: boolean }
  | { kind: "prompt"; title: string; message: string; initialValue: string };

interface DialogApi {
  confirm: (message: string, options?: { title?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (message: string, initialValue?: string, options?: { title?: string }) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useDialog 必须在 DialogProvider 内使用");
  return value;
}

export default function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [input, setInput] = useState("");
  const resolver = useRef<((value: boolean | string | null) => void) | null>(null);

  const finish = useCallback((value: boolean | string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setDialog(null);
  }, []);

  const confirm = useCallback<DialogApi["confirm"]>((message, options) =>
    new Promise<boolean>((resolve) => {
      resolver.current = (value) => resolve(value === true);
      setDialog({ kind: "confirm", title: options?.title ?? "操作确认", message, danger: options?.danger ?? false });
    }), []);

  const prompt = useCallback<DialogApi["prompt"]>((message, initialValue = "", options) =>
    new Promise<string | null>((resolve) => {
      resolver.current = (value) => resolve(typeof value === "string" ? value : null);
      setInput(initialValue);
      setDialog({ kind: "prompt", title: options?.title ?? "填写信息", message, initialValue });
    }), []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(dialog.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, finish]);

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/25 p-4 backdrop-blur-[2px]" onMouseDown={() => finish(dialog.kind === "confirm" ? false : null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-csg-100 bg-white shadow-[0_24px_70px_rgba(0,48,90,0.25)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="h-1 bg-gradient-to-r from-csg-700 via-csg-500 to-cyan-400" />
            <div className="p-6">
              <div className="flex items-start gap-3">
                <span className={(dialog.kind === "confirm" && dialog.danger ? "bg-red-50 text-red-600 ring-red-100" : "bg-csg-50 text-csg-700 ring-csg-100") + " grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-bold ring-1"}>
                  {dialog.kind === "confirm" && dialog.danger ? "!" : "i"}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="dialog-title" className="text-base font-semibold text-slate-900">{dialog.title}</h2>
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">{dialog.message}</p>
                </div>
              </div>
              {dialog.kind === "prompt" && (
                <input autoFocus value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && input.trim()) finish(input.trim()); }} className="focus-csg mt-5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => finish(dialog.kind === "confirm" ? false : null)}>取消</button>
                <button type="button" disabled={dialog.kind === "prompt" && !input.trim()} className={dialog.kind === "confirm" && dialog.danger ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700" : "btn-primary"} onClick={() => finish(dialog.kind === "confirm" ? true : input.trim())}>
                  {dialog.kind === "confirm" ? "确认" : "创建"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
