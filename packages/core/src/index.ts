import type { JsonMutation } from "./mutations";

export type { JsonMutation } from "./mutations";
export { applyJsonMutations, collectJsonPaths } from "./mutations";

export type RuleAction =
  | {
      type: "error";
      status: 401 | 403 | 404 | 408 | 429 | 500 | 502 | 503 | 504;
      probability: number;
    }
  | { type: "delay"; delayMs: number; probability: number }
  | {
      type: "throttle";
      latencyMs: number;
      downloadKbps: number;
      uploadKbps: number;
      probability: number;
    }
  | { type: "mutate"; mutations: JsonMutation[]; probability: number }
  | { type: "offline"; probability: number };

export interface RequestMatcher {
  urlIncludes?: string;
  methods?: string[];
  resourceTypes?: string[];
  graphqlOperationName?: string;
}

export interface FaultRule {
  id: string;
  name: string;
  enabled: boolean;
  maxApplications?: number;
  matcher: RequestMatcher;
  action: RuleAction;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  rules: FaultRule[];
}

export interface RecordedRequest {
  id: string;
  url: string;
  method: string;
  resourceType?: string;
  graphqlOperationName?: string;
}

export type RecordedEvent =
  | {
      id: string;
      timestamp: number;
      type: "navigation";
      url: string;
    }
  | {
      id: string;
      timestamp: number;
      type: "interaction";
      action: "click" | "change";
      target: string;
    };

export type DetectedIssue = {
  id: string;
  timestamp: number;
  tabId: number;
  type: "console" | "network" | "runtime" | "unhandledrejection";
  message: string;
  source?: string;
  url?: string;
  status?: number;
  injectionId?: string;
  scenarioId?: string;
  ruleId?: string;
  requestId?: string;
};

export type ReportedIssue = Omit<DetectedIssue, "tabId">;

export type FaultInjection = {
  id: string;
  timestamp: number;
  tabId: number;
  requestId?: string;
  url: string;
  method: string;
  scenarioId?: string;
  ruleId: string;
  action: RuleAction["type"];
  status?: number;
};

export type ErrorFinding = {
  id: string;
  type: DetectedIssue["type"];
  message: string;
  source?: string;
  url?: string;
  scenarioId?: string;
  ruleId?: string;
  injectionId?: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
};

export type InvestigationNote = {
  id: string;
  timestamp: number;
  body: string;
  screenshotDataUrl?: string;
};

export type ObservatoryData = {
  issues: DetectedIssue[];
  injections: FaultInjection[];
  notes: InvestigationNote[];
};

