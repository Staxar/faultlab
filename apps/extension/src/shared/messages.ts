import {
  validateScenario,
  type RuntimeMessage,
  type Scenario,
} from "@faultlab/core";

export const FAULTLAB_CHANNEL = "faultlab";
const MAX_ID_LENGTH = 200;
const MAX_URL_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_TARGET_LENGTH = 200;

function isScenarioMessage(value: unknown): value is Scenario {
  if (typeof value !== "object" || value === null) return false;
  const scenario = value as Record<string, unknown>;
  if (
    typeof scenario.id !== "string" ||
    scenario.id.length > MAX_ID_LENGTH ||
    typeof scenario.name !== "string" ||
    typeof scenario.description !== "string" ||
    typeof scenario.builtIn !== "boolean" ||
    !Array.isArray(scenario.rules)
  ) {
    return false;
  }
  if (
    scenario.rules.some((rule) => {
      if (typeof rule !== "object" || rule === null) return true;
      const candidate = rule as Record<string, unknown>;
      if (
        typeof candidate.id !== "string" ||
        candidate.id.length > MAX_ID_LENGTH ||
        typeof candidate.name !== "string" ||
        typeof candidate.enabled !== "boolean" ||
        typeof candidate.matcher !== "object" ||
        candidate.matcher === null ||
        typeof candidate.action !== "object" ||
        candidate.action === null
      ) {
        return true;
      }
      const matcher = candidate.matcher as Record<string, unknown>;
      if (
        (matcher.urlIncludes !== undefined &&
          (typeof matcher.urlIncludes !== "string" ||
            matcher.urlIncludes.length > MAX_URL_LENGTH)) ||
        (matcher.graphqlOperationName !== undefined &&
          (typeof matcher.graphqlOperationName !== "string" ||
            matcher.graphqlOperationName.length > 100)) ||
        (matcher.methods !== undefined &&
          (!Array.isArray(matcher.methods) ||
            matcher.methods.some((method) => typeof method !== "string"))) ||
        (matcher.resourceTypes !== undefined &&
          (!Array.isArray(matcher.resourceTypes) ||
            matcher.resourceTypes.some((type) => typeof type !== "string")))
      ) {
        return true;
      }
      const action = candidate.action as Record<string, unknown>;
      return (
        action.type === "mutate" &&
        (!Array.isArray(action.mutations) ||
          action.mutations.some(
            (mutation) =>
              typeof mutation !== "object" ||
              mutation === null ||
              typeof (mutation as Record<string, unknown>).path !== "string" ||
              typeof (mutation as Record<string, unknown>).op !== "string",
          ))
      );
    })
  ) {
    return false;
  }
  try {
    return validateScenario(scenario as unknown as Scenario) === null;
  } catch {
    return false;
  }
}

