import {
  defaultScenarios,
  createScenarioFromRecordedRequests,
  validateScenario,
  type RecordedEvent,
  type RecordedRequest,
  type DetectedIssue,
  type FaultInjection,
  type Scenario,
  type FaultRule,
  type RecordedEvent as RuntimeRecordedEvent,
  type RuntimeMessage,
  type RuntimeState,
} from "@faultlab/core";
import { ChromeNetworkAdapter } from "./background/network-adapter";
import { isRuntimeMessage } from "./shared/messages";

const KEY = "faultlab.runtime";
const MAX_PERSISTED_ITEMS = 500;
const networkAdapter = new ChromeNetworkAdapter();
let stateOperation = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedRule(value: unknown): value is FaultRule {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.enabled !== "boolean" || !isRecord(value.matcher) || !isRecord(value.action)) return false;
  const actionType = value.action.type;
  if (![
    "error",
    "delay",
    "throttle",
    "mutate",
    "offline",
  ].includes(String(actionType)) || typeof value.action.probability !== "number") return false;
  if (value.maxApplications !== undefined && typeof value.maxApplications !== "number") return false;
  const matcher = value.matcher;
  if (matcher.urlIncludes !== undefined && typeof matcher.urlIncludes !== "string") return false;
  if (matcher.graphqlOperationName !== undefined && typeof matcher.graphqlOperationName !== "string") return false;
  if (matcher.methods !== undefined && (!Array.isArray(matcher.methods) || matcher.methods.some((method) => typeof method !== "string"))) return false;
  if (matcher.resourceTypes !== undefined && (!Array.isArray(matcher.resourceTypes) || matcher.resourceTypes.some((type) => typeof type !== "string"))) return false;
  if (actionType === "mutate" && (!Array.isArray(value.action.mutations) || value.action.mutations.some((mutation) => !isRecord(mutation) || typeof mutation.path !== "string" || typeof mutation.op !== "string"))) return false;
  return true;
}

function normalizeScenario(value: unknown, defaultIds: Set<string>): Scenario | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.description !== "string" || !Array.isArray(value.rules) || !value.rules.every(isPersistedRule)) return null;
  const scenario = {
    id: value.id,
    name: value.name,
    description: value.description,
    builtIn: defaultIds.has(value.id) || value.builtIn === true,
    rules: value.rules,
  } as Scenario;
  try {
    return validateScenario(scenario) ? null : scenario;
  } catch {
    return null;
  }
}

function normalizeRecordedRequest(value: unknown): RecordedRequest | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string" || typeof value.method !== "string") return null;
  if (value.resourceType !== undefined && typeof value.resourceType !== "string") return null;
  if (value.graphqlOperationName !== undefined && typeof value.graphqlOperationName !== "string") return null;
  return {
    id: value.id,
    url: value.url,
    method: value.method,
    resourceType: value.resourceType,
    graphqlOperationName: value.graphqlOperationName,
  };
}

function normalizeRecordedEvent(value: unknown): RuntimeRecordedEvent | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) return null;
  if (value.type === "navigation" && typeof value.url === "string") return value as RuntimeRecordedEvent;
  if (value.type === "interaction" && (value.action === "click" || value.action === "change") && typeof value.target === "string") return value as RuntimeRecordedEvent;
  return null;
}

function normalizeDetectedIssue(value: unknown): DetectedIssue | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp) || typeof value.tabId !== "number" || typeof value.message !== "string") return null;
  if (!["console", "network", "runtime", "unhandledrejection"].includes(String(value.type))) return null;
  if (
    (value.source !== undefined && typeof value.source !== "string") ||
    (value.url !== undefined && typeof value.url !== "string") ||
    (value.status !== undefined && typeof value.status !== "number") ||
    (value.injectionId !== undefined && typeof value.injectionId !== "string") ||
    (value.scenarioId !== undefined && typeof value.scenarioId !== "string") ||
    (value.ruleId !== undefined && typeof value.ruleId !== "string") ||
    (value.requestId !== undefined && typeof value.requestId !== "string")
  ) return null;
  return {
    id: value.id,
    timestamp: value.timestamp,
    tabId: value.tabId,
    type: value.type as DetectedIssue["type"],
    message: value.message,
    ...(typeof value.source === "string" ? { source: value.source } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.injectionId === "string" ? { injectionId: value.injectionId } : {}),
    ...(typeof value.scenarioId === "string" ? { scenarioId: value.scenarioId } : {}),
    ...(typeof value.ruleId === "string" ? { ruleId: value.ruleId } : {}),
    ...(typeof value.requestId === "string" ? { requestId: value.requestId } : {}),
  };
}

