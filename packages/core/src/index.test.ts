import { describe, expect, it } from "vitest";
import {
  createScenarioFromRecordedRequests,
  defaultScenarios,
  formatObservatoryMarkdown,
  groupDetectedIssues,
  matchesRule,
  redactReportText,
  validateScenario,
  type DetectedIssue,
} from "./index";
import { applyJsonMutations, collectJsonPaths } from "./mutations";

describe("scenario validation and matching", () => {
  it("accepts the built-in scenarios", () => {
    expect(defaultScenarios.every((scenario) => validateScenario(scenario) === null)).toBe(true);
  });

  it("rejects an invalid application limit", () => {
    const scenario = structuredClone(defaultScenarios[0]);
    scenario.rules[0].maxApplications = 0;
    expect(validateScenario(scenario)).toBe("Application limit must be between 1 and 1000");
  });

  it("validates timeout bounds", () => {
    const scenario = structuredClone(defaultScenarios[0]);
    scenario.rules[0].action = {
      type: "timeout",
      timeoutMs: 50,
      probability: 1,
    };
    expect(validateScenario(scenario)).toBe(
      "Timeout must be between 100 and 60000 ms",
    );
    scenario.rules[0].action = {
      type: "timeout",
      timeoutMs: 5000,
      probability: 1,
    };
    expect(validateScenario(scenario)).toBeNull();
  });

  it("matches method, resource type, and URL together", () => {
    const rule = structuredClone(defaultScenarios[0].rules[0]);
    rule.matcher = { urlIncludes: "/checkout", methods: ["POST"], resourceTypes: ["fetch"] };
    expect(matchesRule(rule, { url: "https://example.test/checkout", method: "POST", resourceType: "fetch" })).toBe(true);
    expect(matchesRule(rule, { url: "https://example.test/checkout", method: "GET", resourceType: "fetch" })).toBe(false);
  });
});

describe("JSON mutations", () => {
  it("applies pointer mutations and wildcard paths", () => {
    const body = JSON.stringify({ items: [{ id: 1 }, { id: 2 }], profile: { email: "a@b.test" } });
    expect(applyJsonMutations(body, [{ op: "remove", path: "/items/*/id" }])).toBe(
      JSON.stringify({ items: [{}, {}], profile: { email: "a@b.test" } }),
    );
  });

  it("passes invalid JSON through unchanged", () => {
    const body = "not-json";
    expect(applyJsonMutations(body, [{ op: "nullify", path: "/value" }])).toBe(body);
    expect(collectJsonPaths(body)).toEqual([]);
  });
});

describe("Error Observatory", () => {
  const issue = (overrides: Partial<DetectedIssue> = {}): DetectedIssue => ({
    id: crypto.randomUUID(),
    timestamp: 1000,
    tabId: 7,
    type: "runtime",
    message: "Checkout crashed",
    ...overrides,
  });

  it("groups repeated issues and preserves the time range", () => {
    const findings = groupDetectedIssues([
      issue(),
      issue({ timestamp: 2000 }),
      issue({ id: crypto.randomUUID(), message: "Another issue" }),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.find((finding) => finding.message === "Checkout crashed")).toMatchObject({
      count: 2,
      firstSeen: 1000,
      lastSeen: 2000,
    });
  });

  it("redacts sensitive query values in a markdown export", () => {
    const data = {
      issues: [issue({ url: "https://example.test/checkout?token=secret-value" })],
      injections: [],
      notes: [{ id: "note-1", timestamp: 1000, body: "token=another-secret-value" }],
    };
    const markdown = formatObservatoryMarkdown(data);
    expect(markdown).toContain("token=[REDACTED]");
    expect(markdown).not.toContain("secret-value");
    expect(redactReportText("Bearer abcdefghijklmnopqrstuvwxyz123456")).toContain("[REDACTED]");
  });
});

describe("recorded scenario generation", () => {
  it("creates one delay rule per unique request shape", () => {
    const scenario = createScenarioFromRecordedRequests(
      "Checkout journey",
      [
        { id: "1", url: "https://example.test/cart?cache=1", method: "GET", resourceType: "fetch" },
        { id: "2", url: "https://example.test/cart?cache=2", method: "GET", resourceType: "fetch" },
      ],
      "custom-checkout",
    );
    expect(scenario.builtIn).toBe(false);
    expect(scenario.rules).toHaveLength(1);
    expect(scenario.rules[0].action).toMatchObject({ type: "delay", delayMs: 800 });
  });
});
