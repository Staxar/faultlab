import {
  defaultScenarios,
  validateScenario,
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
    const knownIds = new Set(storedState.scenarios.map((scenario) => scenario.id));
    const missingDefaults = defaultScenarios.filter((scenario) => !knownIds.has(scenario.id));
    if (missingDefaults.length === 0) return storedState;
    const migratedState = { ...storedState, scenarios: [...storedState.scenarios, ...missingDefaults] };
    await chrome.storage.local.set({ [KEY]: migratedState });
    return migratedState;
  }
  const state = {
    enabled: false,
    activeScenarioId: null,
    scenarios: defaultScenarios,
  };
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}

async function syncNetwork(state: RuntimeState, tabId?: number): Promise<void> {
  const scenario = state.scenarios.find(
    (candidate) => candidate.id === state.activeScenarioId,
  );
  if (!state.enabled || !scenario) {
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

  await networkAdapter.applyRules(activeTabId, scenario.rules);
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
  if (changeInfo.status === "loading") networkAdapter.clearDiscoveredData(tabId);
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
        if (!state.scenarios.some((scenario) => scenario.id === typedMessage.scenario.id)) {
          return { ok: false, error: "Unknown scenario" };
        }
        const next = {
          ...state,
          scenarios: state.scenarios.map((scenario) =>
            scenario.id === typedMessage.scenario.id ? typedMessage.scenario : scenario,
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
            scenario.id === typedMessage.scenarioId ? defaultScenario : scenario,
          ),
        };
        await chrome.storage.local.set({ [KEY]: next });
        await syncNetwork(next);
        return { ok: true, state: next };
      }
    });
    stateOperation = operation.then(
      () => undefined,
      () => undefined,
    );
    void operation
      .then(sendResponse)
      .catch((e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "Unknown error",
        }),
      );
    return true;
  },
);
