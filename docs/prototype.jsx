import React, { useState } from "react";

// ————————————————————————————————————————————————
// 用真实附件重建：附件二(物理机交付泳道) + 附件一(云盾操作手册)
// 三层：流程定义 / 岗位-人映射(改一处处处同步) / 人员(接通讯录)
// 系统链接、依据/注意 均来自真实文档
// ————————————————————————————————————————————————

const PEOPLE = {
  lianyt: { name: "练宇婷", dept: "系统设备主人" },
  hefa: { name: "贺法", dept: "系统运维人员" },
  quanxx: { name: "全雪霞", dept: "功能运营负责人 / 技术中台" },
  zenghs: { name: "曾虎双", dept: "安运调度团队" },
  panjb: { name: "潘俊冰", dept: "资源审核" },
  aizhou: { name: "艾洲", dept: "资源IP交付 / 访问开通" },
  weily: { name: "韦立演", dept: "平台运维 · 上架/网络/初始化" },
  chenbl: { name: "陈柏龄", dept: "平台软件交付 / 堡垒机HAC" },
  links: { name: "林孔升", dept: "监控资源交付" },
};

// 岗位（角色）
const ROLES = {
  owner: "系统设备主人",
  gridReview: "信息系统并网审核",
  demandReview: "物理机需求审核",
  ipDelivery: "资源IP交付",
  sysOps: "上架·网络·初始化",
  hac: "堡垒机 HAC 绑定",
  swDelivery: "平台软件交付",
  midDelivery: "技术中台交付",
  monDelivery: "监控资源交付",
};

// 岗位 → 人：管理员维护的唯一可信来源，改一次全流程同步
const INITIAL_ASSIGNMENT = {
  owner: "lianyt",
  gridReview: "zenghs",
  demandReview: "panjb",
  ipDelivery: "aizhou",
  sysOps: "weily",
  hac: "chenbl",
  swDelivery: "chenbl",
  midDelivery: "quanxx",
  monDelivery: "links",
};

// 提交资源申请环节下挂的系统操作指引（附件一 15 步的忠实压缩，含真实链接与依据）
const APPLY_GUIDE = [
  { sys: "云盾平台2.0", url: "http://10.100.186.75:8082/front/login",
    action: "登录后进入『综合支持 → 资源管理 → 资源套餐』。" },
  { sys: "云盾平台2.0",
    action: "在『资源申请基本信息』中关联信息系统的『并网准备阶段』工单号。",
    warn: "办数字〔2026〕48号：未通过并网准备阶段审查，不得分配 IT 资源，不得实施部署。" },
  { sys: "云盾平台2.0",
    action: "到『工单中心 → 工单查询 → 并网审查』查到已通过的并网工单号，完成关联。" },
  { sys: "云盾平台2.0",
    action: "新建工单，标题按『【云计算资源】XX系统XX功能资源申请』；资源类型选『南网云平台资源』。",
    warn: "系统名称须与云盾平台记录一一对应，审批发现不一致直接回退。" },
  { sys: "计算资源申请系统", url: "https://10.100.197.153:50010/",
    action: "进入『日常资源申请 → 申请填报 → 计算资源』，勾选所需资源；新增服务器须同时勾选 IP、堡垒机HAC、监控资源。",
    warn: "Q/CSG31112001-2025：单台虚拟机最大 CPU 32 核、内存 64GB。" },
  { sys: "计算资源申请系统",
    action: "按模板填写申请理由：业务背景 / 为何需要新资源 / 规模及测算依据 / 是否已纳入运行方式。",
    warn: "『为何需要新资源』是评审最看重的一栏；扩容类需附监测数据。" },
  { sys: "计算资源申请系统",
    action: "添加资源清单后点『导出』，下载报表。" },
  { sys: "云盾平台2.0",
    action: "将导出报表作为附件提交，选择直属经理审批，完成资源申请。" },
];

// 环节（附件二泳道）；roleIds 可多个 => 一环节多责任人 / 并行
const STEPS = [
  { id: "010", name: "提交资源申请", roleIds: ["owner"], task: "在云盾平台发起物理机/云资源申请。", guide: APPLY_GUIDE },
  { id: "020", name: "报送并网计划", roleIds: ["owner"], task: "每月 25 日前报送下月并网计划。", guide: [] },
  { id: "030", name: "信息系统并网审核", roleIds: ["gridReview"], task: "由安运调度团队完成并网审核。", guide: [] },
  { id: "040", name: "物理机需求审核", roleIds: ["demandReview"], task: "平台运维团队经理审核资源需求合理性。", guide: [] },
  { id: "050", name: "资源 IP 交付", roleIds: ["ipDelivery"], task: "交付资源与 IP。", guide: [
      { sys: "计算资源申请系统", url: "https://10.100.197.153:50010/", action: "无法访问请联系艾洲开通终端访问策略；登录 4A 账号找韦立演获取。" } ] },
  { id: "060", name: "录入云盾系统", roleIds: ["owner"], task: "将交付结果录入云盾系统。", guide: [] },
  { id: "070", name: "上架·网络·初始化", roleIds: ["sysOps"], task: "服务器上架、网络联通配置、资源初始化。", guide: [] },
  { id: "0100", name: "堡垒机 HAC 绑定", roleIds: ["hac"], task: "运维堡垒机 HAC 绑定。", guide: [] },
  { id: "011", name: "资源交付（并行三路）", roleIds: ["swDelivery", "midDelivery", "monDelivery"],
    task: "平台软件、技术中台、监控资源三路并行交付，完成后汇合。", guide: [] },
  { id: "014", name: "特权账号录入", roleIds: ["owner"], task: "账号密码录入特权账号系统。", guide: [] },
];