export function redactReportText(value: string): string {
  return value
    .replace(/(^|[?&\s])((?:token|access_token|authorization|password|secret|session)[^=\s]*\s*=\s*)[^&\s]*/gi, "$1$2[REDACTED]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{24,}\b/g, "[REDACTED]");
}

export function formatObservatoryMarkdown(data: ObservatoryData): string {
  const findings = groupDetectedIssues(data.issues);
  const lines = [
    "# FaultLab Error Observatory",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Findings",
    "",
  ];
  if (findings.length === 0) lines.push("No findings recorded.", "");
  for (const finding of findings) {
    lines.push(
      `### ${redactReportText(finding.type)} (${finding.count} occurrence${finding.count === 1 ? "" : "s"})`,
      "",
      redactReportText(finding.message),
      "",
      `- Last seen: ${new Date(finding.lastSeen).toISOString()}`,
    );
    if (finding.scenarioId) lines.push(`- Scenario: ${redactReportText(finding.scenarioId)}`);
    if (finding.ruleId) lines.push(`- Rule: ${redactReportText(finding.ruleId)}`);
    if (finding.url) lines.push(`- URL: ${redactReportText(finding.url)}`);
    lines.push("");
  }
  lines.push("## Notes", "");
  if (data.notes.length === 0) lines.push("No notes recorded.", "");
  for (const note of data.notes) {
    lines.push(
      `### ${new Date(note.timestamp).toISOString()}`,
      "",
      redactReportText(note.body),
      "",
      note.screenshotDataUrl
        ? `![Evidence screenshot](${note.screenshotDataUrl})`
        : "",
      "",
    );
  }
  return lines.join("\n");
}

export function groupDetectedIssues(issues: DetectedIssue[]): ErrorFinding[] {
  const findings = new Map<string, ErrorFinding>();
  for (const issue of issues) {
    const key = [
      issue.type,
      issue.message,
      issue.source ?? "",
      issue.url ?? "",
      issue.scenarioId ?? "",
      issue.ruleId ?? "",
      issue.injectionId ?? "",
    ].join("\u0000");
    const existing = findings.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstSeen = Math.min(existing.firstSeen, issue.timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, issue.timestamp);
      continue;
    }
    findings.set(key, {
      id: `finding-${findings.size + 1}`,
      type: issue.type,
      message: issue.message,
      source: issue.source,
      url: issue.url,
      scenarioId: issue.scenarioId,
      ruleId: issue.ruleId,
      injectionId: issue.injectionId,
      count: 1,
      firstSeen: issue.timestamp,
      lastSeen: issue.timestamp,
    });
  }
  return [...findings.values()].sort(
    (left, right) => right.lastSeen - left.lastSeen,
  );
}

export interface RuntimeState {
  enabled: boolean;
  activeScenarioId: string | null;
  scenarios: Scenario[];
  recorder: {
    active: boolean;
    tabId: number | null;
    requests: RecordedRequest[];
    events: RecordedEvent[];
  };
  errorMonitor: {
    active: boolean;
    tabId: number | null;
    issues: DetectedIssue[];
    injections: FaultInjection[];
    notes: InvestigationNote[];
  };
}

const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const VALID_RESOURCE_TYPES = new Set([
  "fetch",
  "xhr",
  "document",
  "script",
  "image",
]);
const VALID_ERROR_STATUSES = new Set([
  401, 403, 404, 408, 429, 500, 502, 503, 504,
]);

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "GET_DISCOVERED_DATA" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "ACTIVATE_SCENARIO"; scenarioId: string }
  | { type: "DEACTIVATE_SCENARIO" }
  | { type: "UPDATE_SCENARIO"; scenario: Scenario }
  | { type: "RESET_SCENARIO"; scenarioId: string }
  | { type: "CREATE_SCENARIO"; scenario: Scenario }
  | { type: "DELETE_SCENARIO"; scenarioId: string }
  | { type: "START_RECORDING" }
  | { type: "STOP_RECORDING" }
  | { type: "CLEAR_RECORDING" }
  | {
      type: "CREATE_SCENARIO_FROM_RECORDING";
      name: string;
      requestIds: string[];
    }
  | { type: "RECORD_EVENT"; event: RecordedEvent }
  | { type: "REPORT_ISSUE"; issue: ReportedIssue }
  | { type: "START_ERROR_MONITORING" }
  | { type: "STOP_ERROR_MONITORING" }
  | { type: "CLEAR_DETECTED_ISSUES" }
  | { type: "CREATE_NOTE"; body: string; screenshotDataUrl?: string }
  | { type: "DELETE_NOTE"; noteId: string }
  | { type: "CAPTURE_SCREENSHOT" };

