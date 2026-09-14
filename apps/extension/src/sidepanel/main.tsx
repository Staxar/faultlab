import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  formatObservatoryMarkdown,
  groupDetectedIssues,
} from "@faultlab/core";
import type {
  JsonMutation,
  RequestMatcher,
  RuleAction,
  DetectedIssue,
  RecordedEvent,
  RecordedRequest,
  RuntimeMessage,
  RuntimeState,
  Scenario,
} from "@faultlab/core";
import "./styles.css";

const devChromeReady = import.meta.env.DEV
  ? import("./dev-chrome").then(({ installDevChrome }) => installDevChrome())
  : Promise.resolve();

const empty: RuntimeState = {
  enabled: false,
  activeScenarioId: null,
  scenarios: [],
  recorder: { active: false, tabId: null, requests: [], events: [] },
  errorMonitor: {
    active: false,
    tabId: null,
    issues: [],
    injections: [],
    notes: [],
  },
};
type RuntimeResponse = {
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
  "timeout",
  "throttle",
  "offline",
  "mutate",
];
type FindingFilter = "all" | DetectedIssue["type"] | "correlated";

function createAction(type: RuleAction["type"]): RuleAction {
  if (type === "error") return { type, status: 500, probability: 1 };
  if (type === "delay") return { type, delayMs: 800, probability: 1 };
  if (type === "timeout") return { type, timeoutMs: 5000, probability: 1 };
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
    return {
      type,
      mutations: [{ op: "remove", path: "/field" }],
      probability: 1,
    };
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

function describeRecordedEvent(event: RecordedEvent): string {
  if (event.type === "navigation") return `Navigated to ${event.url}`;
  return `${event.action === "click" ? "Clicked" : "Changed"} ${event.target}`;
}

function issueLabel(issue: DetectedIssue): string {
  if (issue.type === "unhandledrejection") return "Promise rejection";
  if (issue.type === "runtime") return "Runtime error";
  if (issue.type === "console") return "Console error";
  return "Network failure";
}

function issueTypeLabel(type: DetectedIssue["type"]): string {
  return issueLabel({ type } as DetectedIssue);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

const send = (message: RuntimeMessage): Promise<RuntimeResponse> =>
  chrome.runtime.sendMessage(message);
function App() {
  const [state, setState] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const [selectedRecordings, setSelectedRecordings] = useState<Set<string>>(
    new Set(),
  );
  const [noteBody, setNoteBody] = useState("");
  const [pendingScreenshot, setPendingScreenshot] = useState<string | null>(
    null,
  );
  const [findingFilter, setFindingFilter] = useState<FindingFilter>("all");
  const [discoveredData, setDiscoveredData] = useState<
    RuntimeResponse["discovered"]
  >({
    urls: [],
    graphqlOperations: [],
    jsonPaths: [],
  });
  const findings = groupDetectedIssues(state.errorMonitor.issues);
  const visibleFindings = findings.filter((finding) => {
    if (findingFilter === "all") return true;
    if (findingFilter === "correlated") return finding.injectionId !== undefined;
    return finding.type === findingFilter;
  });
  useEffect(() => {
    let mounted = true;
    void devChromeReady
      .then(() => send({ type: "GET_STATE" }))
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
    if (!state.recorder.active) return;
    const interval = window.setInterval(() => {
      void send({ type: "GET_STATE" })
        .then((response) => {
          if (response.state) setState(response.state);
          if (!response.ok)
            setError(response.error ?? "Could not refresh recorder state");
        })
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not refresh recorder state",
          );
        });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state.recorder.active]);
  useEffect(() => {
    if (!state.errorMonitor.active) return;
    const interval = window.setInterval(() => {
      void send({ type: "GET_STATE" })
        .then((response) => {
          if (response.state) setState(response.state);
          if (!response.ok)
            setError(response.error ?? "Could not refresh error state");
        })
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not refresh error state",
          );
        });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state.errorMonitor.active]);
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
  const toggleRecordingSelection = (requestId: string) =>
    setSelectedRecordings((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  const startRecording = async () => {
    setSelectedRecordings(new Set());
    await refresh({ type: "START_RECORDING" });
  };
  const stopRecording = async () => {
    await refresh({ type: "STOP_RECORDING" });
  };
  const clearRecording = async () => {
    setSelectedRecordings(new Set());
    await refresh({ type: "CLEAR_RECORDING" });
  };
  const startErrorMonitoring = async () => {
    await refresh({ type: "START_ERROR_MONITORING" });
  };
  const stopErrorMonitoring = async () => {
    await refresh({ type: "STOP_ERROR_MONITORING" });
  };
  const clearDetectedIssues = async () => {
    await refresh({ type: "CLEAR_DETECTED_ISSUES" });
  };
  const captureScreenshot = async () => {
    setError(null);
    try {
      const response = await send({ type: "CAPTURE_SCREENSHOT" });
      if (response.screenshotDataUrl) {
        setPendingScreenshot(response.screenshotDataUrl);
      } else if (!response.ok) {
        setError(response.error ?? "Could not capture screenshot");
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "Could not capture screenshot",
      );
    }
  };
  const createNote = async () => {
    if (!noteBody.trim() && !pendingScreenshot) {
      setError("Add a note or capture a screenshot first");
      return;
    }
    if (
      await refresh({
        type: "CREATE_NOTE",
        body: noteBody,
        ...(pendingScreenshot ? { screenshotDataUrl: pendingScreenshot } : {}),
      })
    ) {
      setNoteBody("");
      setPendingScreenshot(null);
    }
  };
  const deleteNote = async (noteId: string) => {
    await refresh({ type: "DELETE_NOTE", noteId });
  };
  const exportMarkdown = () => {
    const markdown = formatObservatoryMarkdown({
      issues: state.errorMonitor.issues,
      injections: state.errorMonitor.injections,
      notes: state.errorMonitor.notes,
    });
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `faultlab-observatory-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const reportWindow = window.open("", "_blank", "width=900,height=700");
    if (!reportWindow) {
      setError("Allow pop-ups to print the report as PDF");
      return;
    }
    const findingsHtml = findings.length
      ? findings
          .map(
            (finding) => `<article><h2>${escapeHtml(issueTypeLabel(finding.type))} <small>${finding.count}x</small></h2><p>${escapeHtml(finding.message)}</p><p class="meta">${escapeHtml([finding.scenarioId, finding.ruleId, finding.url].filter(Boolean).join(" · "))}</p></article>`,
          )
          .join("")
      : "<p>No findings recorded.</p>";
    const notesHtml = state.errorMonitor.notes.length
      ? state.errorMonitor.notes
          .map(
            (note) => `<article><h2>Note <small>${new Date(note.timestamp).toLocaleString()}</small></h2><p>${escapeHtml(note.body)}</p>${note.screenshotDataUrl ? `<img src="${escapeHtml(note.screenshotDataUrl)}" alt="Evidence screenshot">` : ""}</article>`,
          )
          .join("")
      : "<p>No notes recorded.</p>";
    reportWindow.document.write(`<!doctype html><html><head><title>FaultLab Error Observatory</title><style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;color:#20232a;max-width:850px;margin:40px auto;padding:0 24px}h1{color:#9b3c22;border-bottom:2px solid #9b3c22;padding-bottom:10px}h2{font-size:16px;margin-bottom:8px}article{border-left:3px solid #d65b32;padding:10px 14px;margin:14px 0;break-inside:avoid}small,.meta{color:#68707d;font-weight:normal}img{display:block;max-width:100%;max-height:520px;margin-top:12px} @media print{body{margin:20px auto}}</style></head><body><h1>FaultLab Error Observatory</h1><p>Generated ${escapeHtml(new Date().toLocaleString())}</p><h2>Findings</h2>${findingsHtml}<h2>Notes and evidence</h2>${notesHtml}</body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.onload = () => reportWindow.print();
  };
  const createFromRecording = async () => {
    const requestIds = [...selectedRecordings];
    if (requestIds.length === 0) {
      setError("Select at least one recorded request");
      return;
    }
    const name = window.prompt("Scenario name", "Recorded scenario");
    if (name == null) return;
    if (
      await refresh({
        type: "CREATE_SCENARIO_FROM_RECORDING",
        name,
        requestIds,
      })
    ) {
      setSelectedRecordings(new Set());
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
        : {
            ...scenario,
            rules: [
              ...scenario.rules,
              createCustomRule(scenario.rules.length + 1),
            ],
          },
    );
  const removeRule = (ruleIndex: number) =>
    updateDraft((scenario) =>
      scenario.builtIn || scenario.rules.length === 1
        ? scenario
        : {
            ...scenario,
            rules: scenario.rules.filter((_, index) => index !== ruleIndex),
          },
    );
  const operationOptions = draft
    ? [
        ...new Set([
          ...draft.rules.flatMap((rule) =>
            rule.matcher.graphqlOperationName
              ? [rule.matcher.graphqlOperationName]
              : [],
          ),
          ...(discoveredData?.graphqlOperations ?? []),
        ]),
      ]
    : [];
  const urlOptions = draft
    ? [
        ...new Set([
          ...draft.rules.flatMap((rule) =>
            rule.matcher.urlIncludes ? [rule.matcher.urlIncludes] : [],
          ),
          ...(discoveredData?.urls ?? []),
        ]),
      ]
    : [];
  const jsonPathOptions = draft
    ? [
        ...new Set([
          ...draft.rules.flatMap((rule) =>
            rule.action.type === "mutate"
              ? rule.action.mutations.map((mutation) => mutation.path)
              : [],
          ),
          ...(discoveredData?.jsonPaths ?? []),
        ]),
      ]
    : [];
  return (
    <main className="app">
      {import.meta.env.DEV && (
        <div className="dev-banner">Local development mode · Chrome APIs mocked</div>
      )}
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
      <section className="recorder-panel">
        <div className="section-heading">
          <small>RECORDER</small>
          <span
            className={state.recorder.active ? "recording-dot" : "field-hint"}
          >
            {state.recorder.active
              ? "Recording"
              : `${state.recorder.requests.length} observed`}
          </span>
        </div>
        <div className="recorder-actions">
          {state.recorder.active ? (
            <button
              className="primary"
              type="button"
              onClick={() => void stopRecording()}
            >
              Stop recording
            </button>
          ) : (
            <button
              className="secondary"
              disabled={loading}
              type="button"
              onClick={() => void startRecording()}
            >
              Start recording
            </button>
          )}
          <button
            className="secondary"
            disabled={loading || state.recorder.requests.length === 0}
            type="button"
            onClick={() => void clearRecording()}
          >
            Clear
          </button>
        </div>
        {state.recorder.requests.length > 0 && (
          <>
            <div className="recorded-list">
              {state.recorder.requests
                .slice(-25)
                .map((request: RecordedRequest) => (
                  <label className="recorded-request" key={request.id}>
                    <input
                      type="checkbox"
                      checked={selectedRecordings.has(request.id)}
                      onChange={() => toggleRecordingSelection(request.id)}
                    />
                    <span>
                      <b>
                        {request.method} {request.url}
                      </b>
                      <em>
                        {[request.resourceType, request.graphqlOperationName]
                          .filter(Boolean)
                          .join(" · ") || "request"}
                      </em>
                    </span>
                  </label>
                ))}
            </div>
            <button
              className="secondary create-recorded"
              disabled={loading || selectedRecordings.size === 0}
              type="button"
              onClick={() => void createFromRecording()}
            >
              Create scenario from selected
            </button>
          </>
        )}
        {state.recorder.events.length > 0 && (
          <div className="recorded-events">
            <span className="field-hint">Journey timeline</span>
            {state.recorder.events.slice(-20).map((event) => (
              <div className="recorded-event" key={event.id}>
                <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                <span>{describeRecordedEvent(event)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="issues-panel">
        <div className="section-heading">
          <small>ERROR DETECTION</small>
          <span
            className={
              state.errorMonitor.active ? "recording-dot" : "field-hint"
            }
          >
            {state.errorMonitor.active
              ? "Monitoring"
              : `${findings.length} findings`}
          </span>
        </div>
        <label className="issue-filter">
          View findings
          <select
            value={findingFilter}
            onChange={(event) =>
              setFindingFilter(event.target.value as FindingFilter)
            }
          >
            <option value="all">All findings ({findings.length})</option>
            <option value="correlated">Correlated injections</option>
            <option value="console">Console errors</option>
            <option value="network">Network failures</option>
            <option value="runtime">Runtime errors</option>
            <option value="unhandledrejection">Promise rejections</option>
          </select>
        </label>
        <div className="recorder-actions">
          {state.errorMonitor.active ? (
            <button
              className="primary"
              type="button"
              onClick={() => void stopErrorMonitoring()}
            >
              Stop monitoring
            </button>
          ) : (
            <button
              className="secondary"
              disabled={loading}
              type="button"
              onClick={() => void startErrorMonitoring()}
            >
              Start monitoring
            </button>
          )}
          <button
            className="secondary"
            disabled={loading || state.errorMonitor.issues.length === 0}
            type="button"
            onClick={() => void clearDetectedIssues()}
          >
            Clear
          </button>
        </div>
        <span className="field-hint issue-hint">
          Console, runtime, Promise, and network failures stay local to this
          browser. Review URLs, messages, and screenshots before sharing
          reports.
        </span>
        {visibleFindings.length > 0 && (
          <div className="issues-list">
            {visibleFindings.slice(0, 30).map((finding) => {
              const injection = finding.injectionId
                ? state.errorMonitor.injections.find(
                    (item) => item.id === finding.injectionId,
                  )
                : undefined;
              const scenario = finding.scenarioId
                ? state.scenarios.find((item) => item.id === finding.scenarioId)
                : undefined;
              return (
                <div className="issue-row" key={finding.id}>
                  <div className="issue-meta">
                    <b>{issueTypeLabel(finding.type)}</b>
                    <strong>{finding.count}x</strong>
                    <time>
                      {new Date(finding.lastSeen).toLocaleTimeString()}
                    </time>
                  </div>
                  <span>{finding.message}</span>
                  {(scenario || injection || finding.source) && (
                    <em>
                      {[
                        scenario?.name,
                        injection && `${injection.method} ${injection.url}`,
                        finding.source,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </em>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {findings.length > 0 && visibleFindings.length === 0 && (
          <span className="field-hint empty-filter">No findings match this filter.</span>
        )}
        <div className="observatory-actions">
          <button
            className="secondary"
            type="button"
            disabled={loading}
            onClick={() => void captureScreenshot()}
          >
            Capture screenshot
          </button>
          <button
            className="secondary"
            type="button"
            disabled={loading}
            onClick={exportMarkdown}
          >
            Export Markdown
          </button>
          <button
            className="secondary"
            type="button"
            disabled={loading}
            onClick={exportPdf}
          >
            Print PDF
          </button>
        </div>
        <div className="note-composer">
          <textarea
            value={noteBody}
            maxLength={2000}
            rows={3}
            placeholder="Add an investigation note"
            onChange={(event) => setNoteBody(event.target.value)}
          />
          {pendingScreenshot && (
            <div className="evidence-preview">
              <img src={pendingScreenshot} alt="Screenshot evidence preview" />
              <button
                className="remove-evidence"
                type="button"
                title="Remove screenshot"
                aria-label="Remove screenshot"
                onClick={() => setPendingScreenshot(null)}
              >
                ×
              </button>
            </div>
          )}
          <button
            className="primary"
            type="button"
            disabled={loading || (!noteBody.trim() && !pendingScreenshot)}
            onClick={() => void createNote()}
          >
            Save note
          </button>
        </div>
        {state.errorMonitor.notes.length > 0 && (
          <div className="notes-list">
            <span className="field-hint">Investigation notes</span>
            {state.errorMonitor.notes
              .slice()
              .reverse()
              .map((note) => (
                <article className="note-entry" key={note.id}>
                  <div className="note-entry-header">
                    <time>{new Date(note.timestamp).toLocaleString()}</time>
                    <button
                      className="remove-evidence"
                      type="button"
                      title="Delete note"
                      aria-label="Delete note"
                      onClick={() => void deleteNote(note.id)}
                    >
                      ×
                    </button>
                  </div>
                  {note.body && <p>{note.body}</p>}
                  {note.screenshotDataUrl && (
                    <img src={note.screenshotDataUrl} alt="Evidence screenshot" />
                  )}
                </article>
              ))}
          </div>
        )}
      </section>
      <div className="section-heading">
        <small>QUICK CHAOS</small>
        <button
          className="secondary add-scenario"
          disabled={loading}
          onClick={openNewEditor}
        >
          + New scenario
        </button>
      </div>
      <section>
        {state.scenarios.map((s) => (
          <article
            className={s.builtIn ? "scenario-row" : "scenario-row custom-row"}
            key={s.id}
          >
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
            {!draft.builtIn &&
              !state.scenarios.some((scenario) => scenario.id === draft.id) && (
                <div className="field-hint">
                  Custom scenarios are stored only in this browser.
                </div>
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
                          index === ruleIndex
                            ? { ...item, name: event.target.value }
                            : item,
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
                            ? {
                                ...item,
                                action: createAction(
                                  event.target.value as RuleAction["type"],
                                ),
                              }
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
                    Endpoints are discovered from requests after the page is
                    refreshed.
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
                    Refresh the page after activating the scenario to discover
                    operations and JSON fields.
                  </span>
                </label>
                <div className="choice-group">
                  <span>Methods</span>
                  <div className="choices">
                    {METHODS.map((method) => (
                      <label className="choice" key={method}>
                        <input
                          type="checkbox"
                          checked={
                            rule.matcher.methods?.includes(method) ?? false
                          }
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
                            rule.matcher.resourceTypes?.includes(
                              resourceType,
                            ) ?? false
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
                                      ? (item.maxApplications ?? 1)
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
                                      maxApplications: Number(
                                        event.target.value,
                                      ),
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
                    Throttle is a tab-level setting and has no per-request
                    application limit.
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
                                status: Number(
                                  event.target.value,
                                ) as (typeof STATUS_CODES)[number],
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
                {rule.action.type === "timeout" && (
                  <label>
                    Timeout (ms)
                    <input
                      type="number"
                      min="100"
                      max="60000"
                      value={rule.action.timeoutMs}
                      onChange={(event) =>
                        updateAction(ruleIndex, (action) =>
                          action.type === "timeout"
                            ? { ...action, timeoutMs: Number(event.target.value) }
                            : action,
                        )
                      }
                    />
                    <span className="field-hint">
                      Fails the request with a network timeout after the selected interval.
                    </span>
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
                              ? {
                                  ...action,
                                  latencyMs: Number(event.target.value),
                                }
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
                              ? {
                                  ...action,
                                  uploadKbps: Number(event.target.value),
                                }
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
                      <div
                        className="mutation-row"
                        key={`${rule.id}-${mutationIndex}`}
                      >
                        <select
                          value={mutation.op}
                          onChange={(event) => {
                            const op = event.target.value as JsonMutation["op"];
                            const next: JsonMutation =
                              op === "type_mismatch"
                                ? {
                                    op,
                                    path: mutation.path,
                                    targetType: "string",
                                  }
                                : { op, path: mutation.path };
                            updateAction(ruleIndex, (action) =>
                              action.type === "mutate"
                                ? {
                                    ...action,
                                    mutations: action.mutations.map(
                                      (item, index) =>
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
                                    mutations: action.mutations.map(
                                      (item, index) =>
                                        index === mutationIndex
                                          ? {
                                              ...item,
                                              path: event.target.value,
                                            }
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
                                      mutations: action.mutations.map(
                                        (item, index) =>
                                          index === mutationIndex &&
                                          item.op === "type_mismatch"
                                            ? {
                                                ...item,
                                                targetType: event.target
                                                  .value as (typeof TARGET_TYPES)[number],
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
              <button
                className="secondary add-rule"
                type="button"
                onClick={addRule}
              >
                + Add rule
              </button>
            )}
            <div className="editor-actions">
              {draft.builtIn ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void resetDraft()}
                >
                  Reset defaults
                </button>
              ) : (
                <span />
              )}
              <span />
              <button
                className="secondary"
                type="button"
                onClick={() => setDraft(null)}
              >
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
const hotWindow = window as typeof window & {
  __faultlabRoot?: ReturnType<typeof createRoot>;
};
const appRoot =
  hotWindow.__faultlabRoot ?? createRoot(document.getElementById("root")!);
hotWindow.__faultlabRoot = appRoot;
appRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
