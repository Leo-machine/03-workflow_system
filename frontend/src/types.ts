// 与后端 app/schemas.py 对齐

export type UserRole = "admin" | "viewer";

export interface User {
  username: string;
  role: UserRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ---------- 台账 ----------
export interface Unit {
  id: number;
  name: string;
  order_index: number;
}

export interface DomainRef {
  id: number;
  name: string;
}

export interface Person {
  id: number;
  name: string;
  unit: Unit | null;
  title: string;
  contact: string | null;
  source: string;
  active: boolean;
  domains: DomainRef[]; // 可服务业务域（可多选）
}

// ---------- 业务域 ----------
export interface BusinessDomain {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  order_index: number;
  published_flow_count: number;
}

export interface DomainFlow {
  id: number;
  slug?: string | null;
  name: string;
  description: string;
  status: string;
}

export interface BusinessDomainDetail extends BusinessDomain {
  flows: DomainFlow[];
}

// ---------- 流程 ----------
export interface GuideItem {
  id: number;
  order_index: number;
  system_name: string;
  url: string | null;
  image_path: string | null;
  action_text: string;
  note: string | null;
}

export interface Step {
  id: number;
  code: string;
  name: string;
  task: string;
  order_index: number;
  persons: Person[]; // 环节内嵌人员（多选 = 并行），实时解析台账
  guide: GuideItem[];
}

export interface FlowDetail {
  id: number;
  name: string;
  description: string;
  status: string;
  steps: Step[];
  slug?: string | null;
  domain_id?: number | null;
}

export interface GuideItemDraft {
  system_name: string;
  action_text: string;
  url: string;
  image_path: string | null;
  note: string;
}

export interface StepDefinitionDraft {
  clientKey: string;
  code: string;
  name: string;
  task: string;
  person_ids: number[]; // 环节选用的人员（台账 id）
  guide: GuideItemDraft[];
}

export interface FlowMutationResult {
  flow: FlowDetail;
  change_log_id: number | null;
  changed: boolean; // false = no-op（内容无变化），后端未写日志
}

export interface ChangeLogEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  old_name: string | null;
  new_name: string | null;
  role_name: string | null;
  changed_by: string;
  changed_at: string;
}
