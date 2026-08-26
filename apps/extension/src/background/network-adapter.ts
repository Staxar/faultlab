import {
  applyJsonMutations,
  collectJsonPaths,
  getGraphqlOperationName,
  matchesRule,
  shouldApply,
  type FaultRule,
  type DetectedIssue,
  type FaultInjection,
  type RecordedEvent,
  type RecordedRequest,
} from "@faultlab/core";

const MAX_MUTATION_BODY_BYTES = 5 * 1024 * 1024;
const MAX_RECORDED_REQUESTS = 500;
const MAX_RECORDED_EVENTS = 500;
const MAX_DETECTED_ISSUES = 500;

type ResponseHeader = { name: string; value: string };

type RequestPausedEvent = {
  requestId: string;
  request: {
    url: string;
    method: string;
    postData?: string;
  };
  resourceType?: string;
  responseStatusCode?: number;
  responsePhrase?: string;
  responseHeaders?: ResponseHeader[];
  networkId?: string;
};

export class ChromeNetworkAdapter {
  private attachedTabId: number | null = null;
  private rules: FaultRule[] = [];
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private operation = Promise.resolve();
  private observedUrls = new Set<string>();
  private observedGraphqlOperations = new Set<string>();
  private observedJsonPaths = new Set<string>();
  private applicationCounts = new Map<string, number>();
  private recording = false;
  private recordedRequests: RecordedRequest[] = [];
  private recordedRequestIds = new Set<string>();
  private recordedEvents: RecordedEvent[] = [];
  private restoredRecordedRequests = false;
  private monitoring = false;
  private detectedIssues: DetectedIssue[] = [];
  private restoredDetectedIssues = false;
  private faultInjections: FaultInjection[] = [];
  private scenarioId: string | undefined;

