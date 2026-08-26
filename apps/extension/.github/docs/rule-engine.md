# Rule Engine

The rule engine is browser-independent. A rule answers:

1. does this request match?
2. should the action be applied for this probability?
3. what controlled failure should be returned?

- optional `maxApplications` from 1 to 1000, reset when the scenario is applied;

- `id`;
- `name`;

## Current Actions

- `error`: fulfill the request with a selected HTTP status;
- `delay`: hold a matched request before continuing it;
- `timeout`: fail a matched request with `TimedOut` after a bounded interval;
- `offline`: fail a matched request with `InternetDisconnected`;
- `throttle`: configure tab-level latency and upload/download bandwidth through Chrome Network emulation;
- `mutate`: modify a matched JSON response during the Fetch Response stage.

The first four actions are MVP 0.1 behavior. `mutate` is the MVP 0.2 response action. `timeout` is a
request-stage action in the current `0.2.0` development line.

## JSON Mutation

`JsonMutation` uses JSON Pointer paths. The supported MVP operations are:

| Operation       | Effect                                                        |
| --------------- | ------------------------------------------------------------- |
| `remove`        | Remove an object field or array item.                         |
| `nullify`       | Set an existing value to `null`.                              |
| `empty_array`   | Replace an existing value with `[]`.                          |
| `type_mismatch` | Replace an existing value with `""`, `0`, `false`, or `null`. |

Example:

```json
{
  "type": "mutate",
  "probability": 0.7,
  "mutations": [
    { "op": "remove", "path": "/user/id" },
    { "op": "type_mismatch", "path": "/user/age", "targetType": "string" }
  ]
}
```

The builder should validate:

- allowed HTTP statuses;
- delay and latency as non-negative bounded milliseconds;
- bandwidth as positive bounded KB/s;
- non-empty rule names;
- JSON Pointer paths beginning with `/`, or the explicitly supported root path;
- `type_mismatch.targetType` as `string`, `number`, `boolean`, or `null`.

Only one tab-level `throttle` rule should be active in a scenario. Its probability controls whether the tab configuration is enabled when the scenario is activated; it is not evaluated independently for every request.

## Rule Ordering

Request-stage actions are evaluated in scenario order. The first enabled rule that matches owns the request;
its probability is then evaluated, and a probability miss continues that request without falling through to
a later rule. A mutation rule is evaluated at Response stage and does not also act at Request stage. If no
rule applies, the adapter continues the request or response unchanged. Only the first eligible throttle rule
configures tab-level emulation.

The adapter uses best-effort fail-open continuation for unexpected request and response handling errors.
Restricted pages, detached tabs, or a failed Chrome Debugger command can still prevent continuation.

## Deferred Engine Features

Response schema matching, arbitrary request-body matching, header matching, regex, JSONPath, rule dependencies, sequences, scheduling, and repeat counters belong to later builder or detection work. They should not be added implicitly to MVP 0.2.