export function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (typeof message !== "object" || message == null || !("type" in message)) {
    return false;
  }

  const candidate = message as {
    type?: unknown;
    enabled?: unknown;
    scenarioId?: unknown;
    scenario?: unknown;
  };
  if (
    candidate.type === "GET_STATE" ||
    candidate.type === "GET_DISCOVERED_DATA" ||
    candidate.type === "DEACTIVATE_SCENARIO"
  ) {
    return true;
  }
  if (candidate.type === "SET_ENABLED") {
    return typeof candidate.enabled === "boolean";
  }
  if (candidate.type === "UPDATE_SCENARIO") {
    return isScenarioMessage(candidate.scenario);
  }
  if (candidate.type === "RESET_SCENARIO") {
    return (
      typeof candidate.scenarioId === "string" &&
      candidate.scenarioId.length <= MAX_ID_LENGTH
    );
  }
  if (candidate.type === "DELETE_SCENARIO") {
    return (
      typeof candidate.scenarioId === "string" &&
      candidate.scenarioId.length <= MAX_ID_LENGTH
    );
  }
  if (candidate.type === "CREATE_SCENARIO") {
    return isScenarioMessage(candidate.scenario);
  }
  if (
    candidate.type === "START_RECORDING" ||
    candidate.type === "STOP_RECORDING" ||
    candidate.type === "CLEAR_RECORDING"
  ) {
    return true;
  }
  if (candidate.type === "CAPTURE_SCREENSHOT") {
    return true;
  }
  if (candidate.type === "CREATE_NOTE") {
    const noteCandidate = candidate as {
      body?: unknown;
      screenshotDataUrl?: unknown;
    };
    return (
      typeof noteCandidate.body === "string" &&
      noteCandidate.body.length <= MAX_MESSAGE_LENGTH &&
      (noteCandidate.screenshotDataUrl === undefined ||
        (typeof noteCandidate.screenshotDataUrl === "string" &&
          noteCandidate.screenshotDataUrl.startsWith("data:image/") &&
          noteCandidate.screenshotDataUrl.length <= 800_000))
    );
  }
  if (candidate.type === "DELETE_NOTE") {
    const noteCandidate = candidate as { noteId?: unknown };
    return (
      typeof noteCandidate.noteId === "string" &&
      noteCandidate.noteId.length <= MAX_ID_LENGTH
    );
  }
  if (candidate.type === "CREATE_SCENARIO_FROM_RECORDING") {
    const recordingCandidate = candidate as {
      name?: unknown;
      requestIds?: unknown;
    };
    return (
      typeof recordingCandidate.name === "string" &&
      recordingCandidate.name.length <= 50 &&
      Array.isArray(recordingCandidate.requestIds) &&
      recordingCandidate.requestIds.length <= 500 &&
      recordingCandidate.requestIds.every(
        (id) => typeof id === "string" && id.length <= MAX_ID_LENGTH,
      )
    );
  }
  if (candidate.type === "RECORD_EVENT") {
    const eventCandidate = candidate as { event?: Record<string, unknown> };
    const event = eventCandidate.event;
    if (
      !event ||
      typeof event.id !== "string" ||
      event.id.length > MAX_ID_LENGTH ||
      typeof event.timestamp !== "number" ||
      !Number.isFinite(event.timestamp)
    ) {
      return false;
    }
    if (event.type === "navigation") {
      return (
        typeof event.url === "string" && event.url.length <= MAX_URL_LENGTH
      );
    }
    return (
      event.type === "interaction" &&
      (event.action === "click" || event.action === "change") &&
      typeof event.target === "string" &&
      event.target.length <= MAX_TARGET_LENGTH
    );
  }
  if (candidate.type === "REPORT_ISSUE") {
    const issueCandidate = candidate as { issue?: Record<string, unknown> };
    const issue = issueCandidate.issue;
    if (
      !issue ||
      typeof issue.id !== "string" ||
      issue.id.length > MAX_ID_LENGTH ||
      typeof issue.timestamp !== "number" ||
      !Number.isFinite(issue.timestamp) ||
      typeof issue.message !== "string" ||
      issue.message.length > MAX_MESSAGE_LENGTH
    ) {
      return false;
    }
    if (
      (issue.source !== undefined &&
        (typeof issue.source !== "string" ||
          issue.source.length > MAX_URL_LENGTH)) ||
      (issue.url !== undefined &&
        (typeof issue.url !== "string" || issue.url.length > MAX_URL_LENGTH)) ||
      (issue.status !== undefined &&
        (typeof issue.status !== "number" || !Number.isFinite(issue.status)))
    ) {
      return false;
    }
    return issue.type === "runtime" || issue.type === "unhandledrejection";
  }
  if (
    candidate.type === "START_ERROR_MONITORING" ||
    candidate.type === "STOP_ERROR_MONITORING" ||
    candidate.type === "CLEAR_DETECTED_ISSUES"
  ) {
    return true;
  }
  return (
    candidate.type === "ACTIVATE_SCENARIO" &&
    typeof candidate.scenarioId === "string" &&
    candidate.scenarioId.length <= MAX_ID_LENGTH
  );
}
