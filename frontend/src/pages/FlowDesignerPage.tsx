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
import ImageUploader from "../components/ImageUploader";
import Toast from "../components/Toast";
import { useDialog } from "../components/DialogProvider";
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
    guide: [],
  };
}

function emptyGuide(): GuideItemDraft {
  return {
    system_name: "",
    action_text: "",
    url: "",
    image_path: null,
    note: "",
    unit_id: null,
    person_ids: [],
    escalation_person_id: null,
  };
}

/**
 * 将仅挂在 step.persons（旧 step_persons）上的责任人迁入指引草稿，
 * 避免设计器打开后保存时静默清空。
 * @returns migrated 是否发生了迁移（用于提示用户核对后保存）
 */
function fromFlow(flow: FlowDetail): { steps: StepDefinitionDraft[]; migrated: boolean } {
  let migrated = false;
  const steps = flow.steps.map((step) => {
    const guides: GuideItemDraft[] = step.guide.map((g) => ({
      system_name: g.system_name,
      action_text: g.action_text,
      url: g.url ?? "",
      image_path: g.image_path,
      note: g.note ?? "",
      unit_id: g.unit?.id ?? null,
      person_ids: g.persons.map((p) => p.id),
      escalation_person_id: g.escalation?.id ?? null,
    }));

    const assignedIds = new Set(guides.flatMap((g) => g.person_ids));
    const remainingPeople = step.persons.filter((person) => !assignedIds.has(person.id));
    if (remainingPeople.length === 0) {
      return {
        clientKey: `existing-${step.id}`,
        code: step.code,
        name: step.name,
        task: step.task,
        guide: guides,
      };
    }

    // 按责任团队分组（无单位沉底）
    const byUnit = new Map<number | null, number[]>();
    for (const person of remainingPeople) {
      const uid = person.unit?.id ?? null;
      const list = byUnit.get(uid) ?? [];
      list.push(person.id);
      byUnit.set(uid, list);
    }
    const groups = [...byUnit.entries()];
    migrated = true;

    if (guides.length === 0) {
      return {
        clientKey: `existing-${step.id}`,
        code: step.code,
        name: step.name,
        task: step.task,
        guide: groups.map(([unit_id, person_ids]) => ({
          ...emptyGuide(),
          system_name: "（待完善）",
          action_text: "请补充系统操作说明",
          unit_id,
          person_ids,
        })),
      };
    }

    // 优先填入同团队的空指引，其次无团队的空指引；不覆盖已有责任配置。
    for (const [unit_id, person_ids] of groups) {
      const matching = guides.findIndex(
        (guide) => guide.person_ids.length === 0 && guide.unit_id === unit_id
      );
      const blank = guides.findIndex(
        (guide) => guide.person_ids.length === 0 && guide.unit_id === null
      );
      const target = matching >= 0 ? matching : blank;
      if (target >= 0) {
        guides[target] = { ...guides[target], unit_id, person_ids };
      } else {
        guides.push({
          ...emptyGuide(),
          system_name: "（待完善）",
          action_text: "请补充系统操作说明",
          unit_id,
          person_ids,
        });
      }
    }

    return {
      clientKey: `existing-${step.id}`,
      code: step.code,
      name: step.name,
      task: step.task,
      guide: guides,
    };
  });

  return { steps, migrated };
}

function toDefinitionBody(steps: StepDefinitionDraft[]) {
  return {
    steps: steps.map((s) => ({
      code: s.code.trim(),
      name: s.name.trim(),
      task: s.task,
      guide: s.guide.map((g) => ({
        system_name: g.system_name.trim(),
        action_text: g.action_text.trim(),
        url: g.url.trim() || null,
        image_path: g.image_path,
        note: g.note.trim() || null,
        unit_id: g.unit_id,
        person_ids: g.person_ids,
        escalation_person_id: g.escalation_person_id,
      })),
    })),
  };
}

