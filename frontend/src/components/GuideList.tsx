import { useState } from "react";
import type { GuideItem, PersonBrief } from "../types";
import { resolvedOperatorLabel } from "../lib/operatorRoles";
import AuthenticatedImage from "./AuthenticatedImage";

interface Props {
  guide: GuideItem[];
  /** 序号起始值（1-based），用于「带我办理」只展示一条时显示全局序号 */
  numberFrom?: number;
  emptyHint?: string;
  compact?: boolean;
  /** “带我办理”聚焦模式：把操作内容置于最强视觉层级 */
  focusMode?: boolean;
  /** 办理事项创建人的稳定姓名，仅用于动态解析“流程发起人” */
  initiatorName?: string;
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

/** 系统操作指引：操作主体 + 支撑/升级联系人 + 系统链接 + 图示 + 动作 */
export default function GuideList({ guide, numberFrom = 1, emptyHint, compact = false, focusMode = false, initiatorName }: Props) {
  if (guide.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500">
        {emptyHint ?? "本环节暂无系统操作指引（可在流程设计器中补充操作主体、支撑联系人、图文与链接）。"}
      </p>
    );
  }
  return (
    <ol className={focusMode ? "mt-0" : "mt-3"}>
      {guide.map((item, i) => {
        const href = safeHref(item.url);
        const imageHref = safeHref(item.image_path);
        const number = numberFrom + i;
        const leader = directLeaderOf(item);
        const operator = resolvedOperatorLabel(item, initiatorName);
        const showRoles = Boolean(item.unit || item.persons.length > 0 || leader);
        return (
          <li key={item.id} className={focusMode ? "flex gap-3 sm:gap-4" : "flex gap-3"}>
            <div className="flex flex-col items-center">
              <span className={(focusMode ? "h-9 w-9 text-sm shadow-sm" : "h-7 w-7 text-xs") + " mono grid place-items-center rounded-full bg-csg-600 font-semibold text-white"}>
                {number}
              </span>
              {i < guide.length - 1 && <span className="my-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className={(focusMode ? "grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]" : "") + " min-w-0 flex-1 " + (compact ? "pb-2" : "pb-5")}>
              {focusMode ? (
                <div className="relative overflow-hidden rounded-2xl border border-csg-200 bg-gradient-to-br from-csg-50 via-white to-cyan-50 p-4 shadow-[0_10px_28px_rgba(0,105,180,0.09)] sm:p-5">
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-csg-700 to-cyan-400" />
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-1">
                    <div>
                      <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-400">本步操作主体</div>
                      <div className="mt-0.5 text-sm font-bold text-csg-800">{operator}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400">操作平台</span>
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-csg-800 ring-1 ring-csg-200">{item.system_name}</span>
                      {href && (
                        <a href={href} target="_blank" rel="noreferrer noopener" className="rounded-lg bg-csg-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-csg-700">
                          打开平台 ↗
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 pl-1 text-[10px] font-semibold tracking-[0.12em] text-csg-600">请执行以下操作</div>
                  <p className="mt-1 pl-1 text-lg font-semibold leading-8 text-slate-950 sm:text-xl">{item.action_text}</p>
                </div>
              ) : (
                <>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-csg-50 px-2.5 py-1 text-xs text-csg-800 ring-1 ring-csg-100">
                    <span className="text-slate-500">本步操作主体</span>
                    <strong>{operator}</strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-slate-400">操作平台</span>
                    <span className="inline-block rounded-md bg-csg-50 px-2 py-0.5 text-xs font-semibold text-csg-800 ring-1 ring-csg-200">{item.system_name}</span>
                    {href && (
                      <a href={href} target="_blank" rel="noreferrer noopener" className="text-xs font-medium text-csg-700 underline decoration-csg-200 hover:decoration-csg-600">
                        打开系统 ↗
                      </a>
                    )}
                  </div>
                  <div className={(compact ? "mt-2.5 p-3" : "mt-3 p-4") + " rounded-xl border border-csg-200 bg-gradient-to-r from-csg-50 to-white shadow-sm"}>
                    <div className="text-[11px] font-semibold tracking-wider text-csg-600">具体操作</div>
                    <p className={(compact ? "mt-1 text-base leading-7" : "mt-1.5 text-base leading-7") + " font-semibold text-slate-900"}>{item.action_text}</p>
                  </div>
                </>
              )}

              {showRoles && (
                <div className={(focusMode ? "grid gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-1" : (compact ? "mt-1.5 px-2.5 py-1.5" : "mt-2 px-3 py-2") + " space-y-2 rounded-lg bg-slate-50 ring-1 ring-slate-100")}>
                  <div className={(focusMode ? "sm:col-span-2 lg:col-span-1" : "") + " text-[11px] font-medium text-slate-400"}>
                    {item.unit?.name ?? "未设支撑团队"}
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">业务/技术支撑联系人</div>
                    {item.persons.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">未指定</p>
                    ) : (
                      <div className={(compact ? "mt-0.5" : "mt-1") + " flex flex-wrap gap-3"}>
                        {item.persons.map((person) => (
                          <div key={person.id} className="flex items-center gap-2">
                            <PersonLine person={person} />
                            <CopyContact person={person} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={(focusMode ? "border-l-0 sm:border-l sm:border-t-0 sm:pl-3 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-2" : "") + " flex items-start justify-between gap-2 border-t border-slate-100 pt-2"}>
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-slate-500">协调升级联系人</div>
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

              {imageHref && (
                <AuthenticatedImage
                  path={imageHref}
                  alt={`${item.system_name} 操作图示`}
                  linkClassName={(compact ? "mt-1.5" : "mt-2") + (focusMode ? " lg:col-span-2" : "") + " block max-w-md"}
                  className={(compact ? "max-h-28" : "max-h-40") + " w-full rounded-lg border border-slate-200 object-contain bg-slate-50"}
                />
              )}
              {item.note && (
                <div className={(focusMode ? "lg:col-span-2 " : "") + "mt-2 flex gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-950 ring-1 ring-amber-200"}>
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
