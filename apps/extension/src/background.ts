import {
  defaultScenarios,
  createScenarioFromRecordedRequests,
  validateScenario,
  type RecordedRequest,
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
    const storedRecorder = storedState.recorder ?? {
      active: false,
      requests: [] as RecordedRequest[],
    };
    const recorderWasStored = storedState.recorder !== undefined;
    networkAdapter.restoreRecordedRequests(storedRecorder.requests);
    const liveRequests = networkAdapter.getRecordedRequests();
    const recorder = storedRecorder.active
      ? { ...storedRecorder, requests: liveRequests }
      : storedRecorder;
    const knownIds = new Set(
      storedState.scenarios.map((scenario) => scenario.id),
    );
    const missingDefaults = defaultScenarios.filter(
      (scenario) => !knownIds.has(scenario.id),
    );
    if (
      missingDefaults.length === 0 &&
      recorderWasStored &&
      migratedScenarios.every(
        (scenario, index) =>
          scenario.builtIn === storedState.scenarios[index].builtIn,
      )
    )
      return { ...storedState, scenarios: migratedScenarios, recorder };
    const migratedState = {
      ...storedState,
      scenarios: [...migratedScenarios, ...missingDefaults],
      recorder,
    };
    await chrome.storage.local.set({ [KEY]: migratedState });
    return migratedState;
  }
  const state = {
    enabled: false,
    activeScenarioId: null,
    scenarios: defaultScenarios,
    recorder: { active: false, requests: [] },
  };
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

async function syncNetwork(state: RuntimeState, tabId?: number): Promise<void> {
  const scenario = state.scenarios.find(
    (candidate) => candidate.id === state.activeScenarioId,
  );
  if ((!state.enabled || !scenario) && !state.recorder.active) {
    await networkAdapter.stop();
    return;
  }

  const activeTabId =
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
  (message: unknown, _sender, sendResponse) => {
    if (!isRuntimeMessage(message)) {
      sendResponse({ ok: false, error: "Invalid message" });
      return false;
    }

    const typedMessage = message as RuntimeMessage;
    const operation = stateOperation.then(async () => {
      const state = await getState();
      if (typedMessage.type === "GET_STATE") return { ok: true, state };
      if (typedMessage.type === "GET_DISCOVERED_DATA") {
        return { ok: true, discovered: networkAdapter.getDiscoveredData() };
      }
      if (typedMessage.type === "SET_ENABLED") {
        const next = { ...state, enabled: typedMessage.enabled };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "ACTIVATE_SCENARIO") {
        if (!state.scenarios.some((s) => s.id === typedMessage.scenarioId))
          return { ok: false, error: "Unknown scenario" };
        const next = {
          ...state,
          enabled: true,
          activeScenarioId: typedMessage.scenarioId,
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "DEACTIVATE_SCENARIO") {
        const next = { ...state, activeScenarioId: null };
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
        networkAdapter.clearRecordedRequests();
        const next = {
          ...state,
          enabled: false,
          activeScenarioId: null,
          recorder: { active: true, requests: [] },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "STOP_RECORDING") {
        const next = {
          ...state,
          recorder: {
            active: false,
            requests: networkAdapter.getRecordedRequests(),
          },
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
      if (typedMessage.type === "CLEAR_RECORDING") {
        networkAdapter.clearRecordedRequests();
        const next = { ...state, recorder: { ...state.recorder, requests: [] } };
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
