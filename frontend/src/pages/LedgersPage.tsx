import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import PageShell from "../components/PageShell";
import Toast from "../components/Toast";
import { useDialog } from "../components/DialogProvider";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import type { BusinessDomain, Person, Unit, User } from "../types";

type Tab = "persons" | "units";

/** 台账管理：人员信息台账 + 所属团队台账（admin 专属） */
export default function LedgersPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("persons");
  const [persons, setPersons] = useState<Person[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [domains, setDomains] = useState<BusinessDomain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [personList, unitList, domainList] = await Promise.all([
        api<Person[]>("/persons"),
        api<Unit[]>("/units"),
        api<BusinessDomain[]>("/domains"),
      ]);
      setPersons(personList);
      setUnits(unitList);
      setDomains(domainList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载台账失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function run(action: () => Promise<unknown>, okMessage: string) {
    try {
      await action();
      setToast(okMessage);
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "操作失败");
    }
  }

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title="台账管理"
      subtitle="人员信息台账与所属团队台账；环节选人、办事地图展示实时引用此处数据。"
      backTo="/"
      backLabel="平台组业务导航"
      wide
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex gap-1 border-b border-slate-200 text-sm">
        {(["persons", "units"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={
              "border-b-2 px-4 py-2 font-medium transition " +
              (tab === item
                ? "border-csg-600 text-csg-700"
                : "border-transparent text-slate-500 hover:text-slate-700")
            }
          >
            {item === "persons" ? `人员台账（${persons.length}）` : `团队台账（${units.length}）`}
          </button>
        ))}
      </div>

      {tab === "persons" && (
        <PersonsTab persons={persons} units={units} domains={domains} onAction={run} />
      )}
      {tab === "units" && <UnitsTab persons={persons} units={units} onAction={run} />}

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}

type Action = (action: () => Promise<unknown>, okMessage: string) => Promise<void>;

/* ---------------- 人员台账 ---------------- */