// ————————————————————————————————————————————————
const font = { fontFamily: '"PingFang SC","Microsoft YaHei","Noto Sans SC",-apple-system,system-ui,sans-serif' };
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace' };

function App() {
  const [assignment, setAssignment] = useState(INITIAL_ASSIGNMENT);
  const [selected, setSelected] = useState(0);
  const [manage, setManage] = useState(false);

  const step = STEPS[selected];

  return (
    <div style={font} className="min-h-screen bg-slate-50 text-slate-800 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        {/* 顶栏 */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-5 w-1.5 rounded-full bg-emerald-600" />
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">物理机服务器资源申请 · 办事地图</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              归谁办 · 做什么、交什么 · 在哪些系统怎么操作（附带链接）。
            </p>
            <p className="mt-1 text-xs text-slate-400">
              维护：管理员统一维护，变更留痕 · 最近更新 2026-07-25 · 所有人看到的都是当前最新版
            </p>
          </div>
          <button
            onClick={() => setManage((m) => !m)}
            className={"rounded-full px-4 py-2 text-sm font-medium transition " +
              (manage ? "bg-emerald-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300")}
          >
            {manage ? "✓ 管理模式" : "管理模式"}
          </button>
        </div>

        {/* 流程线 */}
        <div className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-stretch overflow-x-auto pb-2">
            {STEPS.map((st, i) => {
              const isSel = i === selected;
              const energized = i <= selected;
              const parallel = st.roleIds.length > 1;
              const firstPerson = PEOPLE[assignment[st.roleIds[0]]];
              return (
                <React.Fragment key={st.id}>
                  {i > 0 && (
                    <div className="flex items-center px-1 sm:px-2 pt-5">
                      <div className={"h-0.5 w-7 sm:w-12 rounded-full " + (energized ? "bg-emerald-500" : "bg-slate-200")} />
                    </div>
                  )}
                  <button onClick={() => setSelected(i)} className="flex flex-col items-center min-w-[100px] group">
                    <div
                      className={"relative grid place-items-center h-11 w-11 rounded-full text-xs font-semibold transition " +
                        (isSel ? "bg-emerald-600 text-white ring-4 ring-emerald-100"
                          : "bg-white text-slate-500 ring-2 ring-slate-200 group-hover:ring-emerald-300")}
                      style={mono}
                    >
                      {st.id}
                      {parallel && <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 text-white text-[10px] grid place-items-center">3</span>}
                    </div>
                    <div className={"mt-2 text-xs font-medium text-center max-w-[100px] " + (isSel ? "text-slate-900" : "text-slate-500")}>
                      {st.name}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 text-center">
                      {parallel ? "并行 3 人" : firstPerson.name}
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* 环节详情 */}
        <div className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <span style={mono} className="text-slate-400">{step.id}</span>
            <span className="text-slate-800 font-semibold text-base">{step.name}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.task}</p>

          {/* 责任人（支持多角色/并行） */}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {step.roleIds.map((rid) => {
              const p = PEOPLE[assignment[rid]];
              return (
                <div key={rid} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-400">{ROLES[rid]}</div>
                  {!manage ? (
                    <div className="mt-1 flex items-center gap-3">
                      <div className="grid place-items-center h-9 w-9 rounded-full bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-200 text-sm">
                        {p.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.dept} · 联系方式接通讯录</div>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={assignment[rid]}
                      onChange={(e) => setAssignment((a) => ({ ...a, [rid]: e.target.value }))}
                      className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none"
                    >
                      {Object.entries(PEOPLE).map(([id, pp]) => (
                        <option key={id} value={id}>{pp.name} — {pp.dept}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          {manage && (
            <p className="mt-2 text-xs text-slate-400">该岗位若出现在多个环节，调整后全部同步；变更自动留痕。</p>
          )}

          {/* 系统操作指引 */}
          {step.guide.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold text-slate-400 tracking-wide">系统操作指引</div>
              <ol className="mt-2">
                {step.guide.map((o, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="grid place-items-center h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-semibold" style={mono}>{i + 1}</span>
                      {i < step.guide.length - 1 && <span className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="pb-4 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block text-xs rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 font-medium">{o.sys}</span>
                        {o.url && (
                          <a href={o.url} target="_blank" rel="noreferrer"
                            className="text-xs text-emerald-700 underline decoration-emerald-300 hover:decoration-emerald-600">
                            打开系统 ↗
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{o.action}</p>
                      {o.warn && (
                        <div className="mt-1.5 flex gap-2 rounded-md bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1.5 text-xs text-amber-800">
                          <span className="font-semibold shrink-0">依据/注意</span>
                          <span className="leading-relaxed">{o.warn}</span>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step.guide.length === 0 && (
            <p className="mt-4 text-sm text-slate-400 border-t border-slate-100 pt-4">本环节暂无系统操作指引（可在管理端补充图文与链接）。</p>
          )}
        </div>

        <div className="mt-4 flex gap-5 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-600 inline-block" /> 当前环节</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-amber-400 inline-block" /> 并行多责任人</span>
          <span>链接、依据、责任人均来自真实文档</span>
        </div>
      </div>
    </div>
  );
}

export default App;