function normalizeFaultInjection(value: unknown): FaultInjection | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp) || typeof value.tabId !== "number" || typeof value.url !== "string" || typeof value.method !== "string" || typeof value.ruleId !== "string" || typeof value.action !== "string") return null;
  if (value.requestId !== undefined && typeof value.requestId !== "string") return null;
  if (value.scenarioId !== undefined && typeof value.scenarioId !== "string") return null;
  if (value.status !== undefined && typeof value.status !== "number") return null;
  if (!["error", "delay", "throttle", "mutate", "offline"].includes(value.action)) return null;
  return value as unknown as FaultInjection;
}

function normalizeRuntimeState(value: unknown): RuntimeState | null {
  if (!isRecord(value) || !Array.isArray(value.scenarios)) return null;
  const defaultIds = new Set(defaultScenarios.map((scenario) => scenario.id));
  const scenarios: Scenario[] = [];
  const scenarioIds = new Set<string>();
  for (const candidate of value.scenarios) {
    const scenario = normalizeScenario(candidate, defaultIds);
    if (scenario && !scenarioIds.has(scenario.id)) {
      scenarioIds.add(scenario.id);
      scenarios.push(scenario);
    }
  }
  for (const scenario of defaultScenarios) {
    if (!scenarioIds.has(scenario.id)) {
      scenarioIds.add(scenario.id);
      scenarios.push(scenario);
    }
  }
  const recorderValue = isRecord(value.recorder) ? value.recorder : {};
  const recorderTabId = typeof recorderValue.tabId === "number" ? recorderValue.tabId : null;
  const recorderRequests = Array.isArray(recorderValue.requests) ? recorderValue.requests.map(normalizeRecordedRequest).filter((request): request is RecordedRequest => request !== null) : [];
  const recorderEvents = Array.isArray(recorderValue.events) ? recorderValue.events.map(normalizeRecordedEvent).filter((event): event is RuntimeRecordedEvent => event !== null) : [];
  const monitorValue = isRecord(value.errorMonitor) ? value.errorMonitor : {};
  const monitorTabId = typeof monitorValue.tabId === "number" ? monitorValue.tabId : null;
  const issues = Array.isArray(monitorValue.issues) ? monitorValue.issues.map(normalizeDetectedIssue).filter((issue): issue is DetectedIssue => issue !== null) : [];
  const injections = Array.isArray(monitorValue.injections) ? monitorValue.injections.map(normalizeFaultInjection).filter((injection): injection is FaultInjection => injection !== null) : [];
  const activeScenarioId = typeof value.activeScenarioId === "string" && scenarioIds.has(value.activeScenarioId) && value.enabled === true ? value.activeScenarioId : null;
  return {
    enabled: value.enabled === true && activeScenarioId !== null,
    activeScenarioId,
    scenarios,
    recorder: {
      active: recorderValue.active === true && recorderTabId !== null,
      tabId: recorderTabId,
      requests: recorderRequests.slice(-MAX_PERSISTED_ITEMS),
      events: recorderEvents.slice(-MAX_PERSISTED_ITEMS),
    },
    errorMonitor: {
      active: monitorValue.active === true && monitorTabId !== null,
      tabId: monitorTabId,
      issues: issues.slice(-MAX_PERSISTED_ITEMS),
      injections: injections.slice(-MAX_PERSISTED_ITEMS),
    },
  };
}

