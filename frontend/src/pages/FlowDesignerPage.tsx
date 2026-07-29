import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import PageShell from "../components/PageShell";
import type {
  FlowDetail,
  FlowMutationResult,
  GuideItemDraft,
  Person,
  StepDefinitionDraft,
  Unit,
  User,
} from "../types";

function newKey(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStep(index: number): StepDefinitionDraft {
  return {
    clientKey: newKey(),
    code: String((index + 1) * 10).padStart(3, "0"),
    name: `新环节 ${index + 1}`,
    task: "",
    person_ids: [],
    guide: [],
  };
}

function fromFlow(flow: FlowDetail): StepDefinitionDraft[] {
  return flow.steps.map((step) => ({
    clientKey: `existing-${step.id}`,
    code: step.code,
    name: step.name,
    task: step.task,
    person_ids: step.persons.map((p) => p.id),
    guide: step.guide.map((g) => ({
      system_name: g.system_name,
      action_text: g.action_text,
      url: g.url ?? "",
      image_path: g.image_path,
      note: g.note ?? "",
    })),
  }));
}

function validateSteps(steps: StepDefinitionDraft[], { requireNonEmpty }: { requireNonEmpty: boolean }): string | null {
  if (requireNonEmpty && steps.length === 0) return "至少需要一个环节才能发布";
  for (const step of steps) {
    if (!step.code.trim() || !step.name.trim()) return "每个环节都需要编号和名称";
    for (const g of step.guide) {
      if (!g.system_name.trim() || !g.action_text.trim()) return "指引需填写系统名与动作";
      const url = g.url.trim();
      if (url && !/^https?:\/\//i.test(url)) return "指引链接仅支持 http/https";
    }
  }
  return null;
}

function SortableStepRow({
  step,
  selected,
  onSelect,
  onRemove,
}: {
  step: StepDefinitionDraft;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.clientKey,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "flex items-stretch gap-1 rounded-md border bg-white " +
        (selected ? "border-csg-500 ring-2 ring-csg-100" : "border-slate-200") +
        (isDragging ? " opacity-80 shadow-soft" : "")
      }
    >
      <button
        type="button"
        className="cursor-grab px-2 text-slate-400 hover:text-csg-600 active:cursor-grabbing"
        aria-label="拖拽排序"
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 py-2.5 pr-2 text-left">
        <div className="mono text-xs text-csg-500">{step.code}</div>
        <div className="truncate text-sm font-medium text-slate-800">{step.name || "未命名环节"}</div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="px-2 text-xs text-slate-400 hover:text-red-600"
        title="删除环节"
      >
        ×
      </button>
    </div>
  );
}

/** 环节内嵌的人员选择 + 台账内联维护（人员/单位即建即用） */
function PersonPicker({
  persons,
  units,
  selectedIds,
  onToggle,
  onLedgerChanged,
}: {
  persons: Person[];
  units: Unit[];
  selectedIds: number[];
  onToggle: (personId: number) => void;
  onLedgerChanged: (createdPerson: Person | null) => void;
}) {
  const [addingPerson, setAddingPerson] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const [pName, setPName] = useState("");
  const [pUnitId, setPUnitId] = useState<number | "">("");
  const [pTitle, setPTitle] = useState("");
  const [uName, setUName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 按单位分组（按 order_index 排，未设单位沉底）；
  // 停用人员不出现在候选里，但已被本环节选中的保留显示（防止引用凭空消失）
  const grouped = useMemo(() => {
    const groups: { unit: Unit | null; persons: Person[] }[] = units.map((u) => ({
      unit: u,
      persons: [],
    }));
    const noUnit: Person[] = [];
    for (const p of persons) {
      if (!p.active && !selectedIds.includes(p.id)) continue;
      if (p.unit) {
        groups.find((g) => g.unit?.id === p.unit?.id)?.persons.push(p);
      } else {
        noUnit.push(p);
      }
    }
    const result = groups.filter((g) => g.persons.length > 0);
    if (noUnit.length > 0) result.push({ unit: null, persons: noUnit });
    return result;
  }, [persons, units, selectedIds]);

  async function addPerson() {
    if (!pName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<Person>("/persons", {
        method: "POST",
        body: {
          name: pName.trim(),
          unit_id: pUnitId === "" ? null : pUnitId,
          title: pTitle.trim(),
        },
      });
      setPName("");
      setPTitle("");
      setAddingPerson(false);
      onLedgerChanged(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增人员失败");
    } finally {
      setBusy(false);
    }
  }

  async function addUnit() {
    if (!uName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<Unit>("/units", {
        method: "POST",
        body: { name: uName.trim() },
      });
      setUName("");
      setAddingUnit(false);
      setPUnitId(created.id); // 新单位直接选中到人员表单里
      onLedgerChanged(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新增单位失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">责任人（可多选 = 并行）</div>
        <div className="flex gap-2 text-xs">
          <button type="button" className="text-csg-600 hover:text-csg-800" onClick={() => { setAddingPerson((v) => !v); setAddingUnit(false); }}>
            ＋ 新增人员
          </button>
          <button type="button" className="text-csg-600 hover:text-csg-800" onClick={() => { setAddingUnit((v) => !v); setAddingPerson(false); }}>
            ＋ 新增单位
          </button>
        </div>
      </div>

      <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-slate-100 bg-csg-50/40 p-2">
        {grouped.length === 0 && (
          <p className="px-1 py-2 text-xs text-slate-400">
            台账为空 —— 点右上角「＋ 新增人员/单位」开始维护。
          </p>
        )}
        {grouped.map((group) => (
          <div key={group.unit?.id ?? "none"}>
            <div className="px-1 text-[11px] font-medium text-slate-400">
              {group.unit?.name ?? "未设单位"}
            </div>
            <div className="grid sm:grid-cols-2">
              {group.persons.map((person) => {
                const checked = selectedIds.includes(person.id);
                return (
                  <label
                    key={person.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white"
                  >
                    <input type="checkbox" checked={checked} onChange={() => onToggle(person.id)} />
                    <span className="text-slate-700">{person.name}</span>
                    {person.title && <span className="text-[10px] text-slate-400">{person.title}</span>}
                    {!person.active && <span className="text-[10px] text-red-400">（已停用）</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {addingPerson && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-csg-200 bg-csg-50/60 p-2">
          <input
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            placeholder="姓名"
            className="focus-csg w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          <select
            value={pUnitId}
            onChange={(e) => setPUnitId(e.target.value === "" ? "" : Number(e.target.value))}
            className="focus-csg rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">未设单位</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            value={pTitle}
            onChange={(e) => setPTitle(e.target.value)}
            placeholder="职务（可选）"
            className="focus-csg w-32 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !pName.trim()} onClick={() => void addPerson()}>
            添加并选中
          </button>
        </div>
      )}
      {addingUnit && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-csg-200 bg-csg-50/60 p-2">
          <input
            value={uName}
            onChange={(e) => setUName(e.target.value)}
            placeholder="单位名称"
            className="focus-csg w-44 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !uName.trim()} onClick={() => void addUnit()}>
            添加单位
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function FlowDesignerPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [domainId, setDomainId] = useState<number | null>(null);
  const [steps, setSteps] = useState<StepDefinitionDraft[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [persons, setPersons] = useState<Person[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirtyMeta, setDirtyMeta] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = steps.find((s) => s.clientKey === selectedKey) ?? null;

  const load = useCallback(async () => {
    if (!id) return;
    const [flow, personList, unitList] = await Promise.all([
      api<FlowDetail>(`/flows/${id}`),
      api<Person[]>("/persons"),
      api<Unit[]>("/units"),
    ]);
    setName(flow.name);
    setDescription(flow.description);
    setStatus(flow.status);
    setDomainId(flow.domain_id ?? null);
    const drafted = fromFlow(flow);
    setSteps(drafted);
    setSelectedKey(drafted[0]?.clientKey ?? null);
    setPersons(personList);
    setUnits(unitList);
    setDirtyMeta(false);
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    load().catch((err) => setLoadError(err instanceof Error ? err.message : "加载失败"));
  }, [load, isAdmin]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!isAdmin) {
    return <Navigate to={id ? `/flows/${id}` : "/"} replace />;
  }

  function updateSelected(patch: Partial<StepDefinitionDraft>) {
    if (!selectedKey) return;
    setSteps((prev) => prev.map((s) => (s.clientKey === selectedKey ? { ...s, ...patch } : s)));
  }

  function updateGuide(index: number, patch: Partial<GuideItemDraft>) {
    if (!selected) return;
    const guide = selected.guide.map((g, i) => (i === index ? { ...g, ...patch } : g));
    updateSelected({ guide });
  }

  function togglePerson(personId: number) {
    if (!selected) return;
    const person_ids = selected.person_ids.includes(personId)
      ? selected.person_ids.filter((pid) => pid !== personId)
      : [...selected.person_ids, personId];
    updateSelected({ person_ids });
  }

  /** 台账变动后刷新列表；新增人员时自动选中进当前环节 */
  async function onLedgerChanged(createdPerson: Person | null) {
    const [personList, unitList] = await Promise.all([
      api<Person[]>("/persons"),
      api<Unit[]>("/units"),
    ]);
    setPersons(personList);
    setUnits(unitList);
    if (createdPerson && selected && !selected.person_ids.includes(createdPerson.id)) {
      updateSelected({ person_ids: [...selected.person_ids, createdPerson.id] });
    }
    if (createdPerson) setToast(`已添加 ${createdPerson.name} 并选入本环节`);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.clientKey === active.id);
      const newIndex = prev.findIndex((s) => s.clientKey === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function addStep() {
    const step = emptyStep(steps.length);
    setSteps((prev) => [...prev, step]);
    setSelectedKey(step.clientKey);
  }

  function removeStep(key: string) {
    setSteps((prev) => {
      const next = prev.filter((s) => s.clientKey !== key);
      if (selectedKey === key) setSelectedKey(next[0]?.clientKey ?? null);
      return next;
    });
  }

  async function saveAll() {
    if (!id) return;
    const validationError = validateSteps(steps, { requireNonEmpty: false });
    if (validationError) {
      setToast(validationError);
      return;
    }
    setSaving(true);
    let metaSaved = false;
    try {
      if (dirtyMeta) {
        await api<FlowMutationResult>(`/flows/${id}`, {
          method: "PATCH",
          body: { name: name.trim(), description },
        });
        setDirtyMeta(false);
        metaSaved = true;
      }
      const result = await api<FlowMutationResult>(`/flows/${id}/definition`, {
        method: "PUT",
        body: {
          steps: steps.map((s) => ({
            code: s.code.trim(),
            name: s.name.trim(),
            task: s.task,
            person_ids: s.person_ids,
            guide: s.guide.map((g) => ({
              system_name: g.system_name.trim(),
              action_text: g.action_text.trim(),
              url: g.url.trim() || null,
              image_path: g.image_path,
              note: g.note.trim() || null,
            })),
          })),
        },
      });
      setName(result.flow.name);
      setDescription(result.flow.description);
      setStatus(result.flow.status);
      const drafted = fromFlow(result.flow);
      setSteps(drafted);
      // 保存后 key 变为 existing-*，按原位置恢复选中
      const prevIndex = selected ? steps.findIndex((s) => s.clientKey === selected.clientKey) : -1;
      const restored = prevIndex >= 0 ? drafted[prevIndex]?.clientKey : undefined;
      setSelectedKey(restored ?? drafted[0]?.clientKey ?? null);
      setToast(result.changed === false ? "定义未发生变化" : "流程定义已保存");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存失败";
      setToast(metaSaved ? `名称/说明已保存，但定义保存失败：${msg}` : msg);
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!id) return;
    const next = status === "published" ? "draft" : "published";
    if (next === "published") {
      const validationError = validateSteps(steps, { requireNonEmpty: true });
      if (validationError) {
        setToast(validationError);
        return;
      }
    }
    setSaving(true);
    try {
      // 发布前先落库元数据与定义，避免把未保存草稿当成已发布内容
      if (next === "published" || dirtyMeta) {
        if (dirtyMeta) {
          await api<FlowMutationResult>(`/flows/${id}`, {
            method: "PATCH",
            body: { name: name.trim(), description },
          });
          setDirtyMeta(false);
        }
        if (next === "published") {
          const saved = await api<FlowMutationResult>(`/flows/${id}/definition`, {
            method: "PUT",
            body: {
              steps: steps.map((s) => ({
                code: s.code.trim(),
                name: s.name.trim(),
                task: s.task,
                person_ids: s.person_ids,
                guide: s.guide.map((g) => ({
                  system_name: g.system_name.trim(),
                  action_text: g.action_text.trim(),
                  url: g.url.trim() || null,
                  image_path: g.image_path,
                  note: g.note.trim() || null,
                })),
              })),
            },
          });
          const drafted = fromFlow(saved.flow);
          setSteps(drafted);
          const prevIndex = selected ? steps.findIndex((s) => s.clientKey === selected.clientKey) : -1;
          const restored = prevIndex >= 0 ? drafted[prevIndex]?.clientKey : undefined;
          setSelectedKey(restored ?? drafted[0]?.clientKey ?? null);
        }
      }
      const result = await api<FlowMutationResult>(`/flows/${id}`, {
        method: "PATCH",
        body: { status: next },
      });
      setStatus(result.flow.status);
      setToast(next === "published" ? "已发布" : "已取消发布（回 draft）");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "状态更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!id || status !== "draft") return;
    if (!window.confirm("确认删除该 draft 流程？此操作不可恢复。")) return;
    setSaving(true);
    try {
      await api(`/flows/${id}`, { method: "DELETE" });
      navigate(domainId ? `/domains/${domainId}` : "/");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "删除失败");
      setSaving(false);
    }
  }

  return (
    <PageShell
      user={user}
      onLogout={onLogout}
      title="流程设计器"
      subtitle="拖拽排序环节，编辑任务、环节内嵌选人与系统操作指引后保存。"
      backTo={id ? `/flows/${id}` : "/"}
      backLabel="返回办事地图"
      wide
      actions={
        <>
          <button type="button" className="btn-ghost" disabled={saving} onClick={() => void saveAll()}>
            {saving ? "保存中…" : "保存定义"}
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void togglePublish()}>
            {status === "published" ? "取消发布" : "发布"}
          </button>
        </>
      }
    >
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>
      )}

      {!loadError && (
        <>
          <div className="panel mb-5 grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">流程名称</label>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirtyMeta(true);
                }}
                className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">状态</label>
              <div className="flex items-center gap-3 pt-2 text-sm">
                <span
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-medium " +
                    (status === "published"
                      ? "bg-csg-50 text-csg-700 ring-1 ring-csg-200"
                      : "bg-slate-100 text-slate-500")
                  }
                >
                  {status === "published" ? "已发布" : "draft"}
                </span>
                {domainId && (
                  <Link to={`/domains/${domainId}`} className="text-xs text-csg-600 hover:text-csg-800">
                    返回域流程列表
                  </Link>
                )}
                {status === "draft" && (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:text-red-800"
                    disabled={saving}
                    onClick={() => void deleteDraft()}
                  >
                    删除 draft
                  </button>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">说明</label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirtyMeta(true);
                }}
                rows={2}
                className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
            <aside className="panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">环节列表</h2>
                <button type="button" className="btn-ghost text-xs" onClick={addStep}>
                  + 新增
                </button>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={steps.map((s) => s.clientKey)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <SortableStepRow
                        key={step.clientKey}
                        step={step}
                        selected={step.clientKey === selectedKey}
                        onSelect={() => setSelectedKey(step.clientKey)}
                        onRemove={() => removeStep(step.clientKey)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {steps.length === 0 && (
                <p className="mt-4 text-xs text-slate-400">暂无环节，点击「新增」开始编排。</p>
              )}
            </aside>

            <section className="panel p-5">
              {!selected ? (
                <p className="text-sm text-slate-400">请选择左侧环节进行编辑。</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">编号</label>
                      <input
                        value={selected.code}
                        onChange={(e) => updateSelected({ code: e.target.value })}
                        className="focus-csg mono block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-500">名称</label>
                      <input
                        value={selected.name}
                        onChange={(e) => updateSelected({ name: e.target.value })}
                        className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-500">做什么 / 交什么</label>
                    <textarea
                      value={selected.task}
                      onChange={(e) => updateSelected({ task: e.target.value })}
                      rows={3}
                      className="focus-csg block w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>

                  {/* 人员内嵌在环节中：从台账多选；台账可就地维护 */}
                  <PersonPicker
                    persons={persons}
                    units={units}
                    selectedIds={selected.person_ids}
                    onToggle={togglePerson}
                    onLedgerChanged={(p) => void onLedgerChanged(p)}
                  />

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-medium text-slate-500">系统操作指引</div>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() =>
                          updateSelected({
                            guide: [
                              ...selected.guide,
                              { system_name: "", action_text: "", url: "", image_path: null, note: "" },
                            ],
                          })
                        }
                      >
                        + 添指引
                      </button>
                    </div>
                    <div className="space-y-3">
                      {selected.guide.map((g, index) => (
                        <div key={index} className="rounded-md border border-slate-200 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="mono text-xs text-slate-400">#{index + 1}</span>
                            <button
                              type="button"
                              className="text-xs text-slate-400 hover:text-red-600"
                              onClick={() =>
                                updateSelected({
                                  guide: selected.guide.filter((_, i) => i !== index),
                                })
                              }
                            >
                              删除
                            </button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              placeholder="系统名"
                              value={g.system_name}
                              onChange={(e) => updateGuide(index, { system_name: e.target.value })}
                              className="focus-csg rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                            <input
                              placeholder="系统链接（可选）"
                              value={g.url}
                              onChange={(e) => updateGuide(index, { url: e.target.value })}
                              className="focus-csg rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
                            />
                          </div>
                          <textarea
                            placeholder="动作说明"
                            value={g.action_text}
                            onChange={(e) => updateGuide(index, { action_text: e.target.value })}
                            rows={2}
                            className="focus-csg mt-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
                          />
                          <input
                            placeholder="依据/注意（可选）"
                            value={g.note}
                            onChange={(e) => updateGuide(index, { note: e.target.value })}
                            className="focus-csg mt-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
                          />
                        </div>
                      ))}
                      {selected.guide.length === 0 && (
                        <p className="text-xs text-slate-400">本环节暂无指引。</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-csg-800 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </PageShell>
  );
}
