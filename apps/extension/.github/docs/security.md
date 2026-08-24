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
