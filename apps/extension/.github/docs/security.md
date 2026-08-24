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

Authorization, Cookie, email, and token redaction is not currently implemented. Do not add export, AI, or
server integrations until URL/query redaction, explicit retention controls, and response-body handling are
designed and tested.

## Error Monitoring

When monitoring is active, FaultLab reads console and debugger error metadata for the selected tab and
receives runtime error messages from its content script. Issue messages, source URLs, and timestamps are
stored locally under `faultlab.runtime`; request bodies and form values are not collected by the error
monitor. Monitoring is disabled until the user starts it and can be stopped or cleared from the Side Panel.

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
