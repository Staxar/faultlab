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

export interface RuntimeState {
  enabled: boolean;
  activeScenarioId: string | null;
  scenarios: Scenario[];
}

const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const VALID_RESOURCE_TYPES = new Set([
  "fetch",
  "xhr",
  "document",
  "script",
  "image",
]);
const VALID_ERROR_STATUSES = new Set([401, 403, 404, 408, 429, 500, 502, 503, 504]);

export type RuntimeMessage =
  | { type: "GET_STATE" }
  | { type: "GET_DISCOVERED_DATA" }
  | { type: "SET_ENABLED"; enabled: boolean }
  | { type: "ACTIVATE_SCENARIO"; scenarioId: string }
  | { type: "DEACTIVATE_SCENARIO" }
  | { type: "UPDATE_SCENARIO"; scenario: Scenario }
  | { type: "RESET_SCENARIO"; scenarioId: string }
  | { type: "CREATE_SCENARIO"; scenario: Scenario }
  | { type: "DELETE_SCENARIO"; scenarioId: string };

export function validateScenario(scenario: Scenario): string | null {
  if (!scenario.id || !scenario.name.trim()) return "Scenario name is required";
  if (scenario.name.length > 50) return "Scenario name is too long";
  if (scenario.description.length > 200) return "Scenario description is too long";
  if (scenario.rules.length === 0) return "Scenario must contain at least one rule";

  const ruleIds = new Set<string>();
  for (const rule of scenario.rules) {
    if (!rule.id || ruleIds.has(rule.id)) return "Rule IDs must be unique";
    ruleIds.add(rule.id);
    if (!rule.name.trim()) return "Rule name is required";
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
    if (rule.matcher.methods?.some((method) => !VALID_METHODS.has(method.toUpperCase()))) {
      return "Matcher contains an unsupported HTTP method";
    }
    if (rule.matcher.resourceTypes?.some((type) => !VALID_RESOURCE_TYPES.has(type))) {
      return "Matcher contains an unsupported resource type";
    }
    const probability = rule.action.probability;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      return "Probability must be between 0 and 1";
    }
    if (rule.action.type === "error" && !VALID_ERROR_STATUSES.has(rule.action.status)) {
      return "Unsupported HTTP status";
    }
    if (rule.action.type === "delay" && (!Number.isFinite(rule.action.delayMs) || rule.action.delayMs < 0 || rule.action.delayMs > 60000)) {
      return "Delay must be between 0 and 60000 ms";
    }
    if (rule.action.type === "throttle" && (!Number.isFinite(rule.action.latencyMs) || rule.action.latencyMs < 0 || rule.action.latencyMs > 10000)) {
      return "Latency must be between 0 and 10000 ms";
    }
    if (rule.action.type === "throttle" && (!Number.isFinite(rule.action.downloadKbps) || !Number.isFinite(rule.action.uploadKbps) || rule.action.downloadKbps < 1 || rule.action.uploadKbps < 1 || rule.action.downloadKbps > 50000 || rule.action.uploadKbps > 50000)) {
      return "Bandwidth must be between 1 and 50000 KB/s";
    }
    if (rule.action.type === "mutate") {
      if (rule.action.mutations.length === 0) return "Mutation action needs at least one mutation";
      if (rule.action.mutations.some((mutation) => mutation.path !== "" && !mutation.path.startsWith("/"))) {
        return "Mutation paths must use JSON Pointer syntax";
      }
      if (rule.action.mutations.some((mutation) => mutation.op === "type_mismatch" && !["string", "number", "boolean", "null"].includes(mutation.targetType))) {
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

export function getGraphqlOperationName(
  postData?: string,
): string | undefined {
  if (!postData) return undefined;

  try {
    const body = JSON.parse(postData) as { operationName?: unknown; query?: unknown };
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
