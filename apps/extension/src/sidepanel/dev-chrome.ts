import {
  createScenarioFromRecordedRequests,
  defaultScenarios,
  type DetectedIssue,
  type RecordedEvent,
  type RecordedRequest,
  type RuntimeMessage,
  type RuntimeState,
} from "@faultlab/core";

type DevResponse = {
  ok: boolean;
  state?: RuntimeState;
  discovered?: {
    urls: string[];
    graphqlOperations: string[];
    jsonPaths: string[];
  };
  screenshotDataUrl?: string;
  error?: string;
};

const devScreenshot =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="1200" height="700" fill="#101114"/><rect x="70" y="70" width="1060" height="560" rx="16" fill="#1b1d22" stroke="#d65b32" stroke-width="4"/><text x="110" y="170" fill="#ffb095" font-family="sans-serif" font-size="44">FaultLab local evidence</text><text x="110" y="235" fill="#c8cad1" font-family="sans-serif" font-size="28">Mock screenshot from Vite development mode</text><circle cx="110" cy="350" r="22" fill="#ed5534"/><text x="160" y="362" fill="#e7e7ea" font-family="sans-serif" font-size="26">Checkout request failed</text></svg>',
  );

const sampleRequests: RecordedRequest[] = [
  {
    id: "dev-request-cart",
    url: "https://demo.local/api/cart",
    method: "GET",
    resourceType: "fetch",
  },
  {
    id: "dev-request-payment",
    url: "https://demo.local/api/payment",
    method: "POST",
    resourceType: "fetch",
    graphqlOperationName: "CheckoutPayment",
  },
  {
    id: "dev-request-products",
    url: "https://demo.local/api/products",
    method: "GET",
    resourceType: "xhr",
  },
];

const sampleEvents: RecordedEvent[] = [
  {
    id: "dev-event-navigation",
    timestamp: Date.now() - 3000,
    type: "navigation",
    url: "https://demo.local/checkout",
  },
  {
    id: "dev-event-click",
    timestamp: Date.now() - 2000,
    type: "interaction",
    action: "click",
    target: "button[data-testid=pay-now]",
  },
];

const sampleIssues: DetectedIssue[] = [
  {
    id: "dev-issue-runtime",
    timestamp: Date.now() - 900,
    tabId: 1,
    type: "runtime",
    message: "Checkout crashed after payment failure",
    source: "https://demo.local/src/checkout.tsx",
    url: "https://demo.local/checkout",
    scenarioId: "backend-down",
    ruleId: "backend-down-500",
    injectionId: "dev-injection-payment",
  },
  {
    id: "dev-issue-runtime-repeat",
    timestamp: Date.now() - 700,
    tabId: 1,
    type: "runtime",
    message: "Checkout crashed after payment failure",
    source: "https://demo.local/src/checkout.tsx",
    url: "https://demo.local/checkout",
    scenarioId: "backend-down",
    ruleId: "backend-down-500",
    injectionId: "dev-injection-payment",
  },
  {
    id: "dev-issue-network",
    timestamp: Date.now() - 1200,
    tabId: 1,
    type: "network",
    message: "Network request failed: TimedOut",
    source: "request dev-request-payment",
    url: "https://demo.local/api/payment",
  },
];

let state: RuntimeState = {
  enabled: false,
  activeScenarioId: null,
  scenarios: structuredClone(defaultScenarios),
  recorder: {
    active: false,
    tabId: null,
    requests: [],
    events: [],
  },
  errorMonitor: {
    active: false,
    tabId: null,
    issues: [],
    injections: [],
    notes: [],
  },
};

const discovered = {
  urls: sampleRequests.map((request) => request.url),
  graphqlOperations: ["CheckoutPayment"],
  jsonPaths: ["/id", "/items", "/items/*/id", "/total"],
};

function cloneState(): RuntimeState {
  return structuredClone(state);
}

function response(): DevResponse {
  return { ok: true, state: cloneState() };
}

