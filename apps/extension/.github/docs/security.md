# Security

## Principle

Everything Local By Default

No server communication required.

## Sensitive Data

Never store:

- passwords
- tokens
- sessions
- cookies

Without explicit permission.

## Current Local Data Surface

The recorder persists raw request and navigation URLs, and the error monitor persists issue messages,
source URLs, and timestamps under `faultlab.runtime`. These values can contain sensitive query strings or
application data. The recorder does not persist request bodies or form values. GraphQL request data and
matched JSON response bodies may be read transiently in memory when discovery or mutation is active.

Basic token and sensitive-query redaction is implemented for Markdown export, but it is not a complete
data-loss-prevention system. Do not add AI or server integrations until richer URL/query redaction,
explicit retention controls, and response-body handling are designed and tested.

## Error Monitoring

When monitoring is active, FaultLab reads console and debugger error metadata for the selected tab and
receives runtime error messages from its content script. Issue messages, source URLs, and timestamps are
stored locally under `faultlab.runtime`; request bodies and form values are not collected by the error
monitor. Monitoring is disabled until the user starts it and can be stopped or cleared from the Side Panel.

## Correlation

Error Observatory may associate an issue with request URL, scenario ID, rule ID, action, and timestamps.
This metadata remains local and is bounded with the issue list. Correlation never requires persisting a
request body or response body. URL/query redaction is required before any future export or external
integration.

Investigation notes are limited to 20 entries. Note text is limited to 2000 characters and screenshots are
stored as local JPEG data URLs up to 800 KB each. Markdown export applies basic query/token redaction;
PDF printing uses the local browser print dialog. Review exported files before sharing them because URLs,
issue messages, source paths, and screenshots may still contain sensitive application data.

## Sanitization

Authorization

↓

[REDACTED]

Cookie

↓

[REDACTED]

Email

↓

[REDACTED]

## Future AI Features

AI analysis must be:

- opt-in
- transparent
- sanitized
