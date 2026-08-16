import type { FlowDetail } from "../types";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 把办事地图导出为 draw.io 可打开的流程图（只导出，不支持再导入）。 */
export function flowToDrawioXml(flow: FlowDetail): string {
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const width = 250;
  const height = 86;
  const gap = 90;
  const startX = 70;
  const stepY = 140;
  const pageWidth = Math.max(1169, startX * 2 + flow.steps.length * width + Math.max(0, flow.steps.length - 1) * gap);
  const maxGuides = Math.max(1, ...flow.steps.map((step) => step.guide.length));
  const pageHeight = Math.max(827, 300 + maxGuides * 92);

  cells.push(
    `<mxCell id="title" value="${esc(flow.name)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#075FA5;strokeColor=#075FA5;fontColor=#ffffff;fontSize=22;fontStyle=1;align=left;spacingLeft=20;verticalAlign=middle;" vertex="1" parent="1"><mxGeometry x="40" y="35" width="${pageWidth - 80}" height="58" as="geometry"/></mxCell>`,
    `<mxCell id="subtitle" value="业务流程地图 · ${flow.steps.length} 个环节 · 导出后可在 diagrams.net 中继续编辑" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=none;fontColor=#64748b;fontSize=12;align=left;" vertex="1" parent="1"><mxGeometry x="44" y="98" width="700" height="24" as="geometry"/></mxCell>`
  );
  flow.steps.forEach((step, index) => {
    const id = `s${index + 1}`;
    const x = startX + index * (width + gap);
    const y = stepY;
    const people = step.persons.map((p) => p.name).join("、");
    const leaders = [
      ...new Map(
        step.guide
          .map((g) => g.direct_leader ?? g.escalation ?? g.unit?.leader)
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => [p.id, p])
      ).values(),
    ];
    const leaderNames = leaders.map((p) => p.name).join("、");
    const label = `${step.code}  ${step.name}${step.task ? `\n${step.task}` : ""}${people ? `\n责任人：${people}` : ""}${leaderNames ? `\n直接领导：${leaderNames}` : ""}`;
    cells.push(
      `<mxCell id="${id}" value="${esc(label)}" style="rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#F1F7FD;strokeColor=#075FA5;strokeWidth=2;fontColor=#0A345B;fontSize=13;fontStyle=1;align=center;verticalAlign=middle;spacing=8;shadow=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/></mxCell>`
    );
    if (index > 0) {
      cells.push(
        `<mxCell id="e${index}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#237AB9;strokeWidth=2;" edge="1" parent="1" source="s${index}" target="${id}"><mxGeometry relative="1" as="geometry"/></mxCell>`
      );
    }
    step.guide.forEach((guide, gi) => {
      const gid = `g${index + 1}-${gi + 1}`;
      const gx = x;
      const gy = y + height + 58 + gi * 90;
      const assignees = guide.persons.map((p) => p.name).join("、");
      const leader = guide.direct_leader ?? guide.escalation ?? guide.unit?.leader;
      const gLabel = `${String(gi + 1).padStart(2, "0")}  ${guide.system_name}${assignees ? `\n责任人：${assignees}` : ""}${leader ? ` · 直接领导：${leader.name}` : ""}\n${guide.action_text}`;
      cells.push(
        `<mxCell id="${gid}" value="${esc(gLabel)}" style="rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#86BCE5;fontColor=#334155;align=left;verticalAlign=middle;spacing=9;fontSize=11;shadow=1;" vertex="1" parent="1"><mxGeometry x="${gx}" y="${gy}" width="${width}" height="70" as="geometry"/></mxCell>`
      );
      cells.push(
        `<mxCell id="eg${index + 1}-${gi + 1}" style="edgeStyle=orthogonalEdgeStyle;endArrow=none;strokeColor=#86BCE5;dashed=1;dashPattern=4 4;" edge="1" parent="1" source="${id}" target="${gid}"><mxGeometry relative="1" as="geometry"/></mxCell>`
      );
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" type="device">
  <diagram id="flow" name="${esc(flow.name)}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" background="#F8FAFC">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

export function downloadDrawio(flow: FlowDetail, fileName?: string): void {
  const xml = flowToDrawioXml(flow);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeName = (fileName || flow.name).trim().replace(/[\\/:*?"<>|]/g, "-") || "业务流程图";
  anchor.download = `${safeName}.drawio`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
