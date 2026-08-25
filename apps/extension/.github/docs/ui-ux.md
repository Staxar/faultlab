# UI/UX

## Primary Surface

The Chrome Side Panel remains the main interface because it stays visible while the user switches tabs. MVP 0.1 is intentionally a one-click preset experience. MVP 0.2 adds the `Bad Data` preset without requiring a new editor.

## MVP 0.3 Configuration Flow

The first builder slice is a compact preset detail view inside the Side Panel:

1. choose a preset;
2. open its settings with the configure button;
3. edit the target scope and action parameters;
4. validate the form in the background service worker;
5. save, cancel, or reset defaults;
6. activate the scenario explicitly.

Implemented controls include scenario name and description, literal URL substring, HTTP methods, resource types, probability, HTTP status, delay, tab-level bandwidth, and JSON mutation operations.

The current configuration view covers probability, URL substring, HTTP methods, resource types, status code, delay, latency, bandwidth, application limits, and the relevant JSON mutation fields. Keep advanced controls hidden until their action type is selected. Validation is currently returned as a global error message rather than field-level feedback.

## Safety States

- disable Save when a required value is invalid;
- effective matcher summaries and field-level validation remain planned;
- warn before activating an empty matcher that affects every supported request;
- show whether a setting applies per request or to the whole selected tab;
- show an adapter error when the selected page cannot be attached to Chrome Debugger;
- make `Reset defaults` available for built-in presets;
- require confirmation before deleting a custom scenario;
- surface activation and deactivation failures from the background.

## Simple Controls

Use a percentage slider or numeric input for probability, bounded numeric inputs for timing and bandwidth, checkboxes for methods and resource types, and a select for HTTP status or mutation operation. Avoid exposing regex, headers, transformers, overrides, schedules, or multi-tab controls in this MVP.

## Scenario List

The list should distinguish built-in presets from custom scenarios. Built-ins should be resettable and protected from destructive edits. Custom scenarios may be edited and deleted. Keep activation available directly from the list so the common flow remains:

Choose scenario -> review scope -> activate -> observe failures.

## Recorder Flow

The recorder is a compact workflow in the Side Panel:

1. start recording on the selected tab;
2. browse the application normally;
3. stop recording and review observed requests;
4. select one or more requests;
5. create a custom scenario from the selection;
6. configure or activate the generated scenario.

Recording must be visibly active, keep request URLs and selectors truncated in the list, and make the local-only behavior clear. Starting a recording disables an active chaos scenario so the observations represent normal application traffic. The timeline shows navigation, click, and form-change milestones without storing field values. The initial generated action is an 800 ms request delay and remains editable.

## Error Detection Flow

The error monitor is a separate Side Panel workflow:

1. start monitoring on the selected tab;
2. exercise the application normally;
3. review the latest errors grouped by source type;
4. clear the local issue list when starting a new investigation;
5. stop monitoring when the investigation is complete.

Monitoring must show an explicit active state and keep messages and sources truncated. It must not imply that issues are sent to a server or collected from other tabs.

## Error Observatory

Show repeated issues as one finding with an occurrence count and latest timestamp. When correlation is
available, show the scenario, rule action, and request context below the issue message. Keep the raw issue
list local and bounded; do not display request or response bodies in this view. A missing correlation must
be represented as missing context, not as a guessed scenario.

## Investigation Notes and Export

Allow the user to add a short note, optionally capture the visible selected tab, and review the evidence
before saving it. Keep note text and screenshot previews bounded so the panel remains usable. Markdown
export downloads a local report; PDF export opens a print-friendly report and relies on the browser's
`Save as PDF` action. Show a reminder that exported screenshots, URLs, source paths, and issue messages
may contain sensitive data.

## Local-First Behavior

Draft and saved configuration stays in Chrome local storage. The UI should never imply that scenarios are shared, synchronized, or active in every tab when the adapter only controls the selected tab.
