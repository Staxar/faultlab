import type { RecordedEvent, RuntimeMessage } from "@faultlab/core";

let lastUrl = location.href;
type RecordedEventInput =
	| { type: "navigation"; url: string }
	| { type: "interaction"; action: "click" | "change"; target: string };

function sendEvent(event: RecordedEventInput): void {
	const message: RuntimeMessage = {
		type: "RECORD_EVENT",
		event: {
			...event,
			id: `event-${crypto.randomUUID()}`,
			timestamp: Date.now(),
		} as RecordedEvent,
	};
	void chrome.runtime.sendMessage(message).catch(() => undefined);
}

function describeTarget(element: HTMLElement): string {
	const testId = element.getAttribute("data-testid");
	if (testId) return `[data-testid="${testId.slice(0, 80)}"]`;
	const id = element.id.trim();
	if (id) return `#${id.slice(0, 80)}`;
	const label = element.getAttribute("aria-label")?.trim();
	if (label) return `${element.tagName.toLowerCase()}[aria-label="${label.slice(0, 80)}"]`;
	const classes = Array.from(element.classList).filter(Boolean).slice(0, 3);
	return `${element.tagName.toLowerCase()}${classes.map((value) => `.${value}`).join("")}`;
}

function recordNavigation(): void {
	if (location.href === lastUrl) return;
	lastUrl = location.href;
	sendEvent({ type: "navigation", url: location.href });
}

sendEvent({ type: "navigation", url: location.href });
document.addEventListener(
	"click",
	(event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		const interactive = target.closest(
			"a,button,input,select,textarea,[role=button],[data-testid]",
		);
		if (!(interactive instanceof HTMLElement)) return;
		sendEvent({ type: "interaction", action: "click", target: describeTarget(interactive) });
	},
	true,
);
document.addEventListener(
	"change",
	(event) => {
		const target = event.target;
		if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
		sendEvent({ type: "interaction", action: "change", target: describeTarget(target) });
	},
	true,
);
window.setInterval(recordNavigation, 1000);
