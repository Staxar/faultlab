import {
  defaultScenarios,
  createScenarioFromRecordedRequests,
  validateScenario,
  type RecordedEvent,
  type RecordedRequest,
  type DetectedIssue,
  type RuntimeMessage,
  type RuntimeState,
} from "@faultlab/core";
import { ChromeNetworkAdapter } from "./background/network-adapter";
import { isRuntimeMessage } from "./shared/messages";

const KEY = "faultlab.runtime";
const networkAdapter = new ChromeNetworkAdapter();
let stateOperation = Promise.resolve();

async function getState(): Promise<RuntimeState> {
  const stored = await chrome.storage.local.get(KEY);
  const storedState = stored[KEY] as RuntimeState | undefined;
  if (storedState) {
    const defaultIds = new Set(defaultScenarios.map((scenario) => scenario.id));
    const migratedScenarios = storedState.scenarios.map((scenario) => ({
      ...scenario,
      builtIn: scenario.builtIn ?? defaultIds.has(scenario.id),
    }));
    const storedRecorder = storedState.recorder ?? {};
    const storedTabId =
      typeof storedRecorder.tabId === "number" ? storedRecorder.tabId : null;
    const normalizedRecorder = {
      active: storedRecorder.active === true && storedTabId !== null,
      tabId: storedTabId,
      requests: Array.isArray(storedRecorder.requests)
        ? storedRecorder.requests
        : [],
      events: Array.isArray(storedRecorder.events)
        ? storedRecorder.events
        : [],
    };
    const storedErrorMonitor = storedState.errorMonitor ?? {};
    const normalizedErrorMonitor = {
      active:
        storedErrorMonitor.active === true &&
        typeof storedErrorMonitor.tabId === "number",
      tabId:
        typeof storedErrorMonitor.tabId === "number"
          ? storedErrorMonitor.tabId
          : null,
      issues: Array.isArray(storedErrorMonitor.issues)
        ? storedErrorMonitor.issues
        : ([] as DetectedIssue[]),
    };
    networkAdapter.restoreRecordedRequests(
      normalizedRecorder.requests,
      normalizedRecorder.events,
    );
    networkAdapter.restoreDetectedIssues(normalizedErrorMonitor.issues);
    const liveRequests = networkAdapter.getRecordedRequests();
    const recorder = normalizedRecorder.active
      ? {
          ...normalizedRecorder,
          requests: liveRequests,
          events: networkAdapter.getRecordedEvents(),
        }
      : normalizedRecorder;
    const knownIds = new Set(
      storedState.scenarios.map((scenario) => scenario.id),
    );
    const missingDefaults = defaultScenarios.filter(
      (scenario) => !knownIds.has(scenario.id),
    );
    if (
      missingDefaults.length === 0 &&
      storedState.recorder !== undefined &&
      migratedScenarios.every(
        (scenario, index) =>
          scenario.builtIn === storedState.scenarios[index].builtIn,
      )
    )
      return {
        ...storedState,
        scenarios: migratedScenarios,
        recorder,
        errorMonitor: normalizedErrorMonitor,
      };
    const migratedState = {
      ...storedState,
      scenarios: [...migratedScenarios, ...missingDefaults],
      recorder,
      errorMonitor: normalizedErrorMonitor,
    };
    await chrome.storage.local.set({ [KEY]: migratedState });
    return migratedState;
  }
  const state = {
    enabled: false,
    activeScenarioId: null,
    scenarios: defaultScenarios,
    recorder: { active: false, tabId: null, requests: [], events: [] },
    errorMonitor: { active: false, tabId: null, issues: [] },
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
        if (state.errorMonitor.active) {
          await syncNetwork(state);
          const liveState = {
            ...state,
            errorMonitor: {
              ...state.errorMonitor,
              issues: networkAdapter.getDetectedIssues(),
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
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        return { ok: true, state: next };
      }
      if (typedMessage.type === "SET_ENABLED") {
        if (typedMessage.enabled && state.recorder.active) {
          return { ok: false, error: "Stop recording before enabling chaos" };
        }
        const next = { ...state, enabled: typedMessage.enabled };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
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
          if (state.recorder.active) {
            return { ok: false, error: "Stop recording before activating a scenario" };
          }
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
        networkAdapter.clearDetectedIssues();
        const next = {
          ...state,
          errorMonitor: { active: true, tabId: activeTabId, issues: [] },
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
          errorMonitor: { ...state.errorMonitor, issues: [] },
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
