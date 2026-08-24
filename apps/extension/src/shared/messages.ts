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
  return (
    candidate.type === "ACTIVATE_SCENARIO" &&
    typeof candidate.scenarioId === "string"
  );
}