function validateSteps(steps: StepDefinitionDraft[], { requireNonEmpty }: { requireNonEmpty: boolean }): string | null {
  if (requireNonEmpty && steps.length === 0) return "至少需要一个环节才能发布";
  for (const step of steps) {
    if (!step.code.trim() || !step.name.trim()) return "每个环节都需要编号和名称";
    for (const g of step.guide) {
      if (!g.system_name.trim() || !g.action_text.trim()) return "指引需填写系统名与动作";
      const url = g.url.trim();
      if (url && !/^https?:\/\//i.test(url)) return "指引链接仅支持 http/https";
      if (g.person_ids.length > 0 && g.unit_id === null) return "请先选择责任团队再选择责任人";
    }
  }
  return null;
}

function SortableStepRow({
  step,
  selected,
  onSelect,
  onRemove,
  onCopy,
  onInsertBefore,
  onInsertAfter,
  onChange,
}: {
  step: StepDefinitionDraft;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCopy: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onChange: (patch: Partial<StepDefinitionDraft>) => void;
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
        "rounded-md border bg-white " +
        (selected ? "border-csg-500 ring-2 ring-csg-100" : "border-slate-200") +
        (isDragging ? " opacity-80 shadow-soft" : "")
      }
    >
      <div className="flex items-stretch gap-1">
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
          <div className="mono text-xs text-csg-500">{step.code || "编号"}</div>
          <div className="truncate text-sm font-medium text-slate-800">{step.name || "未命名环节"}</div>
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="px-1.5 text-xs text-slate-400 hover:text-csg-700"
          title="复制环节"
        >
          复制
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
      {selected && (
        <div className="space-y-1.5 border-t border-slate-100 px-2.5 pb-2.5 pt-2">
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button type="button" className="rounded-md border border-dashed border-csg-200 bg-csg-50/50 px-2 py-1 text-[11px] font-medium text-csg-700 hover:border-csg-400 hover:bg-csg-50" onClick={onInsertBefore}>＋ 前插环节</button>
            <button type="button" className="rounded-md border border-dashed border-csg-200 bg-csg-50/50 px-2 py-1 text-[11px] font-medium text-csg-700 hover:border-csg-400 hover:bg-csg-50" onClick={onInsertAfter}>＋ 后插环节</button>
          </div>
          <input
            value={step.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="编号"
            className="focus-csg mono w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <input
            value={step.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="环节名称"
            className="focus-csg w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <textarea
            value={step.task}
            onChange={(e) => onChange({ task: e.target.value })}
            placeholder="做什么 / 交什么"
            rows={2}
            className="focus-csg w-full rounded border border-slate-200 px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

/** 指引角色：责任团队 / 责任人 / 直接领导（数据来自台账） */
function GuideAssigneeEditor({
  persons,
  units,
  unitId,
  personIds,
  escalationPersonId,
  onChange,
  onLedgerRefresh,
}: {
  persons: Person[];
  units: Unit[];
  unitId: number | null;
  personIds: number[];
  escalationPersonId: number | null;
  onChange: (patch: {
    unit_id?: number | null;
    person_ids?: number[];
    escalation_person_id?: number | null;
  }) => void;
  onLedgerRefresh: () => void;
}) {
  const teamPeople = useMemo(
    () =>
      persons.filter(
        (p) =>
          unitId !== null &&
          p.unit?.id === unitId &&
          (p.active || personIds.includes(p.id))
      ),
    [persons, unitId, personIds]
  );
  const selectedPeople = useMemo(
    () => personIds.map((id) => persons.find((p) => p.id === id)).filter((p): p is Person => Boolean(p)),
    [persons, personIds]
  );
  const candidates = teamPeople.filter((p) => !personIds.includes(p.id));
  const leaderCandidates = useMemo(
    () =>
      persons.filter(
        (p) =>
          unitId !== null &&
          p.unit?.id === unitId &&
          (p.active || p.id === escalationPersonId)
      ),
    [persons, unitId, escalationPersonId]
  );
  const selectedLeader = useMemo(
    () => persons.find((p) => p.id === escalationPersonId) ?? null,
    [persons, escalationPersonId]
  );
  const leaderOutsideTeam = Boolean(
    selectedLeader && (unitId === null || selectedLeader.unit?.id !== unitId)
  );

  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-100 bg-slate-50/80 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">流程角色（台账）</span>
        <Link to="/ledgers" className="text-[11px] text-csg-600 hover:text-csg-800">
          去台账管理 →
        </Link>
      </div>
      <select
        className="focus-csg w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
        value={unitId ?? ""}
        onChange={(e) => {
          const next = e.target.value === "" ? null : Number(e.target.value);
          onChange({ unit_id: next, person_ids: [], escalation_person_id: null });
        }}
      >
        <option value="">先选择责任团队…</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">责任人</label>
        <select
          className="focus-csg w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-100"
          value=""
          disabled={unitId === null}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!id || personIds.includes(id)) return;
            onChange({ person_ids: [...personIds, id] });
          }}
        >
          <option value="">
            {unitId === null
              ? "请先选择责任团队"
              : candidates.length
                ? "选择责任人（可多选）…"
                : "该团队暂无在职人员"}
          </option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.title ? `（${p.title}）` : ""}
            </option>
          ))}
        </select>
        {selectedPeople.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selectedPeople.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-csg-50 px-2.5 py-1 text-xs font-medium text-csg-800 ring-1 ring-csg-200"
              >
                {person.name}
                <button
                  type="button"
                  className="text-csg-500 hover:text-red-600"
                  onClick={() => onChange({ person_ids: personIds.filter((id) => id !== person.id) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">尚未选择责任人。</p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">直接领导</label>
        <select
          className="focus-csg w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-100"
          value={escalationPersonId ?? ""}
          disabled={unitId === null}
          onChange={(e) =>
            onChange({ escalation_person_id: e.target.value === "" ? null : Number(e.target.value) })
          }
        >
          <option value="">
            {unitId === null
              ? "请先选择责任团队"
              : units.find((u) => u.id === unitId)?.leader
              ? `默认：团队负责人 ${units.find((u) => u.id === unitId)?.leader?.name}`
              : "默认：该团队负责人（未指定则不显示）"}
          </option>
          {leaderCandidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.title ? `（${p.title}）` : ""}
              </option>
            ))}
        </select>
        {leaderOutsideTeam ? (
          <p className="mt-1 text-[11px] font-medium text-red-600">当前直接领导不属于责任团队，请重新选择。</p>
        ) : (
          <p className="mt-1 text-[11px] text-slate-400">仅可选择当前责任团队成员；留空时默认取团队负责人。</p>
        )}
      </div>
      <button type="button" className="text-[11px] text-slate-500 hover:text-csg-700" onClick={onLedgerRefresh}>
        刷新台账数据
      </button>
    </div>
  );
}

