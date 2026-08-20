// 与后端 app/schemas.py 对齐

export type UserRole = "admin" | "viewer";

export interface User {
  id: number;
  username: string;
  role: UserRole;
  display_name: string;
  active: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ---------- 台账 ----------
export interface PersonBrief {
  id: number;
  name: string;
  title: string;
  contact: string | null;
  active: boolean;
}

export interface Unit {
  id: number;
  name: string;
  order_index: number;
  leader: PersonBrief | null;
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

export interface FlowSearchResult {
  id: number;
  name: string;
  description: string;
  domain_id: number;
  domain_name: string;
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
  unit: Unit | null;
  persons: Person[];
  escalation: PersonBrief | null;
  direct_leader: PersonBrief | null;
}

export interface Step {
  id: number;
  code: string;
  name: string;
  task: string;
  order_index: number;
  image_path: string | null;
  persons: Person[]; // 由指引责任人聚合，供流程条展示
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

export interface GuideArchive {
  id: number;
  event_id: number | null;
  flow_id: number;
  step_id: number | null;
  guide_item_id: number | null;
  status: "in_progress" | "completed";
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface GuideEventFlow {
  archive_id: number;
  flow_id: number;
  flow_name: string;
  status: "in_progress" | "completed";
  step_id: number | null;
  guide_item_id: number | null;
  updated_at: string;
}

export interface GuideEvent {
  id: number;
  event_key: string;
  title: string;
  external_ref: string | null;
  status: "in_progress" | "completed";
  created_at: string;
  updated_at: string;
  flows: GuideEventFlow[];
}

export interface AvailableGuideFlow {
  id: number;
  name: string;
  domain_name: string;
}

export interface GuideResume {
  archive_id: number;
  event_id: number | null;
  event_title: string | null;
  event_key: string | null;
  external_ref: string | null;
  status: "in_progress" | "completed";
  updated_at: string;
}

export interface GuideItemDraft {
  system_name: string;
  action_text: string;
  url: string;
  image_path: string | null;
  note: string;
  unit_id: number | null;
  person_ids: number[];
  escalation_person_id: number | null;
}

export interface StepDefinitionDraft {
  clientKey: string;
  code: string;
  name: string;
  task: string;
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