async function getState(): Promise<RuntimeState> {
  const stored = await chrome.storage.local.get(KEY);
  const storedState = normalizeRuntimeState(stored[KEY]);
  if (storedState) {
    networkAdapter.restoreRecordedRequests(
      storedState.recorder.requests,
      storedState.recorder.events,
    );
    networkAdapter.restoreDetectedIssues(
      storedState.errorMonitor.issues,
      storedState.errorMonitor.injections,
    );
    const liveState = {
      ...storedState,
      recorder: storedState.recorder.active
        ? {
            ...storedState.recorder,
            requests: networkAdapter.getRecordedRequests(),
            events: networkAdapter.getRecordedEvents(),
          }
        : storedState.recorder,
      errorMonitor: storedState.errorMonitor.active
        ? {
            ...storedState.errorMonitor,
            issues: networkAdapter.getDetectedIssues(),
            injections: networkAdapter.getFaultInjections(),
          }
        : storedState.errorMonitor,
    };
    if (JSON.stringify(stored[KEY]) !== JSON.stringify(liveState)) {
      await chrome.storage.local.set({ [KEY]: liveState });
    }
    return liveState;
  }
  const state: RuntimeState = {
    enabled: false,
    activeScenarioId: null,
    scenarios: defaultScenarios,
    recorder: { active: false, tabId: null, requests: [], events: [] },
    errorMonitor: { active: false, tabId: null, issues: [], injections: [] },
  };
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

async function syncNetwork(state: RuntimeState, tabId?: number): Promise<void> {
  const scenario = state.scenarios.find(
    (candidate) => candidate.id === state.activeScenarioId,
  );
  if (
    (!state.enabled || !scenario) &&
    !state.recorder.active &&
    !state.errorMonitor.active
  ) {
    await networkAdapter.stop();
    return;
  }

  const activeTabId =
    (state.recorder.active ? state.recorder.tabId : null) ??
    (state.errorMonitor.active ? state.errorMonitor.tabId : null) ??
    tabId ??
    (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (activeTabId == null) {
    await networkAdapter.stop();
    return;
  }

  await networkAdapter.applyRules(
    activeTabId,
    scenario?.rules ?? [],
    state.recorder.active,
    state.errorMonitor.active,
    state.activeScenarioId ?? undefined,
  );
}

chrome.runtime.onInstalled.addListener(() => {
  void getState().catch((error) =>
    console.warn("FaultLab could not initialize state", error),
  );
});
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId != null)
    await chrome.sidePanel.open({ windowId: tab.windowId });
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getState()
    .then((state) => syncNetwork(state, tabId))
    .catch((error) =>
      console.warn("FaultLab could not sync the selected tab", error),
    );
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading")
    networkAdapter.clearDiscoveredData(tabId);
});