export function validateScenario(scenario: Scenario): string | null {
  if (!scenario.id || !scenario.name.trim()) return "Scenario name is required";
  if (scenario.name.length > 50) return "Scenario name is too long";
  if (scenario.description.length > 200)
    return "Scenario description is too long";
  if (scenario.rules.length === 0)
    return "Scenario must contain at least one rule";

  const ruleIds = new Set<string>();
  for (const rule of scenario.rules) {
    if (!rule.id || ruleIds.has(rule.id)) return "Rule IDs must be unique";
    ruleIds.add(rule.id);
    if (!rule.name.trim()) return "Rule name is required";
    if (
      rule.maxApplications !== undefined &&
      (!Number.isInteger(rule.maxApplications) ||
        rule.maxApplications < 1 ||
        rule.maxApplications > 1000)
    ) {
      return "Application limit must be between 1 and 1000";
    }
    if (rule.matcher.urlIncludes && rule.matcher.urlIncludes.length > 200) {
      return "URL matcher is too long";
    }
    if (
      rule.matcher.graphqlOperationName &&
      (rule.matcher.graphqlOperationName.length > 100 ||
        !/^[_A-Za-z][_0-9A-Za-z]*$/.test(rule.matcher.graphqlOperationName))
    ) {
      return "GraphQL operation name is invalid";
    }
    if (
      rule.matcher.methods?.some(
        (method) => !VALID_METHODS.has(method.toUpperCase()),
      )
    ) {
      return "Matcher contains an unsupported HTTP method";
    }
    if (
      rule.matcher.resourceTypes?.some(
        (type) => !VALID_RESOURCE_TYPES.has(type),
      )
    ) {
      return "Matcher contains an unsupported resource type";
    }
    const probability = rule.action.probability;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return "Probability must be between 0 and 1";
    }
    if (
      rule.action.type === "error" &&
      !VALID_ERROR_STATUSES.has(rule.action.status)
    ) {
      return "Unsupported HTTP status";
    }
    if (
      rule.action.type === "delay" &&
      (!Number.isFinite(rule.action.delayMs) ||
        rule.action.delayMs < 0 ||
        rule.action.delayMs > 60000)
    ) {
      return "Delay must be between 0 and 60000 ms";
    }
    if (
      rule.action.type === "throttle" &&
      (!Number.isFinite(rule.action.latencyMs) ||
        rule.action.latencyMs < 0 ||
        rule.action.latencyMs > 10000)
    ) {
      return "Latency must be between 0 and 10000 ms";
    }
    if (
      rule.action.type === "throttle" &&
      (!Number.isFinite(rule.action.downloadKbps) ||
        !Number.isFinite(rule.action.uploadKbps) ||
        rule.action.downloadKbps < 1 ||
        rule.action.uploadKbps < 1 ||
        rule.action.downloadKbps > 50000 ||
        rule.action.uploadKbps > 50000)
    ) {
      return "Bandwidth must be between 1 and 50000 KB/s";
    }
    if (rule.action.type === "mutate") {
      if (rule.action.mutations.length === 0)
        return "Mutation action needs at least one mutation";
      if (
        rule.action.mutations.some(
          (mutation) => mutation.path !== "" && !mutation.path.startsWith("/"),
        )
      ) {
        return "Mutation paths must use JSON Pointer syntax";
      }
      if (
        rule.action.mutations.some(
          (mutation) =>
            mutation.op === "type_mismatch" &&
            !["string", "number", "boolean", "null"].includes(
              mutation.targetType,
            ),
        )
      ) {
        return "Mutation contains an unsupported target type";
      }
    }
  }
  return null;
}

export interface RequestContext {
  url: string;
  method: string;
  resourceType?: string;
  graphqlOperationName?: string;
}

