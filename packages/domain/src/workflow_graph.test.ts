import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = JSON.parse(
  readFileSync(new URL("../../../n8n/workflows/_merged_all_operations.json", import.meta.url), "utf8")
);

describe("merged n8n canvas", () => {
  it("connects all seven webhooks to valid response paths and authenticates domain calls", () => {
    const nodes = new Map(workflow.nodes.map((node: any) => [node.name, node]));
    const edges = (name: string) =>
      (workflow.connections[name]?.main ?? []).flat().map((edge: any) => edge.node);

    expect(workflow.nodes.filter((node: any) => node.type === "n8n-nodes-base.webhook")).toHaveLength(7);
    for (const [name] of nodes) {
      for (const next of edges(name as string)) expect(nodes.has(next)).toBe(true);
    }
    expect(edges("Create: Order Created Successfully?")).toContain("Create: Trigger Showcase Automation");
    expect(edges("Create: Order Created Successfully?")).not.toContain("Create: Respond Success");
    expect(edges("Create: Trigger Showcase Automation")).toContain("Create: Respond Success");
    expect(workflow.connections["Showcase: Switch Service"].main.map((branch: any[]) => branch[0]?.node)).toEqual([
      "Showcase: HVAC Checklist & Equipment",
      "Showcase: Plumbing Checklist & Equipment"
    ]);

    for (const node of workflow.nodes.filter((node: any) =>
      ["n8n-nodes-base.webhook", "n8n-nodes-base.httpRequest"].includes(node.type)
    )) {
      expect(node.credentials?.httpHeaderAuth?.name).toBe("Header Auth account");
      expect(node.parameters.authentication).toBe(node.type === "n8n-nodes-base.webhook" ? "headerAuth" : "genericCredentialType");
      if (node.type === "n8n-nodes-base.httpRequest") {
        expect(node.parameters.genericAuthType).toBe("httpHeaderAuth");
        expect(node.parameters.url).not.toContain("$env");
      }
    }
  });
});
