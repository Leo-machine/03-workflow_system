import type { GuideItem, OperatorRole } from "../types";

export const OPERATOR_ROLE_OPTIONS: Array<{ value: OperatorRole; label: string }> = [
  { value: "process_initiator", label: "流程发起人" },
  { value: "business_handler", label: "业务经办人" },
  { value: "business_owner", label: "业务负责人" },
  { value: "business_manager", label: "业务经理" },
  { value: "system_operator", label: "系统运维人员" },
  { value: "designated_person", label: "指定人员" },
];

export function operatorRoleLabel(role: OperatorRole): string {
  return OPERATOR_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? "指定人员";
}

export function resolvedOperatorLabel(item: GuideItem, initiatorName?: string): string {
  if (item.operator_role === "process_initiator") {
    return initiatorName ? `流程发起人 · ${initiatorName}` : "流程发起人（办理时自动识别）";
  }
  if (item.operator_role === "designated_person" && item.persons.length > 0) {
    return `指定人员 · ${item.persons.map((person) => person.name).join("、")}`;
  }
  return operatorRoleLabel(item.operator_role);
}
