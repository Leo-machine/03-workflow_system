import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { ChangeLogEntry } from "../types";

const PAGE_SIZE = 20;

const FLOW_FIELD_LABELS: Record<string, string> = {
  create: "创建流程",
  name: "流程改名",
  description: "修改说明",
  status: "状态变更",
  definition: "定义变更",
  delete: "删除流程",
};

const PERSON_FIELD_LABELS: Record<string, string> = {
  create: "新增人员",
  name: "人员改名",
  unit: "调整单位",
  title: "调整职务",
  contact: "更新联系方式",
  domains: "调整服务域",
  active: "停用/启用",
  delete: "删除人员",
};

const UNIT_FIELD_LABELS: Record<string, string> = {
  create: "新增单位",
  name: "单位改名",
  delete: "删除单位",
};

const DOMAIN_FIELD_LABELS: Record<string, string> = {
  create: "新增业务域",
  name: "业务域改名",
  delete: "删除业务域",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

/** 把一条日志翻译成「类型 / 对象 / 内容」三元组，assignment（历史）/ flow / person / unit 都可读 */
function describe(log: ChangeLogEntry): { type: string; target: string; detail: string } {
  const target = log.new_name ?? log.old_name ?? `#${log.entity_id}`;

  if (log.entity_type === "assignment") {
    // 历史遗留：岗位改派（roles 表已废弃，以快照为准）
    return {
      type: "岗位改派",
      target: log.role_name ?? target,
      detail: `${log.old_name ?? "—"} → ${log.new_name ?? "—"}`,
    };
  }
  if (log.entity_type === "person") {
    const type = PERSON_FIELD_LABELS[log.field] ?? log.field;
    let detail = "";
    if (["name", "unit", "title", "contact", "domains", "active"].includes(log.field)) {
      detail = `${log.old_value ?? log.old_name ?? "—"} → ${log.new_value ?? log.new_name ?? "—"}`;
    }
    return { type, target, detail };
  }
  if (log.entity_type === "unit") {
    const type = UNIT_FIELD_LABELS[log.field] ?? log.field;
    const detail = log.field === "name" ? `${log.old_name ?? "—"} → ${log.new_name ?? "—"}` : "";
    return { type, target, detail };
  }
  if (log.entity_type === "domain") {
    const type = DOMAIN_FIELD_LABELS[log.field] ?? log.field;
    const detail = log.field === "name" ? `${log.old_name ?? "—"} → ${log.new_name ?? "—"}` : "";
    return { type, target, detail };
  }

  // flow 类日志
  const type = FLOW_FIELD_LABELS[log.field] ?? log.field;
  let detail = "";
  switch (log.field) {
    case "name":
      detail = `${log.old_name ?? "—"} → ${log.new_name ?? "—"}`;
      break;
    case "status":
      detail = `${log.old_value ?? "—"} → ${log.new_value ?? "—"}`;
      break;
    case "definition":
      detail = `环节数 ${log.new_value ?? "—"}`;
      break;
    case "description":
      detail = "说明已更新";
      break;
    default:
      detail = log.old_value || log.new_value ? `${log.old_value ?? "—"} → ${log.new_value ?? "—"}` : "";
  }
  return { type, target, detail };
}

/** 变更记录（admin 专属，只读）：谁在何时把什么改成了什么 */
export default function ChangeLogPanel({
  entityType,
  entityId,
  title = "变更记录",
}: {
  entityType?: string;
  entityId?: string;
  title?: string;
} = {}) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (entityType) params.set("entity_type", entityType);
        if (entityId) params.set("entity_id", entityId);
        const batch = await api<ChangeLogEntry[]>(`/change-logs?${params}`);
        setEntries((prev) => (offset === 0 ? batch : [...prev, ...batch]));
        setHasMore(batch.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        <span className="text-xs text-slate-400">append-only · 只增不改</span>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 ring-1 ring-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {entries.length === 0 && !loading && !error ? (
        <p className="mt-4 text-sm text-slate-400">暂无变更记录。</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="py-2 pr-4 font-medium">时间</th>
                <th className="py-2 pr-4 font-medium">操作人</th>
                <th className="py-2 pr-4 font-medium">类型</th>
                <th className="py-2 pr-4 font-medium">对象</th>
                <th className="py-2 font-medium">内容</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((log) => {
                const { type, target, detail } = describe(log);
                return (
                  <tr key={log.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{formatTime(log.changed_at)}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{log.changed_by}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span
                        className={
                          "inline-block rounded px-2 py-0.5 text-xs font-medium " +
                          (log.entity_type === "assignment"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-csg-50 text-csg-700 ring-1 ring-csg-200")
                        }
                      >
                        {type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">{target}</td>
                    <td className="py-2.5 text-slate-600">{detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {hasMore && (
          <button
            type="button"
            onClick={() => void load(entries.length)}
            disabled={loading}
            className="btn-ghost text-xs"
          >
            {loading ? "加载中…" : "加载更多"}
          </button>
        )}
        {entries.length > 0 && (
          <span className="text-xs text-slate-400">已加载 {entries.length} 条</span>
        )}
      </div>
    </div>
  );
}