export function installDevChrome(): void {
  const runtime = {
    sendMessage: async (message: RuntimeMessage): Promise<DevResponse> => {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      switch (message.type) {
        case "GET_STATE":
          return response();
        case "GET_DISCOVERED_DATA":
          return { ok: true, discovered };
        case "SET_ENABLED":
          if (message.enabled && !state.activeScenarioId) {
            return { ok: false, error: "Select a scenario before enabling chaos" };
          }
          state = {
            ...state,
            enabled: message.enabled,
            activeScenarioId: message.enabled ? state.activeScenarioId : null,
          };
          return response();
        case "ACTIVATE_SCENARIO":
          if (!state.scenarios.some((scenario) => scenario.id === message.scenarioId)) {
            return { ok: false, error: "Unknown scenario" };
          }
          state = { ...state, enabled: true, activeScenarioId: message.scenarioId };
          return response();
        case "DEACTIVATE_SCENARIO":
          state = { ...state, enabled: false, activeScenarioId: null };
          return response();
        case "UPDATE_SCENARIO":
          state = {
            ...state,
            scenarios: state.scenarios.map((scenario) =>
              scenario.id === message.scenario.id ? structuredClone(message.scenario) : scenario,
            ),
          };
          return response();
        case "RESET_SCENARIO":
          state = {
            ...state,
            scenarios: state.scenarios.map((scenario) => {
              const original = defaultScenarios.find((candidate) => candidate.id === message.scenarioId);
              return scenario.id === message.scenarioId && original ? structuredClone(original) : scenario;
            }),
          };
          return response();
        case "CREATE_SCENARIO":
          state = { ...state, scenarios: [...state.scenarios, structuredClone(message.scenario)] };
          return response();
        case "DELETE_SCENARIO":
          state = {
            ...state,
            scenarios: state.scenarios.filter((scenario) => scenario.id !== message.scenarioId),
            activeScenarioId: state.activeScenarioId === message.scenarioId ? null : state.activeScenarioId,
          };
          return response();
        case "START_RECORDING":
          state = {
            ...state,
            enabled: false,
            activeScenarioId: null,
            recorder: { active: true, tabId: 1, requests: sampleRequests, events: sampleEvents },
          };
          return response();
        case "STOP_RECORDING":
          state = { ...state, recorder: { ...state.recorder, active: false } };
          return response();
        case "CLEAR_RECORDING":
          state = { ...state, recorder: { ...state.recorder, requests: [], events: [] } };
          return response();
        case "START_ERROR_MONITORING":
          state = {
            ...state,
            errorMonitor: { ...state.errorMonitor, active: true, tabId: 1, issues: sampleIssues, injections: [] },
          };
          return response();
        case "STOP_ERROR_MONITORING":
          state = { ...state, errorMonitor: { ...state.errorMonitor, active: false } };
          return response();
        case "CLEAR_DETECTED_ISSUES":
          state = { ...state, errorMonitor: { ...state.errorMonitor, issues: [], injections: [] } };
          return response();
        case "CAPTURE_SCREENSHOT":
          return { ok: true, screenshotDataUrl: devScreenshot };
        case "CREATE_NOTE":
          state = {
            ...state,
            errorMonitor: {
              ...state.errorMonitor,
              notes: [
                ...state.errorMonitor.notes,
                {
                  id: `dev-note-${Date.now()}`,
                  timestamp: Date.now(),
                  body: message.body,
                  ...(message.screenshotDataUrl ? { screenshotDataUrl: message.screenshotDataUrl } : {}),
                },
              ].slice(-20),
            },
          };
          return response();
        case "DELETE_NOTE":
          state = {
            ...state,
            errorMonitor: {
              ...state.errorMonitor,
              notes: state.errorMonitor.notes.filter((note) => note.id !== message.noteId),
            },
          };
          return response();
        case "CREATE_SCENARIO_FROM_RECORDING": {
          const selected = state.recorder.requests.filter((request) => message.requestIds.includes(request.id));
          if (!selected.length) return { ok: false, error: "Select at least one recorded request" };
          const scenario = createScenarioFromRecordedRequests(
            message.name,
            selected,
            `dev-recorded-${Date.now()}`,
          );
          state = { ...state, scenarios: [...state.scenarios, scenario] };
          return response();
        }
        case "RECORD_EVENT":
        case "REPORT_ISSUE":
          return { ok: false, error: "Unsupported development message" };
      }
    },
  };
  const devGlobal = globalThis as unknown as {
    chrome?: { runtime: typeof runtime };
  };
  devGlobal.chrome = { runtime };
}
