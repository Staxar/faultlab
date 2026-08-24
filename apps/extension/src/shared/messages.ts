import type { RuntimeMessage } from "@faultlab/core";

export const FAULTLAB_CHANNEL = "faultlab";

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
    return (
      typeof candidate.scenario === "object" && candidate.scenario !== null
    );
  }
  if (candidate.type === "RESET_SCENARIO") {
    return typeof candidate.scenarioId === "string";
  }
  if (candidate.type === "DELETE_SCENARIO") {
    return typeof candidate.scenarioId === "string";
  }
  if (candidate.type === "CREATE_SCENARIO") {
    return (
      typeof candidate.scenario === "object" && candidate.scenario !== null
    );
  }
  if (
    candidate.type === "START_RECORDING" ||
    candidate.type === "STOP_RECORDING" ||
    candidate.type === "CLEAR_RECORDING"
  ) {
    return true;
  }
  if (candidate.type === "CREATE_SCENARIO_FROM_RECORDING") {
    const recordingCandidate = candidate as {
      name?: unknown;
      requestIds?: unknown;
    };
    return (
      typeof recordingCandidate.name === "string" &&
      Array.isArray(recordingCandidate.requestIds) &&
      recordingCandidate.requestIds.every((id) => typeof id === "string")
    );
  }
  if (candidate.type === "RECORD_EVENT") {
    const eventCandidate = candidate as { event?: Record<string, unknown> };
    const event = eventCandidate.event;
    if (
      !event ||
      typeof event.id !== "string" ||
      typeof event.timestamp !== "number" ||
      !Number.isFinite(event.timestamp)
    ) {
      return false;
    }
    if (event.type === "navigation") return typeof event.url === "string";
    return (
      event.type === "interaction" &&
      (event.action === "click" || event.action === "change") &&
      typeof event.target === "string"
    );
  }
  if (candidate.type === "REPORT_ISSUE") {
    const issueCandidate = candidate as { issue?: Record<string, unknown> };
    const issue = issueCandidate.issue;
    if (
      !issue ||
      typeof issue.id !== "string" ||
      typeof issue.timestamp !== "number" ||
      !Number.isFinite(issue.timestamp) ||
      typeof issue.message !== "string"
    ) {
      return false;
    }
    return (
      issue.type === "runtime" || issue.type === "unhandledrejection"
    );
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
    typeof candidate.scenarioId === "string"
  );
}