export function getGraphqlOperationName(postData?: string): string | undefined {
  if (!postData) return undefined;

  try {
    const body = JSON.parse(postData) as {
      operationName?: unknown;
      query?: unknown;
    };
    if (typeof body.operationName === "string" && body.operationName) {
      return body.operationName;
    }
    if (typeof body.query !== "string") return undefined;
    return body.query.match(
      /^\s*(?:query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/,
    )?.[1];
  } catch {
    return undefined;
  }
}

export function matchesRule(rule: FaultRule, request: RequestContext): boolean {
  if (!rule.enabled) return false;
  const m = rule.matcher;
  if (m.urlIncludes && !request.url.includes(m.urlIncludes)) return false;
  if (
    m.methods?.length &&
    !m.methods.some((x) => x.toUpperCase() === request.method.toUpperCase())
  )
    return false;
  if (
    m.resourceTypes?.length &&
    (!request.resourceType || !m.resourceTypes.includes(request.resourceType))
  )
    return false;
  if (
    m.graphqlOperationName &&
    m.graphqlOperationName !== request.graphqlOperationName
  )
    return false;
  return true;
}

export function createScenarioFromRecordedRequests(
  name: string,
  requests: RecordedRequest[],
  scenarioId: string,
): Scenario {
  const uniqueRequests = new Map<string, RecordedRequest>();
  for (const request of requests) {
    const endpoint = normalizeRecordedEndpoint(request.url);
    const key = [
      endpoint,
      request.method.toUpperCase(),
      request.resourceType ?? "",
      request.graphqlOperationName ?? "",
    ].join("|");
    if (endpoint && !uniqueRequests.has(key)) {
      uniqueRequests.set(key, { ...request, url: endpoint });
    }
  }

  return {
    id: scenarioId,
    name: name.trim() || "Recorded scenario",
    description: "Generated from locally recorded network requests.",
    builtIn: false,
    rules: [...uniqueRequests.values()].map((request, index) => ({
      id: `recorded-rule-${index + 1}`,
      name: `${request.method.toUpperCase()} ${request.url}`.slice(0, 50),
      enabled: true,
      matcher: {
        urlIncludes: request.url,
        methods: [request.method.toUpperCase()],
        ...(request.resourceType
          ? { resourceTypes: [request.resourceType] }
          : {}),
        ...(request.graphqlOperationName
          ? { graphqlOperationName: request.graphqlOperationName }
          : {}),
      },
      action: { type: "delay", delayMs: 800, probability: 1 },
    })),
  };
}

function normalizeRecordedEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value || undefined;
  }
}

export function shouldApply(
  probability: number,
  random = Math.random(),
): boolean {
  return random < Math.max(0, Math.min(1, probability));
}

export const defaultScenarios: Scenario[] = [
  {
    id: "backend-down",
    name: "Backend Down",
    description: "Turn fetch/XHR requests into HTTP 500 responses.",
    builtIn: true,
    rules: [
      {
        id: "backend-down-500",
        name: "API 500",
        enabled: true,
        matcher: { resourceTypes: ["fetch", "xhr"] },
        action: { type: "error", status: 500, probability: 1 },
      },
    ],
  },
  {
    id: "slow-network",
    name: "Slow Network",
    description: "Add 800ms latency and bandwidth limits to requests.",
    builtIn: true,
    rules: [
      {
        id: "slow-network-throttle",
        name: "Bandwidth limit",
        enabled: true,
        matcher: {},
        action: {
          type: "throttle",
          latencyMs: 0,
          downloadKbps: 500,
          uploadKbps: 500,
          probability: 1,
        },
      },
      {
        id: "slow-network-delay",
        name: "Request latency",
        enabled: true,
        matcher: { resourceTypes: ["fetch", "xhr"] },
        action: { type: "delay", delayMs: 800, probability: 1 },
      },
    ],
  },
  {
    id: "offline",
    name: "Offline",
    description: "Fail selected network requests as disconnected.",
    builtIn: true,
    rules: [
      {
        id: "offline",
        name: "Offline",
        enabled: true,
        matcher: {},
        action: { type: "offline", probability: 1 },
      },
    ],
  },
  {
    id: "bad-data",
    name: "Bad Data",
    description: "Mutate JSON responses to expose fragile data handling.",
    builtIn: true,
    rules: [
      {
        id: "bad-data-remove-id",
        name: "Remove ID field",
        enabled: true,
        matcher: { resourceTypes: ["fetch", "xhr"] },
        action: {
          type: "mutate",
          mutations: [{ op: "remove", path: "/id" }],
          probability: 1,
        },
      },
    ],
  },
];