chrome.runtime.onSuspend.addListener(() => {
  void networkAdapter.stop();
});

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (!isRuntimeMessage(message)) {
      sendResponse({ ok: false, error: "Invalid message" });
      return false;
    }

    const typedMessage = message as RuntimeMessage;
    const operation = stateOperation.then(async () => {
      const state = await getState();
      if (typedMessage.type === "GET_STATE") {
        if (state.recorder.active || state.errorMonitor.active) {
          await syncNetwork(state);
          const liveState = {
            ...state,
            errorMonitor: {
              ...state.errorMonitor,
              issues: networkAdapter.getDetectedIssues(),
              injections: networkAdapter.getFaultInjections(),
            },
          };
          return { ok: true, state: liveState };
        }
        return { ok: true, state };
      }
      if (typedMessage.type === "GET_DISCOVERED_DATA") {
        return { ok: true, discovered: networkAdapter.getDiscoveredData() };
      }
      if (typedMessage.type === "RECORD_EVENT") {
        if (!state.recorder.active || sender.tab?.id == null) {
          return { ok: false, error: "Recorder is not active" };
        }
        if (!networkAdapter.recordEvent(sender.tab.id, typedMessage.event)) {
          return { ok: false, error: "Event came from a different tab" };
        }
        const next = {
          ...state,
          recorder: {
            ...state.recorder,
            requests: networkAdapter.getRecordedRequests(),
            events: networkAdapter.getRecordedEvents(),
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "REPORT_ISSUE") {
        const tabId = sender.tab?.id;
        if (!state.errorMonitor.active || tabId == null) {
          return { ok: false, error: "Error monitoring is not active" };
        }
        if (tabId !== state.errorMonitor.tabId) {
          return { ok: false, error: "Issue came from a different tab" };
        }
        if (!networkAdapter.recordReportedIssue(tabId, typedMessage.issue)) {
          return { ok: false, error: "Error monitor is not attached" };
        }
        const next = {
          ...state,
          errorMonitor: {
            ...state.errorMonitor,
            issues: networkAdapter.getDetectedIssues(),
            injections: networkAdapter.getFaultInjections(),
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "SET_ENABLED") {
        if (typedMessage.enabled && state.recorder.active) {
          return { ok: false, error: "Stop recording before enabling chaos" };
        }
        if (typedMessage.enabled && state.activeScenarioId === null) {
          return { ok: false, error: "Select a scenario before enabling chaos" };
        }
        const next = {
          ...state,
          enabled: typedMessage.enabled,
          activeScenarioId: typedMessage.enabled
            ? state.activeScenarioId
            : null,
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "ACTIVATE_SCENARIO") {
        if (state.recorder.active) {
          return {
            ok: false,
            error: "Stop recording before activating a scenario",
          };
        }
        const scenario = state.scenarios.find(
          (candidate) => candidate.id === typedMessage.scenarioId,
        );
        if (!scenario) return { ok: false, error: "Unknown scenario" };
        const next = {
          ...state,
          enabled: true,
          activeScenarioId: scenario.id,
        };
        await chrome.storage.local.set({ [KEY]: next });
        try {
          await syncNetwork(next);
        } catch (error) {
          await chrome.storage.local.set({ [KEY]: state });
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not activate scenario",
          };
        }
        return { ok: true, state: next };
      }
      if (typedMessage.type === "DEACTIVATE_SCENARIO") {
        const next = { ...state, enabled: false, activeScenarioId: null };
        await chrome.storage.local.set({ [KEY]: next });
        try {
          await syncNetwork(next);
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not deactivate scenario",
          };
        }
        return { ok: true, state: next };
      }
      if (typedMessage.type === "UPDATE_SCENARIO") {
        const validationError = validateScenario(typedMessage.scenario);
        if (validationError) return { ok: false, error: validationError };
        const currentScenario = state.scenarios.find(
          (scenario) => scenario.id === typedMessage.scenario.id,
        );
        if (!currentScenario) {
          return { ok: false, error: "Unknown scenario" };
        }
        if (currentScenario.builtIn !== typedMessage.scenario.builtIn) {
          return { ok: false, error: "Scenario type cannot be changed" };
        }
        const next = {
          ...state,
          scenarios: state.scenarios.map((scenario) =>
            scenario.id === typedMessage.scenario.id
              ? typedMessage.scenario
              : scenario,
          ),
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "RESET_SCENARIO") {
        const defaultScenario = defaultScenarios.find(
          (scenario) => scenario.id === typedMessage.scenarioId,
        );
        if (!defaultScenario) return { ok: false, error: "Unknown scenario" };
        const next = {
          ...state,
          scenarios: state.scenarios.map((scenario) =>
            scenario.id === typedMessage.scenarioId
              ? defaultScenario
              : scenario,
          ),
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "CREATE_SCENARIO") {
        const validationError = validateScenario(typedMessage.scenario);
        if (validationError) return { ok: false, error: validationError };
        if (typedMessage.scenario.builtIn) {
          return { ok: false, error: "Custom scenarios cannot be built-in" };
        }
        if (
          state.scenarios.some(
            (scenario) => scenario.id === typedMessage.scenario.id,
          )
        ) {
          return { ok: false, error: "Scenario ID already exists" };
        }
        const next = {
          ...state,
          scenarios: [...state.scenarios, typedMessage.scenario],
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "DELETE_SCENARIO") {
        const scenario = state.scenarios.find(
          (candidate) => candidate.id === typedMessage.scenarioId,
        );
        if (!scenario) return { ok: false, error: "Unknown scenario" };
        if (scenario.builtIn)
          return { ok: false, error: "Built-in scenarios cannot be deleted" };
        const next = {
          ...state,
          activeScenarioId:
            state.activeScenarioId === scenario.id
              ? null
              : state.activeScenarioId,
          scenarios: state.scenarios.filter(
            (candidate) => candidate.id !== scenario.id,
          ),
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "START_RECORDING") {
        const activeTabId =
          (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (activeTabId == null) {
          return { ok: false, error: "No active tab to record" };
        }
        if (
          state.errorMonitor.active &&
          state.errorMonitor.tabId !== activeTabId
        ) {
          return { ok: false, error: "Stop monitoring on the other tab first" };
        }
        networkAdapter.clearRecordedRequests();
        const next = {
          ...state,
          enabled: false,
          activeScenarioId: null,
          recorder: { active: true, tabId: activeTabId, requests: [], events: [] },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        const activeTab = await chrome.tabs.get(activeTabId);
        if (activeTab.url?.startsWith("http")) {
          networkAdapter.recordEvent(activeTabId, {
            id: `event-${crypto.randomUUID()}`,
            timestamp: Date.now(),
            type: "navigation",
            url: activeTab.url,
          });
          const recorded = {
            ...next,
            recorder: {
              ...next.recorder,
              requests: networkAdapter.getRecordedRequests(),
              events: networkAdapter.getRecordedEvents(),
            },
          };
          await chrome.storage.local.set({ [KEY]: recorded });
          return { ok: true, state: recorded };
        }
        return { ok: true, state: next };
      }
      if (typedMessage.type === "START_ERROR_MONITORING") {
        const activeTabId =
          (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (activeTabId == null) {
          return { ok: false, error: "No active tab to monitor" };
        }
        if (
          state.recorder.active &&
          state.recorder.tabId !== activeTabId
        ) {
          return { ok: false, error: "Stop recording on the other tab first" };
        }
        if (
          state.errorMonitor.active &&
          state.errorMonitor.tabId !== activeTabId
        ) {
          return { ok: false, error: "Stop monitoring on the other tab first" };
        }
        networkAdapter.clearDetectedIssues();
        const next = {
          ...state,
          errorMonitor: {
            active: true,
            tabId: activeTabId,
            issues: [],
            injections: [],
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next, activeTabId);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "STOP_ERROR_MONITORING") {
        const next = {
          ...state,
          errorMonitor: {
            active: false,
            tabId: null,
            issues: networkAdapter.getDetectedIssues(),
            injections: networkAdapter.getFaultInjections(),
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "CLEAR_DETECTED_ISSUES") {
        networkAdapter.clearDetectedIssues();
        const next = {
          ...state,
          errorMonitor: { ...state.errorMonitor, issues: [], injections: [] },
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "STOP_RECORDING") {
        const next = {
          ...state,
          recorder: {
            active: false,
            tabId: state.recorder.tabId,
            requests: networkAdapter.getRecordedRequests(),
            events: networkAdapter.getRecordedEvents(),
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "CLEAR_RECORDING") {
        networkAdapter.clearRecordedRequests();
        const next = {
          ...state,
          recorder: { ...state.recorder, requests: [], events: [] },
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "CREATE_SCENARIO_FROM_RECORDING") {
        const selected = state.recorder.requests.filter((request) =>
          typedMessage.requestIds.includes(request.id),
        );
        if (selected.length === 0) {
          return { ok: false, error: "Select at least one recorded request" };
        }
        const scenario = createScenarioFromRecordedRequests(
          typedMessage.name,
          selected,
          `custom-${crypto.randomUUID()}`,
        );
        const validationError = validateScenario(scenario);
        if (validationError) return { ok: false, error: validationError };
        const next = { ...state, scenarios: [...state.scenarios, scenario] };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
    });
    stateOperation = operation.then(
      () => undefined,
      () => undefined,
    );
    void operation.then(sendResponse).catch((e) =>
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }),
    );
    return true;
  },
);
