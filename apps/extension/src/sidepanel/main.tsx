import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  JsonMutation,
  RequestMatcher,
  RuleAction,
  RuntimeMessage,
  RuntimeState,
  Scenario,
} from "@faultlab/core";
import "./styles.css";

const empty: RuntimeState = {
  enabled: false,
  activeScenarioId: null,
  scenarios: [],
};
type RuntimeResponse = {
  ok: boolean;
  state?: RuntimeState;
  discovered?: {
    urls: string[];
    graphqlOperations: string[];
    jsonPaths: string[];
  };
  error?: string;
};
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const RESOURCE_TYPES = ["fetch", "xhr", "document", "script", "image"];
const STATUS_CODES = [401, 403, 404, 408, 429, 500, 502, 503, 504] as const;
const MUTATION_TYPES: JsonMutation["op"][] = [
  "remove",
  "nullify",
  "empty_array",
  "type_mismatch",
];
const TARGET_TYPES = ["string", "number", "boolean", "null"] as const;
const ACTION_TYPES: RuleAction["type"][] = [
  "error",
  "delay",
  "throttle",
  "offline",
  "mutate",
];

function createAction(type: RuleAction["type"]): RuleAction {
  if (type === "error") return { type, status: 500, probability: 1 };
  if (type === "delay") return { type, delayMs: 800, probability: 1 };
  if (type === "throttle") {
    return {
      type,
      latencyMs: 0,
      downloadKbps: 500,
      uploadKbps: 500,
      probability: 1,
    };
  }
  if (type === "mutate") {
    return { type, mutations: [{ op: "remove", path: "/field" }], probability: 1 };
  }
  return { type, probability: 1 };
}

function createCustomScenario(): Scenario {
  return {
    id: `custom-${crypto.randomUUID()}`,
    name: "New scenario",
    description: "A local custom failure scenario.",
    builtIn: false,
    rules: [
      {
        id: `rule-${crypto.randomUUID()}`,
        name: "Failure rule",
        enabled: true,
        matcher: { resourceTypes: ["fetch", "xhr"] },
        action: createAction("delay"),
      },
    ],
  };
}

function createCustomRule(number: number) {
  return {
    id: `rule-${crypto.randomUUID()}`,
    name: `Failure rule ${number}`,
    enabled: true,
    matcher: { resourceTypes: ["fetch", "xhr"] },
    action: createAction("delay"),
  };
}

function hasBroadMatcher(scenario: Scenario): boolean {
  return scenario.rules.some((rule) => {
    if (!rule.enabled) return false;
    const matcher = rule.matcher;
    return !(
      matcher.urlIncludes ||
      matcher.methods?.length ||
      matcher.resourceTypes?.length ||
      matcher.graphqlOperationName
    );
  });
}

const send = (message: RuntimeMessage): Promise<RuntimeResponse> =>
  chrome.runtime.sendMessage(message);