  constructor() {
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId == null) return;
      if (method === "Fetch.requestPaused") {
        void this.handleRequest(source.tabId, params as RequestPausedEvent);
      } else if (method === "Runtime.consoleAPICalled") {
        this.handleConsoleIssue(
          source.tabId,
          params as Record<string, unknown>,
        );
      } else if (method === "Runtime.exceptionThrown") {
        this.handleRuntimeIssue(
          source.tabId,
          params as Record<string, unknown>,
        );
      } else if (method === "Network.loadingFailed") {
        this.handleNetworkIssue(
          source.tabId,
          params as Record<string, unknown>,
        );
      }
    });

    chrome.debugger.onDetach.addListener((source) => {
      if (source.tabId === this.attachedTabId) {
        this.attachedTabId = null;
        this.rules = [];
        this.monitoring = false;
        this.clearPendingTimeouts();
      }
    });
  }

  async applyRules(
    tabId: number,
    rules: FaultRule[],
    recording = false,
    monitoring = false,
    scenarioId?: string,
  ): Promise<void> {
    const operation = this.operation.then(() =>
      this.applyRulesNow(tabId, rules, recording, monitoring, scenarioId),
    );
    this.operation = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async stop(): Promise<void> {
    const operation = this.operation.then(() => this.stopNow());
    this.operation = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  getGraphqlOperations(): string[] {
    return [...this.observedGraphqlOperations].sort();
  }

  getRecordedRequests(): RecordedRequest[] {
    return [...this.recordedRequests];
  }

  getRecordedEvents(): RecordedEvent[] {
    return [...this.recordedEvents];
  }

  getDetectedIssues(): DetectedIssue[] {
    return [...this.detectedIssues];
  }

  getFaultInjections(): FaultInjection[] {
    return [...this.faultInjections];
  }

  clearRecordedRequests(): void {
    this.recordedRequests = [];
    this.recordedRequestIds.clear();
    this.recordedEvents = [];
  }

  clearDetectedIssues(): void {
    this.detectedIssues = [];
    this.faultInjections = [];
  }

  restoreDetectedIssues(
    issues: DetectedIssue[],
    injections: FaultInjection[] = [],
  ): void {
    if (this.restoredDetectedIssues) return;
    this.restoredDetectedIssues = true;
    this.detectedIssues = issues.slice(-MAX_DETECTED_ISSUES);
    this.faultInjections = injections.slice(-MAX_DETECTED_ISSUES);
  }

  restoreRecordedRequests(
    requests: RecordedRequest[],
    events: RecordedEvent[] = [],
  ): void {
    if (this.restoredRecordedRequests) return;
    this.restoredRecordedRequests = true;
    this.recordedRequests = requests.slice(-MAX_RECORDED_REQUESTS);
    this.recordedRequestIds = new Set(
      this.recordedRequests.map((request) => request.id),
    );
    this.recordedEvents = events.slice(-MAX_RECORDED_EVENTS);
  }

  recordEvent(tabId: number, event: RecordedEvent): boolean {
    if (!this.recording || this.attachedTabId !== tabId) return false;
    this.recordedEvents.push(event);
    if (this.recordedEvents.length > MAX_RECORDED_EVENTS) {
      this.recordedEvents.shift();
    }
    return true;
  }

  recordReportedIssue(
    tabId: number,
    issue: Omit<DetectedIssue, "tabId">,
  ): boolean {
    if (!this.monitoring || this.attachedTabId !== tabId) return false;
    this.detectedIssues.push(
      this.withCorrelation({
        id: issue.id,
        timestamp: issue.timestamp,
        tabId,
        type: issue.type,
        message: issue.message,
        ...(issue.source === undefined ? {} : { source: issue.source }),
        ...(issue.url === undefined ? {} : { url: issue.url }),
        ...(issue.status === undefined ? {} : { status: issue.status }),
      }),
    );
    if (this.detectedIssues.length > MAX_DETECTED_ISSUES) {
      this.detectedIssues.shift();
    }
    return true;
  }

  getDiscoveredData(): {
    urls: string[];
    graphqlOperations: string[];
    jsonPaths: string[];
  } {
    return {
      urls: [...this.observedUrls].sort(),
      graphqlOperations: this.getGraphqlOperations(),
      jsonPaths: [...this.observedJsonPaths].sort(),
    };
  }

  clearDiscoveredData(tabId: number): void {
    if (this.attachedTabId !== tabId) return;
    this.observedUrls.clear();
    this.observedGraphqlOperations.clear();
    this.observedJsonPaths.clear();
  }

  private async applyRulesNow(
    tabId: number,
    rules: FaultRule[],
    recording: boolean,
    monitoring: boolean,
    scenarioId?: string,
  ): Promise<void> {
    if (this.attachedTabId !== tabId) {
      await this.stopNow();
      this.observedUrls.clear();
      this.observedGraphqlOperations.clear();
      this.observedJsonPaths.clear();
      try {
        await chrome.debugger.attach({ tabId }, "1.3");
        this.attachedTabId = tabId;
        await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
          patterns: [{ requestStage: "Request" }, { requestStage: "Response" }],
        });
      } catch (error) {
        await this.stopNow();
        console.warn("FaultLab could not attach to the selected tab", error);
        throw error;
      }
    }

    try {
      const throttle = rules.find(
        (rule) =>
          rule.enabled &&
          rule.action.type === "throttle" &&
          shouldApply(rule.action.probability),
      );
      await chrome.debugger.sendCommand(
        { tabId },
        "Network.emulateNetworkConditions",
        throttle?.action.type === "throttle"
          ? {
              offline: false,
              latency: Math.max(0, throttle.action.latencyMs),
              downloadThroughput:
                Math.max(0, throttle.action.downloadKbps) * 1024,
              uploadThroughput: Math.max(0, throttle.action.uploadKbps) * 1024,
            }
          : {
              offline: false,
              latency: 0,
              downloadThroughput: -1,
              uploadThroughput: -1,
            },
      );
      this.applicationCounts.clear();
      this.recording = recording;
      this.monitoring = monitoring;
      this.scenarioId = scenarioId;
      if (monitoring) {
        await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
        await chrome.debugger.sendCommand({ tabId }, "Network.enable");
      }
      this.rules = rules;
    } catch (error) {
      await this.stopNow();
      console.warn("FaultLab could not configure the selected tab", error);
      throw error;
    }
  }

  private async stopNow(): Promise<void> {
    this.rules = [];
    this.recording = false;
    this.monitoring = false;
    this.scenarioId = undefined;
    this.applicationCounts.clear();
    this.clearPendingTimeouts();
    if (this.attachedTabId == null) return;
    const tabId = this.attachedTabId;
    this.attachedTabId = null;
    try {
      await chrome.debugger.sendCommand(
        { tabId },
        "Network.emulateNetworkConditions",
        {
          offline: false,
          latency: 0,
          downloadThroughput: -1,
          uploadThroughput: -1,
        },
      );
    } catch (error) {
      console.warn("FaultLab could not reset network conditions", error);
    }
    try {
      await chrome.debugger.detach({ tabId });
    } catch (error) {
      console.warn("FaultLab could not detach from the selected tab", error);
    }
  }

  private async handleRequest(
    tabId: number,
    event: RequestPausedEvent,
  ): Promise<void> {
    if (tabId !== this.attachedTabId) return;

    try {
      const graphqlOperationName = getGraphqlOperationName(
        event.request.postData,
      );
      const endpoint = normalizeEndpoint(event.request.url);
      const recordedId = `${tabId}:${event.requestId}`;
      if (this.recording && !this.recordedRequestIds.has(recordedId)) {
        this.recordedRequestIds.add(recordedId);
        this.recordedRequests.push({
          id: recordedId,
          url: event.request.url,
          method: event.request.method.toUpperCase(),
          resourceType: event.resourceType?.toLowerCase(),
          graphqlOperationName,
        });
        if (this.recordedRequests.length > MAX_RECORDED_REQUESTS) {
          const removed = this.recordedRequests.shift();
          if (removed) this.recordedRequestIds.delete(removed.id);
        }
      }
      if (endpoint) this.observedUrls.add(endpoint);
      if (graphqlOperationName) {
        this.observedGraphqlOperations.add(graphqlOperationName);
      }

      if (event.responseStatusCode != null) {
        await this.handleResponse(tabId, event, graphqlOperationName);
        return;
      }

      const rule = this.rules.find(
        (candidate) =>
          candidate.action.type !== "throttle" &&
          candidate.action.type !== "mutate" &&
          this.hasRemainingApplications(candidate) &&
          matchesRule(candidate, {
            url: event.request.url,
            method: event.request.method,
            resourceType: event.resourceType?.toLowerCase(),
            graphqlOperationName,
          }),
      );

      if (!rule || !shouldApply(rule.action.probability)) {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId: event.requestId,
        });
        return;
      }

      if (rule.action.type === "error") {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
          requestId: event.requestId,
          responseCode: rule.action.status,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
          ],
          body: btoa(JSON.stringify({ error: "Fault injected by FaultLab" })),
        });
        this.recordApplication(rule);
        this.recordFaultInjection(tabId, event, rule, rule.action.status);
        return;
      }

      if (rule.action.type === "offline") {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "InternetDisconnected",
        });
        this.recordApplication(rule);
        this.recordFaultInjection(tabId, event, rule);
        return;
      }

      if (rule.action.type === "throttle") {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId: event.requestId,
        });
        return;
      }

      if (rule.action.type === "timeout") {
        const timeout = setTimeout(() => {
          this.pendingTimeouts.delete(timeout);
          if (this.attachedTabId !== tabId) return;
          void chrome.debugger
            .sendCommand({ tabId }, "Fetch.failRequest", {
              requestId: event.requestId,
              errorReason: "TimedOut",
            })
            .then(() => this.recordFaultInjection(tabId, event, rule))
            .catch((error) =>
              console.warn("FaultLab could not time out request", error),
            );
        }, Math.max(100, rule.action.timeoutMs));
        this.recordApplication(rule);
        this.pendingTimeouts.add(timeout);
        return;
      }

      if (rule.action.type !== "delay") {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", {
          requestId: event.requestId,
        });
        return;
      }

      const timeout = setTimeout(
        () => {
          this.pendingTimeouts.delete(timeout);
          if (this.attachedTabId !== tabId) return;
          void chrome.debugger
            .sendCommand({ tabId }, "Fetch.continueRequest", {
              requestId: event.requestId,
            })
            .catch((error) =>
              console.warn(
                "FaultLab could not continue delayed request",
                error,
              ),
            );
        },
        Math.max(0, rule.action.delayMs),
      );
      this.recordApplication(rule);
      this.recordFaultInjection(tabId, event, rule);
      this.pendingTimeouts.add(timeout);
    } catch (error) {
      console.warn("FaultLab could not handle intercepted request", error);
      await this.continuePausedRequest(
        tabId,
        event,
        event.responseStatusCode != null,
      );
    }
  }

  private async handleResponse(
    tabId: number,
    event: RequestPausedEvent,
    graphqlOperationName = getGraphqlOperationName(event.request.postData),
  ): Promise<void> {
    const continueResponse = () =>
      this.continuePausedRequest(tabId, event, true);
    const rule = this.rules.find(
      (candidate) =>
        candidate.action.type === "mutate" &&
        this.hasRemainingApplications(candidate) &&
        matchesRule(candidate, {
          url: event.request.url,
          method: event.request.method,
          resourceType: event.resourceType?.toLowerCase(),
          graphqlOperationName,
        }),
    );

    if (
      !rule ||
      rule.action.type !== "mutate" ||
      !shouldApply(rule.action.probability)
    ) {
      await continueResponse();
      return;
    }

    let responseBody: string;
    try {
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        "Fetch.getResponseBody",
        { requestId: event.requestId },
      )) as { body: string; base64Encoded?: boolean };
      responseBody = result.base64Encoded
        ? decodeBase64Utf8(result.body)
        : result.body;
    } catch (error) {
      console.warn("FaultLab could not read the response body", error);
      await continueResponse();
      return;
    }

    if (
      new TextEncoder().encode(responseBody).byteLength >
      MAX_MUTATION_BODY_BYTES
    ) {
      console.warn("FaultLab skipped mutation for a response larger than 5 MB");
      await continueResponse();
      return;
    }

    for (const path of collectJsonPaths(responseBody)) {
      if (this.observedJsonPaths.size >= 2000) break;
      this.observedJsonPaths.add(path);
    }

    const mutatedBody = applyJsonMutations(responseBody, rule.action.mutations);
    if (mutatedBody === responseBody) {
      await continueResponse();
      return;
    }

    try {
      await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: event.responseStatusCode,
        responsePhrase: event.responsePhrase,
        responseHeaders: responseHeadersForBody(event.responseHeaders),
        body: encodeBase64Utf8(mutatedBody),
      });
      this.recordApplication(rule);
      this.recordFaultInjection(tabId, event, rule);
    } catch (error) {
      console.warn("FaultLab could not fulfill the mutated response", error);
      await continueResponse();
    }
  }

  private clearPendingTimeouts(): void {
    for (const timeout of this.pendingTimeouts) clearTimeout(timeout);
    this.pendingTimeouts.clear();
  }

  private async continuePausedRequest(
    tabId: number,
    event: RequestPausedEvent,
    responseStage: boolean,
  ): Promise<void> {
    try {
      await chrome.debugger.sendCommand(
        { tabId },
        responseStage ? "Fetch.continueResponse" : "Fetch.continueRequest",
        { requestId: event.requestId },
      );
    } catch (error) {
      console.warn("FaultLab could not continue the paused request", error);
    }
  }

  private handleConsoleIssue(
    tabId: number,
    params: Record<string, unknown>,
  ): void {
    if (params.type !== "error") return;
    const args = Array.isArray(params.args) ? params.args : [];
    const message = args
      .map((argument) => {
        if (!argument || typeof argument !== "object") return "";
        const value = argument as { description?: unknown; value?: unknown };
        if (typeof value.description === "string") return value.description;
        return typeof value.value === "string" ? value.value : "";
      })
      .filter(Boolean)
      .join(" ");
    this.recordDetectedIssue(tabId, {
      type: "console",
      message: message || "Console error",
      source: this.stackSource(params.stackTrace),
    });
  }

  private handleRuntimeIssue(
    tabId: number,
    params: Record<string, unknown>,
  ): void {
    const details = (params.exceptionDetails ?? {}) as Record<string, unknown>;
    const exception = (details.exception ?? {}) as Record<string, unknown>;
    const message =
      (typeof details.text === "string" && details.text) ||
      (typeof exception.description === "string" && exception.description) ||
      "Runtime exception";
    this.recordDetectedIssue(tabId, {
      type: "runtime",
      message,
      source: typeof details.url === "string" ? details.url : undefined,
    });
  }

  private handleNetworkIssue(
    tabId: number,
    params: Record<string, unknown>,
  ): void {
    const errorText =
      typeof params.errorText === "string"
        ? params.errorText
        : "Unknown network error";
    const requestId =
      typeof params.requestId === "string" ? params.requestId : undefined;
    this.recordDetectedIssue(tabId, {
      type: "network",
      message: `Network request failed: ${errorText}`,
      source: requestId ? `request ${requestId}` : undefined,
    });
  }

  private stackSource(stackTrace: unknown): string | undefined {
    const trace = stackTrace as
      | { callFrames?: Array<{ url?: unknown }> }
      | undefined;
    const url = trace?.callFrames?.[0]?.url;
    return typeof url === "string" && url ? url : undefined;
  }

  private recordDetectedIssue(
    tabId: number,
    issue: Omit<DetectedIssue, "id" | "timestamp" | "tabId">,
  ): void {
    if (!this.monitoring || this.attachedTabId !== tabId) return;
    this.detectedIssues.push(
      this.withCorrelation({
        ...issue,
        id: `issue-${crypto.randomUUID()}`,
        timestamp: Date.now(),
        tabId,
      }),
    );
    if (this.detectedIssues.length > MAX_DETECTED_ISSUES) {
      this.detectedIssues.shift();
    }
  }

  private recordFaultInjection(
    tabId: number,
    event: RequestPausedEvent,
    rule: FaultRule,
    status?: number,
  ): void {
    if (!this.monitoring) return;
    this.faultInjections.push({
      id: `injection-${crypto.randomUUID()}`,
      timestamp: Date.now(),
      tabId,
      requestId: event.networkId ?? event.requestId,
      url: event.request.url,
      method: event.request.method.toUpperCase(),
      scenarioId: this.scenarioId,
      ruleId: rule.id,
      action: rule.action.type,
      ...(status === undefined ? {} : { status }),
    });
    if (this.faultInjections.length > MAX_DETECTED_ISSUES) {
      this.faultInjections.shift();
    }
  }

  private withCorrelation(issue: DetectedIssue): DetectedIssue {
    const explicit = issue.requestId
      ? this.faultInjections.find(
          (injection) => injection.requestId === issue.requestId,
        )
      : undefined;
    const issueOrigin = issue.url ? this.originOf(issue.url) : undefined;
    const related =
      explicit ??
      [...this.faultInjections].reverse().find((injection) => {
        const withinWindow =
          Math.abs(injection.timestamp - issue.timestamp) <= 10000;
        const sameOrigin =
          issueOrigin === undefined ||
          this.originOf(injection.url) === issueOrigin;
        return withinWindow && sameOrigin;
      });
    if (!related) return issue;
    return {
      ...issue,
      injectionId: related.id,
      scenarioId: related.scenarioId,
      ruleId: related.ruleId,
      requestId: issue.requestId ?? related.requestId,
    };
  }

  private originOf(value: string): string | undefined {
    try {
      return new URL(value).origin;
    } catch {
      return undefined;
    }
  }

  private hasRemainingApplications(rule: FaultRule): boolean {
    return (
      rule.maxApplications === undefined ||
      (this.applicationCounts.get(rule.id) ?? 0) < rule.maxApplications
    );
  }

  private recordApplication(rule: FaultRule): void {
    if (rule.maxApplications === undefined) return;
    this.applicationCounts.set(
      rule.id,
      (this.applicationCounts.get(rule.id) ?? 0) + 1,
    );
  }
}

function responseHeadersForBody(
  headers: ResponseHeader[] | undefined,
): ResponseHeader[] {
  const filtered = (headers ?? []).filter(
    ({ name }) =>
      !["content-encoding", "content-length", "transfer-encoding"].includes(
        name.toLowerCase(),
      ),
  );
  if (!filtered.some(({ name }) => name.toLowerCase() === "content-type")) {
    filtered.push({ name: "Content-Type", value: "application/json" });
  }
  return filtered;
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function normalizeEndpoint(value: string): string | undefined {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value || undefined;
  }
}
