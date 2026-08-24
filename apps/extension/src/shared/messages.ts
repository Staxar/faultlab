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
  return (
    candidate.type === "ACTIVATE_SCENARIO" &&
    typeof candidate.scenarioId === "string"
  );
}
