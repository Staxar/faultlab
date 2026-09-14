# FaultLab Privacy Policy

Last updated: 2026-09-14

FaultLab is a Chrome extension for testing web applications with controlled network and JSON failure
injection. FaultLab is local-first: it does not require an account, does not operate a FaultLab backend,
and does not send extension data to FaultLab or to an analytics provider.

## Data processed

FaultLab processes the following data only in the browser where it is installed:

- scenario configuration and runtime settings;
- request URLs, methods, resource types, and detected GraphQL operation names while recording or
  discovering requests;
- navigation URLs and bounded DOM target descriptions for the selected tab while recording;
- console, runtime, unhandled Promise, and failed-network issue metadata while error monitoring is active;
- investigation note text and screenshots explicitly captured or saved by the user;
- matched response bodies temporarily in memory when the user activates JSON response mutation.

FaultLab does not intentionally persist request bodies, form values, cookies, passwords, tokens, or matched
response bodies. URLs, source paths, error messages, and screenshots may still contain sensitive data
provided by the application under test.

## Storage and retention

Runtime state is stored in Chrome local storage under the `faultlab.runtime` key. Recorder requests and
events, detected issues, and fault-injection metadata are bounded. Investigation notes are limited to 20
entries, note text is limited to 2,000 characters, and screenshots are limited to approximately 800 KB
each.

You can clear recorder data, detected issues, notes, and screenshots from the Side Panel. Removing the
extension removes its local storage.

## Permissions

- `activeTab`: allows user-invoked screenshot capture for the current tab.
- `debugger`: attaches the Chrome Debugger Protocol to the selected tab so FaultLab can pause requests,
  inject failures, read matched response bodies for JSON mutation, throttle traffic, and observe selected
  error events.
- `storage`: stores scenarios and bounded investigation data locally.
- `sidePanel`: provides the FaultLab Side Panel.
- `tabs`: identifies the selected tab and its window for debugger and screenshot operations.
- HTTP(S) content scripts: record navigation and interaction milestones and report runtime errors only while
  the corresponding local recorder or error-monitoring session is active.

FaultLab does not sell, rent, or share this data with third parties.

## Reports and screenshots

Markdown and PDF reports are generated locally. Markdown export applies basic token and query redaction,
but exported reports and screenshots may still contain sensitive application data. Review files before
sharing them.

## Contact

For privacy questions or requests, open an issue in the FaultLab repository:

https://github.com/Staxar/faultlab/issues