/** 可服务业务域多选下拉（checkbox 面板） */
function DomainMultiSelect({
  domains,
  value,
  onChange,
}: {
  domains: BusinessDomain[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedNames = domains.filter((d) => value.includes(d.id)).map((d) => d.name);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-csg min-w-44 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm"
      >
        {selectedNames.length > 0 ? (
          selectedNames.join("、")
        ) : (
          <span className="text-slate-400">可服务业务域（可多选）</span>
        )}
        <span className="ml-1 text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-44 w-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-soft">
          {domains.length === 0 && <p className="px-1 text-xs text-slate-400">暂无业务域</p>}
          {domains.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-csg-50">
              <input
                type="checkbox"
                checked={value.includes(d.id)}
                onChange={() =>
                  onChange(value.includes(d.id) ? value.filter((id) => id !== d.id) : [...value, d.id])
                }
              />
              {d.name}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

function PersonsTab({
  persons,
  units,
  domains,
  onAction,
}: {
  persons: Person[];
  units: Unit[];
  domains: BusinessDomain[];
  onAction: Action;
}) {
  const dialog = useDialog();
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    unit_id: "" as number | "",
    title: "",
    contact: "",
    active: true,
    domain_ids: [] as number[],
  });
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return persons.filter((p) => {
      if (unitFilter === "none" && p.unit) return false;
      if (unitFilter !== "all" && unitFilter !== "none" && p.unit?.id !== Number(unitFilter)) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [persons, query, unitFilter]);

  function resetForm() {
    setForm({ name: "", unit_id: "", title: "", contact: "", active: true, domain_ids: [] });
    setAdding(false);
    setEditingId(null);
  }

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索姓名 / 职务"
          className="focus-csg w-52 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <select
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          className="focus-csg rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        >
          <option value="all">全部团队</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
          <option value="none">未设团队</option>
        </select>
        <span className="text-xs text-slate-400">
          显示 {filtered.length} / {persons.length} 人
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => setBulkOpen(true)}
          >
            ⭱ 批量导入
          </button>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            onClick={() => {
              resetForm();
              setAdding(true);
            }}
          >
            ＋ 新增人员
          </button>
        </div>
      </div>

      {bulkOpen && (
        <BulkImportModal
          persons={persons}
          units={units}
          onClose={() => setBulkOpen(false)}
          onDone={(message) => {
            setBulkOpen(false);
            void onAction(async () => undefined, message);
          }}
        />
      )}

      {(adding || editingId !== null) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-csg-200 bg-csg-50/60 p-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="姓名"
            className="focus-csg w-32 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          <select
            value={form.unit_id}
            onChange={(e) =>
              setForm({ ...form, unit_id: e.target.value === "" ? "" : Number(e.target.value) })
            }
            className="focus-csg rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
          >
            <option value="">未设团队</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="职务（可选）"
            className="focus-csg w-36 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          <input
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            placeholder="联系方式（手机号）"
            className="focus-csg w-40 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
          />
          <DomainMultiSelect
            domains={domains}
            value={form.domain_ids}
            onChange={(ids) => setForm({ ...form, domain_ids: ids })}
          />
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={!form.name.trim()}
            onClick={() =>
              void onAction(async () => {
                const body = {
                  name: form.name.trim(),
                  unit_id: form.unit_id === "" ? null : form.unit_id,
                  title: form.title.trim(),
                  contact: form.contact.trim() || null,
                  active: form.active,
                  domain_ids: form.domain_ids,
                };
                if (editingId !== null) {
                  await api(`/persons/${editingId}`, { method: "PUT", body });
                } else {
                  await api("/persons", { method: "POST", body });
                }
                resetForm();
              }, editingId !== null ? "人员已更新" : `已添加 ${form.name.trim()}`)
            }
          >
            {editingId !== null ? "保存" : "添加"}
          </button>
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={resetForm}>
            取消
          </button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="py-2 pr-4 font-medium">姓名</th>
              <th className="py-2 pr-4 font-medium">所属团队</th>
              <th className="py-2 pr-4 font-medium">职务</th>
              <th className="py-2 pr-4 font-medium">联系方式</th>
              <th className="py-2 pr-4 font-medium">可服务业务域</th>
              <th className="py-2 pr-4 font-medium">状态</th>
              <th className="py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-800">{p.name}</td>
                <td className="py-2.5 pr-4 text-slate-600">{p.unit?.name ?? <span className="text-slate-400">未设团队</span>}</td>
                <td className="py-2.5 pr-4 text-slate-600">{p.title || <span className="text-slate-400">—</span>}</td>
                <td className="mono py-2.5 pr-4 text-slate-600">
                  {p.contact ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2.5 pr-4 text-slate-600">
                  {p.domains.length > 0 ? (
                    <span className="text-xs">{p.domains.map((d) => d.name).join("、")}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                      (p.active ? "bg-csg-50 text-csg-700 ring-1 ring-csg-200" : "bg-slate-200 text-slate-500")
                    }
                  >
                    {p.active ? "在职" : "已停用"}
                  </span>
                </td>
                <td className="py-2.5 space-x-3 whitespace-nowrap text-xs">
                  <button
                    type="button"
                    className="text-csg-600 hover:text-csg-800"
                    onClick={() => {
                      setAdding(false);
                      setEditingId(p.id);
                      setForm({
                        name: p.name,
                        unit_id: p.unit?.id ?? "",
                        title: p.title,
                        contact: p.contact ?? "",
                        active: p.active,
                        domain_ids: p.domains.map((d) => d.id),
                      });
                    }}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-700"
                    onClick={() =>
                      void onAction(
                        () =>
                          api(`/persons/${p.id}`, {
                            method: "PUT",
                            body: {
                              name: p.name,
                              unit_id: p.unit?.id ?? null,
                              title: p.title,
                              contact: p.contact,
                              active: !p.active,
                              domain_ids: p.domains.map((d) => d.id),
                            },
                          }),
                        p.active ? `已停用 ${p.name}（选人时不再出现）` : `已启用 ${p.name}`
                      )
                    }
                  >
                    {p.active ? "停用" : "启用"}
                  </button>
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700"
                    onClick={async () => {
                      if (!await dialog.confirm(`确认删除「${p.name}」？被操作指引引用的人员，系统会阻止删除。`, { title: "删除人员", danger: true })) return;
                      void onAction(() => api(`/persons/${p.id}`, { method: "DELETE" }), `已删除 ${p.name}`);
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                  {persons.length === 0 ? "台账为空，点右上角「＋ 新增人员」开始维护。" : "没有匹配的人员。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 团队台账 ---------------- */

function UnitsTab({ persons, units, onAction }: { persons: Person[]; units: Unit[]; onAction: Action }) {
  const dialog = useDialog();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const memberCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of persons) {
      if (p.unit) counts.set(p.unit.id, (counts.get(p.unit.id) ?? 0) + 1);
    }
    return counts;
  }, [persons]);

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新团队名称"
          className="focus-csg w-56 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={!newName.trim()}
          onClick={() =>
            void onAction(async () => {
              await api("/units", { method: "POST", body: { name: newName.trim() } });
              setNewName("");
            }, `已添加团队「${newName.trim()}」`)
          }
        >
          ＋ 新增团队
        </button>
        <span className="ml-auto text-xs text-slate-400">人员挂团队，团队被引用时不可删除</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
              <th className="py-2 pr-4 font-medium">团队名称</th>
              <th className="py-2 pr-4 font-medium">人数</th>
              <th className="py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 pr-4 font-medium text-slate-800">
                  {editingId === u.id ? (
                    <span className="flex items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="focus-csg rounded-md border border-slate-200 px-2.5 py-1 text-sm"
                      />
                      <button
                        type="button"
                        className="text-xs text-csg-600 hover:text-csg-800"
                        disabled={!editName.trim()}
                        onClick={() =>
                          void onAction(async () => {
                            await api(`/units/${u.id}`, {
                              method: "PUT",
                              body: { name: editName.trim(), order_index: u.order_index },
                            });
                            setEditingId(null);
                          }, "团队已改名")
                        }
                      >
                        保存
                      </button>
                      <button type="button" className="text-xs text-slate-400" onClick={() => setEditingId(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    u.name
                  )}
                </td>
                <td className="py-2.5 pr-4 text-slate-600">
                  <div>{memberCount.get(u.id) ?? 0} 人</div>
                  <div className="mt-0.5 max-w-md truncate text-xs text-slate-400">
                    {persons
                      .filter((p) => p.unit?.id === u.id)
                      .map((p) => p.name)
                      .join("、") || "—"}
                  </div>
                </td>
                <td className="py-2.5 space-x-3 text-xs">
                  {editingId !== u.id && (
                    <button
                      type="button"
                      className="text-csg-600 hover:text-csg-800"
                      onClick={() => {
                        setEditingId(u.id);
                        setEditName(u.name);
                      }}
                    >
                      改名
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700"
                    onClick={async () => {
                      if (!await dialog.confirm(`确认删除团队「${u.name}」？仍有关联人员或指引时，系统会阻止删除。`, { title: "删除团队", danger: true })) return;
                      void onAction(() => api(`/units/${u.id}`, { method: "DELETE" }), `已删除团队「${u.name}」`);
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-sm text-slate-400">
                  暂无团队，先在上方新增。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- 批量导入 ---------------- */

interface ParsedRow {
  name: string;
  unit_name: string;
  title: string;
  status: "ok" | "new-unit" | "dup" | "invalid";
  note: string;
}

interface BulkResult {
  created_persons: number;
  created_units: string[];
  skipped: { name: string; reason: string }[];
}

function parseRows(
  text: string,
  existingPairs: Set<string>,
  existingUnitNames: Set<string>
): ParsedRow[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells = line.split(/[\t,，]/).map((c) => c.trim());
      const [name = "", unit_name = "", title = ""] = cells;
      if (!name) return { name: "(空行)", unit_name, title, status: "invalid" as const, note: "姓名为空" };
      const key = `${name}|${unit_name}`;
      if (seen.has(key)) return { name, unit_name, title, status: "invalid" as const, note: "本批内重复" };
      seen.add(key);
      if (existingPairs.has(key))
        return { name, unit_name, title, status: "dup" as const, note: "台账已存在" };
      if (unit_name && !existingUnitNames.has(unit_name))
        return { name, unit_name, title, status: "new-unit" as const, note: `将新建团队「${unit_name}」` };
      return { name, unit_name, title, status: "ok" as const, note: "可导入" };
    });
}

function BulkImportModal({
  persons,
  units,
  onClose,
  onDone,
}: {
  persons: Person[];
  units: Unit[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingPairs = useMemo(
    () => new Set(persons.map((p) => `${p.name}|${p.unit?.name ?? ""}`)),
    [persons]
  );
  const existingUnitNames = useMemo(() => new Set(units.map((u) => u.name)), [units]);
  const importable = rows?.filter((r) => r.status !== "dup" && r.status !== "invalid") ?? [];

  async function confirmImport() {
    if (importable.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<BulkResult>("/persons/bulk-import", {
        method: "POST",
        body: {
          rows: importable.map((r) => ({
            name: r.name,
            unit_name: r.unit_name || null,
            title: r.title,
          })),
        },
      });
      const parts = [`新增 ${result.created_persons} 人`];
      if (result.created_units.length > 0) parts.push(`新建团队 ${result.created_units.length} 个`);
      if (result.skipped.length > 0) parts.push(`跳过 ${result.skipped.length} 条`);
      onDone(`导入完成：${parts.join("，")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
      setBusy(false);
    }
  }

  const statusBadge: Record<ParsedRow["status"], { text: string; cls: string }> = {
    ok: { text: "可导入", cls: "bg-csg-50 text-csg-700 ring-1 ring-csg-200" },
    "new-unit": { text: "新建团队", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
    dup: { text: "重复跳过", cls: "bg-slate-100 text-slate-500" },
    invalid: { text: "无效", cls: "bg-red-50 text-red-600 ring-1 ring-red-200" },
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">批量导入人员</h3>
          <button type="button" className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          每行一人：<span className="mono">姓名[Tab或逗号]团队[Tab或逗号]职务</span>
          （职务可空，团队留空则不设团队）。可直接从 Excel 复制粘贴。团队不存在将自动创建。
        </p>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows(null);
          }}
          rows={7}
          placeholder={"张三\t平台运维组\t系统设备主人\n李四，调度中心\n王五"}
          className="focus-csg mt-3 block w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-sm"
        />

        {rows === null ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="btn-ghost"
              disabled={!text.trim()}
              onClick={() => setRows(parseRows(text, existingPairs, existingUnitNames))}
            >
              解析预览 ↓
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-slate-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                    <th className="py-2 pl-3 pr-4 font-medium">姓名</th>
                    <th className="py-2 pr-4 font-medium">团队</th>
                    <th className="py-2 pr-4 font-medium">职务</th>
                    <th className="py-2 pr-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pl-3 pr-4">{r.name}</td>
                      <td className="py-2 pr-4 text-slate-600">{r.unit_name || "—"}</td>
                      <td className="py-2 pr-4 text-slate-600">{r.title || "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + statusBadge[r.status].cls}>
                          {statusBadge[r.status].text}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-400">{r.note}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex items-center justify-between">
              <button type="button" className="btn-ghost text-xs" onClick={() => setRows(null)}>
                ← 重新编辑
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={importable.length === 0 || busy}
                onClick={() => void confirmImport()}
              >
                {busy ? "导入中…" : `确认导入 ${importable.length} 条`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
