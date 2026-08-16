import { useState } from "react";
import type { GuideItem, PersonBrief } from "../types";
import AuthenticatedImage from "./AuthenticatedImage";

interface Props {
  guide: GuideItem[];
  /** 序号起始值（1-based），用于「带我办理」只展示一条时显示全局序号 */
  numberFrom?: number;
  emptyHint?: string;
  compact?: boolean;
}

function safeHref(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/media/")) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch {
    // ignore
  }
  return null;
}

function directLeaderOf(item: GuideItem): PersonBrief | null {
  return item.direct_leader ?? item.escalation ?? item.unit?.leader ?? null;
}

function PersonLine({ person }: { person: PersonBrief }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-csg-50 text-xs font-semibold text-csg-700 ring-1 ring-csg-200">
        {person.name.slice(0, 1)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-800">{person.name}</div>
        <div className="text-[11px] text-slate-500">
          {person.title ? `${person.title} · ` : ""}
          {person.contact ?? "未留联系方式"}
        </div>
      </div>
    </div>
  );
}

function CopyContact({ person }: { person: PersonBrief }) {
  const [copied, setCopied] = useState(false);
  async function copyContact() {
    const payload = person.contact?.trim() || [person.name, person.title].filter(Boolean).join(" ");
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // 部分内网浏览器禁用 clipboard
    }
  }
  return (
    <button type="button" className="shrink-0 text-[11px] font-medium text-csg-700 hover:text-csg-900" onClick={() => void copyContact()}>
      {copied ? "已复制" : "复制联系方式"}
    </button>
  );
}

/** 系统操作指引：责任人 / 直接领导 + 系统链接 + 图示 + 动作 */
export default function GuideList({ guide, numberFrom = 1, emptyHint, compact = false }: Props) {
  if (guide.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        {emptyHint ?? "本环节暂无系统操作指引（可在流程设计器中补充责任人、直接领导、图文与链接）。"}
      </p>
    );
  }
  return (
    <ol className="mt-3">
      {guide.map((item, i) => {
        const href = safeHref(item.url);
        const imageHref = safeHref(item.image_path);
        const number = numberFrom + i;
        const leader = directLeaderOf(item);
        const showRoles = Boolean(item.unit || item.persons.length > 0 || leader);
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mono grid h-7 w-7 place-items-center rounded-full bg-csg-600 text-xs font-semibold text-white">
                {number}
              </span>
              {i < guide.length - 1 && <span className="my-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className={"flex-1 " + (compact ? "pb-2" : "pb-5")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block rounded-md bg-csg-50 px-2 py-0.5 text-xs font-semibold text-csg-800 ring-1 ring-csg-200">
                  {item.system_name}
                </span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-medium text-csg-700 underline decoration-csg-200 hover:decoration-csg-600"
                  >
                    打开系统 ↗
                  </a>
                )}
              </div>

              {showRoles && (
                <div className={(compact ? "mt-1.5 px-2.5 py-1.5" : "mt-2 px-3 py-2") + " space-y-2 rounded-lg bg-slate-50 ring-1 ring-slate-100"}>
                  <div className="text-[11px] font-medium text-slate-400">
                    {item.unit?.name ?? "未设责任团队"}
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">责任人</div>
                    {item.persons.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">未指定</p>
                    ) : (
                      <div className={(compact ? "mt-0.5" : "mt-1") + " flex flex-wrap gap-3"}>
                        {item.persons.map((person) => (
                          <PersonLine key={person.id} person={person} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2 border-t border-slate-100 pt-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">直接领导</div>
                      {leader ? (
                        <div className="mt-1">
                          <PersonLine person={leader} />
                          {!item.escalation && item.unit?.leader && (
                            <p className="mt-0.5 text-[11px] text-slate-400">默认取团队负责人</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">未指定</p>
                      )}
                    </div>
                    {leader && <CopyContact person={leader} />}
                  </div>
                </div>
              )}

              <p className={(compact ? "mt-1 leading-5" : "mt-1.5 leading-relaxed") + " text-sm text-slate-700"}>{item.action_text}</p>
              {imageHref && (
                <AuthenticatedImage
                  path={imageHref}
                  alt={`${item.system_name} 操作图示`}
                  linkClassName={(compact ? "mt-1.5" : "mt-2") + " block max-w-md"}
                  className={(compact ? "max-h-28" : "max-h-40") + " w-full rounded-lg border border-slate-200 object-contain bg-slate-50"}
                />
              )}
              {item.note && (
                <div className="mt-2 flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 ring-1 ring-amber-200">
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
