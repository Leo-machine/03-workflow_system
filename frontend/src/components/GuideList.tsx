import type { GuideItem } from "../types";

interface Props {
  guide: GuideItem[];
}

/** 仅允许 http/https，避免 javascript: 等危险 scheme */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    // ignore
  }
  return null;
}

/** 操作指南条目：步骤序号 + 系统名 + 链接 + 动作 + 依据/注意（标题由外层横栏提供） */
export default function GuideList({ guide }: Props) {
  if (guide.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-400">
        本环节暂无操作指南（可在流程设计器中补充图文与链接）。
      </p>
    );
  }
  return (
    <ol className="mt-3">
      {guide.map((item, i) => {
        const href = safeHref(item.url);
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mono grid h-6 w-6 place-items-center rounded-full bg-csg-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              {i < guide.length - 1 && <span className="my-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block rounded-md bg-csg-50 px-2 py-0.5 text-xs font-medium text-csg-700 ring-1 ring-csg-200">
                  {item.system_name}
                </span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-csg-700 underline decoration-csg-200 hover:decoration-csg-600"
                  >
                    打开系统 ↗
                  </a>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.action_text}</p>
              {item.note && (
                <div className="mt-1.5 flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
                  <span className="shrink-0 font-semibold">依据/注意</span>
                  <span className="leading-relaxed">{item.note}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