function App() {
  const [state, setState] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [discoveredData, setDiscoveredData] = useState<RuntimeResponse["discovered"]>({
    urls: [],
    graphqlOperations: [],
    jsonPaths: [],
  });
  useEffect(() => {
    let mounted = true;
    void send({ type: "GET_STATE" })
      .then((response) => {
        if (!mounted) return;
        if (response.state) setState(response.state);
        if (!response.ok)
          setError(response.error ?? "Could not load FaultLab state");
      })
      .catch((reason: unknown) => {
        if (mounted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load FaultLab state",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!draft) return;
    let mounted = true;
    const readOperations = async () => {
      try {
        const response = await send({ type: "GET_DISCOVERED_DATA" });
        if (mounted && response.discovered) {
          setDiscoveredData(response.discovered);
        }
      } catch {
        // Operation discovery is optional and should not block scenario editing.
      }
    };
    void readOperations();
    const interval = window.setInterval(() => void readOperations(), 750);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [Boolean(draft)]);
  const refresh = async (message: RuntimeMessage): Promise<boolean> => {
    setError(null);
    try {
      const response = await send(message);
      if (response.state) setState(response.state);
      if (!response.ok)
        setError(response.error ?? "FaultLab could not apply the change");
      return response.ok;
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "FaultLab could not apply the change",
      );
      return false;
    }
  };
  const updateDraft = (update: (scenario: Scenario) => Scenario) =>
    setDraft((current) => (current ? update(current) : current));
  const updateMatcher = (
    ruleIndex: number,
    update: (matcher: RequestMatcher) => RequestMatcher,
  ) =>
    updateDraft((scenario) => ({
      ...scenario,
      rules: scenario.rules.map((rule, index) =>
        index === ruleIndex ? { ...rule, matcher: update(rule.matcher) } : rule,
      ),
    }));
  const updateAction = (
    ruleIndex: number,
    update: (action: RuleAction) => RuleAction,
  ) =>
    updateDraft((scenario) => ({
      ...scenario,
      rules: scenario.rules.map((rule, index) =>
        index === ruleIndex ? { ...rule, action: update(rule.action) } : rule,
      ),
    }));
  const toggleMatcherValue = (
    ruleIndex: number,
    field: "methods" | "resourceTypes",
    value: string,
  ) =>
    updateMatcher(ruleIndex, (matcher) => {
      const values = matcher[field] ?? [];
      return {
        ...matcher,
        [field]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  const openEditor = (scenario: Scenario) => {
    setError(null);
    setDraft(structuredClone(scenario));
  };
  const openNewEditor = () => {
    setError(null);
    setDraft(createCustomScenario());
  };
  const saveDraft = async () => {
    if (!draft) return;
    const exists = state.scenarios.some((scenario) => scenario.id === draft.id);
    const message: RuntimeMessage = exists
      ? { type: "UPDATE_SCENARIO", scenario: draft }
      : { type: "CREATE_SCENARIO", scenario: draft };
    if (await refresh(message)) {
      setDraft(null);
    }
  };
  const resetDraft = async () => {
    if (!draft) return;
    if (await refresh({ type: "RESET_SCENARIO", scenarioId: draft.id })) {
      setDraft(null);
    }
  };
  const activate = (s: Scenario) => {
    if (state.activeScenarioId === s.id) {
      void refresh({ type: "DEACTIVATE_SCENARIO" });
      return;
    }
    if (
      hasBroadMatcher(s) &&
      !window.confirm(
        `${s.name} contains a rule that matches all requests. Activate it?`,
      )
    ) {
      return;
    }
    void refresh({ type: "ACTIVATE_SCENARIO", scenarioId: s.id });
  };
    const deleteScenario = async (scenario: Scenario) => {
      if (!window.confirm(`Delete ${scenario.name}?`)) return;
      await refresh({ type: "DELETE_SCENARIO", scenarioId: scenario.id });
    };
    const addRule = () =>
      updateDraft((scenario) =>
        scenario.builtIn
          ? scenario
          : { ...scenario, rules: [...scenario.rules, createCustomRule(scenario.rules.length + 1)] },
      );
    const removeRule = (ruleIndex: number) =>
      updateDraft((scenario) =>
        scenario.builtIn || scenario.rules.length === 1
          ? scenario
          : { ...scenario, rules: scenario.rules.filter((_, index) => index !== ruleIndex) },
      );
  const operationOptions = draft
    ? [
        ...new Set([
          ...(draft.rules[0]?.matcher.graphqlOperationName
            ? [draft.rules[0].matcher.graphqlOperationName]
            : []),
          ...(discoveredData?.graphqlOperations ?? []),
        ]),
      ]
    : [];
  const urlOptions = draft
    ? [
        ...new Set([
          ...(draft.rules[0]?.matcher.urlIncludes
            ? [draft.rules[0].matcher.urlIncludes]
            : []),
          ...(discoveredData?.urls ?? []),
        ]),
      ]
    : [];
  const jsonPathOptions = draft
    ? [
        ...new Set([
          ...(draft.rules[0]?.action.type === "mutate"
            ? draft.rules[0].action.mutations.map((mutation) => mutation.path)
            : []),
          ...(discoveredData?.jsonPaths ?? []),
        ]),
      ]
    : [];
  return (
    <main className="app">
      <header>
        <div>
          <small>FAILURE INJECTION</small>
          <h1>FaultLab</h1>
        </div>
        <button
          className={state.enabled ? "power on" : "power"}
          disabled={loading}
          onClick={() =>
            void refresh({ type: "SET_ENABLED", enabled: !state.enabled })
          }
        >
          {state.enabled ? "ON" : "OFF"}
        </button>
      </header>
      <div className="status">
        <i className={state.enabled ? "dot active" : "dot"} />
        {loading
          ? "Loading FaultLab state"
          : state.enabled
            ? "Fault injection enabled"
            : "Fault injection disabled"}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="section-heading">
        <small>QUICK CHAOS</small>
        <button className="secondary add-scenario" disabled={loading} onClick={openNewEditor}>
          + New scenario
        </button>
      </div>
      <section>
        {state.scenarios.map((s) => (
          <article className={s.builtIn ? "scenario-row" : "scenario-row custom-row"} key={s.id}>
            <button
              className={
                state.activeScenarioId === s.id ? "scenario active" : "scenario"
              }
              disabled={loading}
              onClick={() => activate(s)}
            >
              <span>
                {s.id === "backend-down"
                  ? "💥"
                  : s.id === "slow-network"
                    ? "🐌"
                    : s.id === "offline"
                      ? "📴"
                      : "🧪"}
              </span>
              <b>
                {s.name}
                <em>{s.description}</em>
              </b>
              <strong>{state.activeScenarioId === s.id ? "✓" : "›"}</strong>
            </button>
            <button
              className="configure"
              disabled={loading}
              title={`Configure ${s.name}`}
              aria-label={`Configure ${s.name}`}
              onClick={() => openEditor(s)}
            >
              ⚙
            </button>
            {!s.builtIn && (
              <button
                className="configure delete-scenario"
                disabled={loading}
                title={`Delete ${s.name}`}
                aria-label={`Delete ${s.name}`}
                onClick={() => void deleteScenario(s)}
              >
                ×
              </button>
            )}
          </article>
        ))}
      </section>
      <div className="note">
        <b>Active:</b> request interception and local-only runtime state.
      </div>
      <footer>MVP 0.3 · local-only</footer>
      {draft && (
        <div className="modal-backdrop">
          <form
            className="editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDraft();
            }}
          >
            <header className="editor-header">
              <div>
                <small>SCENARIO SETTINGS</small>
                <h2>{draft.name}</h2>
              </div>
              <button
                className="close"
                type="button"
                aria-label="Close editor"
                onClick={() => setDraft(null)}
              >
                ×
              </button>
            </header>
            {!draft.builtIn && !state.scenarios.some((scenario) => scenario.id === draft.id) && (
              <div className="field-hint">Custom scenarios are stored only in this browser.</div>
            )}
            <label>
              Scenario name
              <input
                value={draft.name}
                maxLength={50}
                onChange={(event) =>
                  updateDraft((scenario) => ({
                    ...scenario,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={draft.description}
                maxLength={200}
                rows={2}
                onChange={(event) =>
                  updateDraft((scenario) => ({
                    ...scenario,
                    description: event.target.value,
                  }))
                }
              />
            </label>
            {draft.rules.map((rule, ruleIndex) => (
              <fieldset className="rule-editor" key={rule.id}>
                <legend>
                  <span>{rule.name}</span>
                  {!draft.builtIn && (
                    <button
                      className="remove-rule"
                      type="button"
                      disabled={draft.rules.length === 1}
                      title="Remove rule"
                      aria-label="Remove rule"
                      onClick={() => removeRule(ruleIndex)}
                    >
                      ×
                    </button>
                  )}
                </legend>
                <label>
                  Rule name
                  <input
                    value={rule.name}
                    maxLength={50}
                    onChange={(event) =>
                      updateDraft((scenario) => ({
                        ...scenario,
                        rules: scenario.rules.map((item, index) =>
                          index === ruleIndex ? { ...item, name: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) =>
                      updateDraft((scenario) => ({
                        ...scenario,
                        rules: scenario.rules.map((item, index) =>
                          index === ruleIndex
                            ? { ...item, enabled: event.target.checked }
                            : item,
                        ),
                      }))
                    }
                  />
                  Rule enabled
                </label>
                <label>
                  Failure action
                  <select
                    value={rule.action.type}
                    onChange={(event) =>
                      updateDraft((scenario) => ({
                        ...scenario,
                        rules: scenario.rules.map((item, index) =>
                          index === ruleIndex
                            ? { ...item, action: createAction(event.target.value as RuleAction["type"]) }
                            : item,
                        ),
                      }))
                    }
                  >
                    {ACTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Request endpoint
                  <select
                    value={rule.matcher.urlIncludes ?? ""}
                    onChange={(event) =>
                      updateMatcher(ruleIndex, (matcher) => ({
                        ...matcher,
                        urlIncludes: event.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">All observed endpoints</option>
                    {urlOptions.map((url) => (
                      <option key={url} value={url}>
                        {url}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    Endpoints are discovered from requests after the page is refreshed.
                  </span>
                </label>
                <label>
                  GraphQL operation
                  <select
                    value={rule.matcher.graphqlOperationName ?? ""}
                    onChange={(event) =>
                      updateMatcher(ruleIndex, (matcher) => ({
                        ...matcher,
                        graphqlOperationName: event.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">All detected operations</option>
                    {operationOptions.map((operation) => (
                      <option key={operation} value={operation}>
                        {operation}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    Refresh the page after activating the scenario to discover operations and JSON fields.
                  </span>
                </label>
                <div className="choice-group">
                  <span>Methods</span>
                  <div className="choices">
                    {METHODS.map((method) => (
                      <label className="choice" key={method}>
                        <input
                          type="checkbox"
                          checked={rule.matcher.methods?.includes(method) ?? false}
                          onChange={() =>
                            toggleMatcherValue(ruleIndex, "methods", method)
                          }
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="choice-group">
                  <span>Resource types</span>
                  <div className="choices">
                    {RESOURCE_TYPES.map((resourceType) => (
                      <label className="choice" key={resourceType}>
                        <input
                          type="checkbox"
                          checked={
                            rule.matcher.resourceTypes?.includes(resourceType) ??
                            false
                          }
                          onChange={() =>
                            toggleMatcherValue(
                              ruleIndex,
                              "resourceTypes",
                              resourceType,
                            )
                          }
                        />
                        {resourceType}
                      </label>
                    ))}
                  </div>
                </div>
                <label>
                  Probability: {Math.round(rule.action.probability * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(rule.action.probability * 100)}
                    onChange={(event) =>
                      updateAction(ruleIndex, (action) => ({
                        ...action,
                        probability: Number(event.target.value) / 100,
                      }))
                    }
                  />
                </label>
                {rule.action.type !== "throttle" && (
                  <>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={rule.maxApplications !== undefined}
                        onChange={(event) =>
                          updateDraft((scenario) => ({
                            ...scenario,
                            rules: scenario.rules.map((item, index) =>
                              index === ruleIndex
                                ? {
                                    ...item,
                                    maxApplications: event.target.checked
                                      ? item.maxApplications ?? 1
                                      : undefined,
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                      Limit applications per activation
                    </label>
                    {rule.maxApplications !== undefined && (
                      <label>
                        Maximum applications
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          step="1"
                          value={rule.maxApplications}
                          onChange={(event) =>
                            updateDraft((scenario) => ({
                              ...scenario,
                              rules: scenario.rules.map((item, index) =>
                                index === ruleIndex
                                  ? {
                                      ...item,
                                      maxApplications: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <span className="field-hint">
                          Resets when this scenario is activated.
                        </span>
                      </label>
                    )}
                  </>
                )}
                {rule.action.type === "throttle" && (
                  <span className="field-hint">
                    Throttle is a tab-level setting and has no per-request application limit.
                  </span>
                )}
                {rule.action.type === "error" && (
                  <label>
                    HTTP status
                    <select
                      value={rule.action.status}
                      onChange={(event) =>
                        updateAction(ruleIndex, (action) =>
                          action.type === "error"
                            ? {
                                ...action,
                                status: Number(event.target.value) as (typeof STATUS_CODES)[number],
                              }
                            : action,
                        )
                      }
                    >
                      {STATUS_CODES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {rule.action.type === "delay" && (
                  <label>
                    Delay (ms)
                    <input
                      type="number"
                      min="0"
                      max="60000"
                      value={rule.action.delayMs}
                      onChange={(event) =>
                        updateAction(ruleIndex, (action) =>
                          action.type === "delay"
                            ? { ...action, delayMs: Number(event.target.value) }
                            : action,
                        )
                      }
                    />
                  </label>
                )}
                {rule.action.type === "throttle" && (
                  <div className="input-grid">
                    <label>
                      Latency (ms)
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        value={rule.action.latencyMs}
                        onChange={(event) =>
                          updateAction(ruleIndex, (action) =>
                            action.type === "throttle"
                              ? { ...action, latencyMs: Number(event.target.value) }
                              : action,
                          )
                        }
                      />
                    </label>
                    <label>
                      Download (KB/s)
                      <input
                        type="number"
                        min="1"
                        max="50000"
                        value={rule.action.downloadKbps}
                        onChange={(event) =>
                          updateAction(ruleIndex, (action) =>
                            action.type === "throttle"
                              ? {
                                  ...action,
                                  downloadKbps: Number(event.target.value),
                                }
                              : action,
                          )
                        }
                      />
                    </label>
                    <label>
                      Upload (KB/s)
                      <input
                        type="number"
                        min="1"
                        max="50000"
                        value={rule.action.uploadKbps}
                        onChange={(event) =>
                          updateAction(ruleIndex, (action) =>
                            action.type === "throttle"
                              ? { ...action, uploadKbps: Number(event.target.value) }
                              : action,
                          )
                        }
                      />
                    </label>
                  </div>
                )}
                {rule.action.type === "mutate" && (
                  <div className="mutation-list">
                    <span>JSON mutations</span>
                    {rule.action.mutations.map((mutation, mutationIndex) => (
                      <div className="mutation-row" key={`${rule.id}-${mutationIndex}`}>
                        <select
                          value={mutation.op}
                          onChange={(event) => {
                            const op = event.target.value as JsonMutation["op"];
                            const next: JsonMutation =
                              op === "type_mismatch"
                                ? { op, path: mutation.path, targetType: "string" }
                                : { op, path: mutation.path };
                            updateAction(ruleIndex, (action) =>
                              action.type === "mutate"
                                ? {
                                    ...action,
                                    mutations: action.mutations.map((item, index) =>
                                      index === mutationIndex ? next : item,
                                    ),
                                  }
                                : action,
                            );
                          }}
                        >
                          {MUTATION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <select
                          value={mutation.path}
                          onChange={(event) =>
                            updateAction(ruleIndex, (action) =>
                              action.type === "mutate"
                                ? {
                                    ...action,
                                    mutations: action.mutations.map((item, index) =>
                                      index === mutationIndex
                                        ? { ...item, path: event.target.value }
                                        : item,
                                    ),
                                  }
                                : action,
                            )
                          }
                        >
                          <option value="">Choose a JSON field</option>
                          {jsonPathOptions.map((path) => (
                            <option key={path} value={path}>
                              {path}
                            </option>
                          ))}
                        </select>
                        {mutation.op === "type_mismatch" && (
                          <select
                            value={mutation.targetType}
                            onChange={(event) =>
                              updateAction(ruleIndex, (action) =>
                                action.type === "mutate"
                                  ? {
                                      ...action,
                                      mutations: action.mutations.map((item, index) =>
                                        index === mutationIndex && item.op === "type_mismatch"
                                          ? {
                                              ...item,
                                              targetType: event.target.value as (typeof TARGET_TYPES)[number],
                                            }
                                          : item,
                                      ),
                                    }
                                  : action,
                              )
                            }
                          >
                            {TARGET_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          className="remove"
                          type="button"
                          disabled={
                            rule.action.type !== "mutate" ||
                            rule.action.mutations.length === 1
                          }
                          onClick={() =>
                            updateAction(ruleIndex, (action) =>
                              action.type === "mutate"
                                ? {
                                    ...action,
                                    mutations: action.mutations.filter(
                                      (_, index) => index !== mutationIndex,
                                    ),
                                  }
                                : action,
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        updateAction(ruleIndex, (action) =>
                          action.type === "mutate"
                            ? {
                                ...action,
                                mutations: [
                                  ...action.mutations,
                                  { op: "remove", path: "/field" },
                                ],
                              }
                            : action,
                        )
                      }
                    >
                      + Add mutation
                    </button>
                  </div>
                )}
              </fieldset>
            ))}
            {!draft.builtIn && (
              <button className="secondary add-rule" type="button" onClick={addRule}>
                + Add rule
              </button>
            )}
            <div className="editor-actions">
              <button className="secondary" type="button" onClick={() => void resetDraft()}>
                Reset defaults
              </button>
              <span />
              <button className="secondary" type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="primary" type="submit">
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