export default function FlowDesignerPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = user.role === "admin";
  const dialog = useDialog();

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
  const [guideEditMode, setGuideEditMode] = useState<"paged" | "continuous">("paged");
  const [guidePage, setGuidePage] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = steps.find((s) => s.clientKey === selectedKey) ?? null;
  const locked = status === "published";
  const safeGuidePage = selected?.guide.length ? Math.min(guidePage, selected.guide.length - 1) : 0;
  const guideEntries = (selected?.guide ?? []).map((guide, index) => ({ guide, index }));
  const visibleGuideEntries = guideEditMode === "paged" ? guideEntries.slice(safeGuidePage, safeGuidePage + 1) : guideEntries;

  useEffect(() => {
    setGuidePage(0);
  }, [selectedKey]);

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
    const { steps: drafted, migrated } = fromFlow(flow);
    setSteps(drafted);
    setSelectedKey(drafted[0]?.clientKey ?? null);
    setPersons(personList);
    setUnits(unitList);
    setDirtyMeta(false);
    if (migrated) {
      setToast("已将环节旧责任人迁入系统操作指引，请核对后保存");
    }
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

  async function refreshLedgers() {
    const [personList, unitList] = await Promise.all([
      api<Person[]>("/persons"),
      api<Unit[]>("/units"),
    ]);
    setPersons(personList);
    setUnits(unitList);
    setToast("台账已刷新");
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

  function insertStep(relativeKey: string, position: "before" | "after") {
    const relativeIndex = steps.findIndex((step) => step.clientKey === relativeKey);
    if (relativeIndex < 0) return;
    const insertIndex = relativeIndex + (position === "after" ? 1 : 0);
    const previousCode = Number.parseInt(steps[insertIndex - 1]?.code ?? "", 10);
    const nextCode = Number.parseInt(steps[insertIndex]?.code ?? "", 10);
    let suggested = (insertIndex + 1) * 10;
    if (Number.isFinite(previousCode) && Number.isFinite(nextCode) && nextCode - previousCode > 1) {
      suggested = Math.floor((previousCode + nextCode) / 2);
    } else if (Number.isFinite(previousCode)) {
      suggested = previousCode + 10;
    } else if (Number.isFinite(nextCode)) {
      suggested = Math.max(1, nextCode - 10);
    }
    const inserted = { ...emptyStep(insertIndex), code: String(suggested).padStart(3, "0"), name: "插入环节" };
    setSteps((previous) => {
      const next = [...previous];
      next.splice(insertIndex, 0, inserted);
      return next;
    });
    setSelectedKey(inserted.clientKey);
  }

  function insertGuide(index: number, position: "before" | "after") {
    if (!selected) return;
    const insertIndex = index + (position === "after" ? 1 : 0);
    const next = [...selected.guide];
    next.splice(insertIndex, 0, emptyGuide());
    updateSelected({ guide: next });
    setGuidePage(insertIndex);
  }

  function copyStep(key: string) {
    const source = steps.find((s) => s.clientKey === key);
    if (!source) return;
    const copy: StepDefinitionDraft = {
      ...source,
      clientKey: newKey(),
      code: `${source.code || "010"}-副本`.slice(0, 20),
      name: source.name.endsWith("（副本）") ? source.name : `${source.name}（副本）`,
      guide: source.guide.map((g) => ({ ...g, person_ids: [...g.person_ids] })),
    };
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.clientKey === key);
      if (index < 0) return prev;
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setSelectedKey(copy.clientKey);
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
    if (locked && !dirtyMeta) {
      setToast("已发布流程的环节定义已冻结，请先取消发布再修改");
      return;
    }
    const validationError = locked ? null : validateSteps(steps, { requireNonEmpty: false });
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
      if (locked) {
        setToast("名称/说明已保存");
        return;
      }
      const result = await api<FlowMutationResult>(`/flows/${id}/definition`, {
        method: "PUT",
        body: toDefinitionBody(steps),
      });
      setName(result.flow.name);
      setDescription(result.flow.description);
      setStatus(result.flow.status);
      const { steps: drafted } = fromFlow(result.flow);
      setSteps(drafted);
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
    } else if (
      !(await dialog.confirm(
        "取消发布后，未在办理中的普通用户将看不到该流程。正在办理的人仍可继续当前存档。",
        { title: "取消发布" }
      ))
    ) {
      return;
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
            body: toDefinitionBody(steps),
          });
          const { steps: drafted } = fromFlow(saved.flow);
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
    if (!await dialog.confirm("确认删除该 draft 流程？流程定义和关联配置将一并删除，且无法恢复。", { title: "删除草稿流程", danger: true })) return;
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
          <button type="button" className="btn-ghost" disabled={saving || (locked && !dirtyMeta)} onClick={() => void saveAll()}>
            {saving ? "保存中…" : locked ? "保存名称/说明" : "保存定义"}
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
          {locked && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              已发布流程的环节定义已冻结。名称和说明仍可修改；要改环节请先取消发布。
            </div>
          )}
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

          <div className={"relative grid gap-5 lg:grid-cols-[280px_1fr] " + (locked ? "pointer-events-none opacity-70" : "")}>
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
                        onCopy={() => copyStep(step.clientKey)}
                        onInsertBefore={() => insertStep(step.clientKey, "before")}
                        onInsertAfter={() => insertStep(step.clientKey, "after")}
                        onChange={(patch) =>
                          setSteps((prev) =>
                            prev.map((s) => (s.clientKey === step.clientKey ? { ...s, ...patch } : s))
                          )
                        }
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
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    当前环节：
                    <span className="mono ml-1 font-semibold text-csg-700">{selected.code || "—"}</span>
                    <span className="ml-2 font-semibold text-slate-800">{selected.name || "未命名"}</span>
                    <span className="ml-2 text-xs text-slate-400">（编号/名称/说明请在左侧编辑）</span>
                  </div>

                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-slate-600">系统操作指引</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">分页适合逐条专注录入，连续模式适合向下批量追加。</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                          <button type="button" onClick={() => setGuideEditMode("paged")} className={(guideEditMode === "paged" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500") + " rounded-md px-2.5 py-1.5 font-medium transition"}>分页录入</button>
                          <button type="button" onClick={() => setGuideEditMode("continuous")} className={(guideEditMode === "continuous" ? "bg-white text-csg-700 shadow-sm" : "text-slate-500") + " rounded-md px-2.5 py-1.5 font-medium transition"}>连续追加</button>
                        </div>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => {
                          updateSelected({ guide: [...selected.guide, emptyGuide()] });
                          setGuidePage(selected.guide.length);
                        }}
                      >
                        + 添指引
                      </button>
                      </div>
                    </div>
                    {guideEditMode === "paged" && selected.guide.length > 0 && (
                      <div className="mb-3 flex items-center justify-between rounded-lg border border-csg-100 bg-csg-50/60 px-3 py-2">
                        <button type="button" className="text-xs font-medium text-csg-700 disabled:text-slate-300" disabled={safeGuidePage === 0} onClick={() => setGuidePage((page) => Math.max(0, page - 1))}>← 上一条</button>
                        <div className="flex items-center gap-2"><span className="text-xs font-semibold text-csg-800">第 {safeGuidePage + 1} / {selected.guide.length} 条</span><div className="hidden gap-1 sm:flex">{selected.guide.map((_, index) => <button key={index} type="button" aria-label={`第 ${index + 1} 条指引`} onClick={() => setGuidePage(index)} className={(index === safeGuidePage ? "w-5 bg-csg-600" : "w-2 bg-csg-200 hover:bg-csg-300") + " h-2 rounded-full transition-all"} />)}</div></div>
                        <button type="button" className="text-xs font-medium text-csg-700 disabled:text-slate-300" disabled={safeGuidePage >= selected.guide.length - 1} onClick={() => setGuidePage((page) => Math.min(selected.guide.length - 1, page + 1))}>下一条 →</button>
                      </div>
                    )}
                    <div className="space-y-3">
                      {visibleGuideEntries.map(({ guide: g, index }) => (
                        <div key={index} className={(guideEditMode === "paged" ? "border-csg-200 shadow-sm" : "border-slate-200") + " rounded-xl border bg-white p-3"}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="mono text-xs text-slate-400">#{index + 1}</span>
                            <div className="flex items-center gap-1.5">
                              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-csg-600 hover:bg-csg-50" onClick={() => insertGuide(index, "before")}>＋ 前插</button>
                              <button type="button" className="rounded px-1.5 py-0.5 text-[11px] text-csg-600 hover:bg-csg-50" onClick={() => insertGuide(index, "after")}>＋ 后插</button>
                              <span className="h-3 w-px bg-slate-200" />
                              <button type="button" className="text-xs text-slate-400 hover:text-red-600" onClick={() => { updateSelected({ guide: selected.guide.filter((_, i) => i !== index) }); setGuidePage((page) => Math.max(0, Math.min(page, selected.guide.length - 2))); }}>删除</button>
                            </div>
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
                          <GuideAssigneeEditor
                            persons={persons}
                            units={units}
                            unitId={g.unit_id}
                            personIds={g.person_ids}
                            escalationPersonId={g.escalation_person_id}
                            onChange={(patch) => updateGuide(index, patch)}
                            onLedgerRefresh={() => void refreshLedgers()}
                          />
                          <div className="mt-2">
                            <ImageUploader
                              label="本条指引图示"
                              value={g.image_path}
                              onChange={(path) => updateGuide(index, { image_path: path })}
                            />
                          </div>
                        </div>
                      ))}
                      {selected.guide.length === 0 && (
                        <p className="text-xs text-slate-400">本环节暂无指引。责任人、直接领导与图示均在指引条目中配置。</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {toast && <Toast message={toast} />}
    </PageShell>
  );
}
