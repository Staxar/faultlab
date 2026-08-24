# Rule Engine

The rule engine is browser-independent. A rule answers:

1. does this request match?
2. should the action be applied for this probability?
3. what controlled failure should be returned?

## Current Rule Shape

`FaultRule` contains:

- `id`;
- `name`;
- `enabled`;
- `matcher`;
- `action`.

The current matcher supports a literal `urlIncludes` substring, HTTP `methods`, Chrome `resourceTypes`, and an optional `graphqlOperationName`. The operation name is extracted from the GraphQL request body. It does not inspect headers, request bodies as arbitrary match data, response statuses, or regular expressions.

## Current Actions

- `error`: fulfill the request with a selected HTTP status;
- `delay`: hold a matched request before continuing it;
- `offline`: fail a matched request with `InternetDisconnected`;
- `throttle`: configure tab-level latency and upload/download bandwidth through Chrome Network emulation;
- `mutate`: modify a matched JSON response during the Fetch Response stage.

The first four actions are MVP 0.1 behavior. `mutate` is the MVP 0.2 response action.

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

Mutations run in array order. A missing path leaves the document unchanged for that operation. JSON Pointer escaping uses `~1` for `/` and `~0` for `~`. FaultLab additionally supports `*` as a wildcard token for all children of an object or array, which lets one rule mutate every item in a response collection. Invalid JSON, unreadable bodies, binary/non-JSON bodies, and bodies above the adapter limit pass through unchanged.

## Probability and Validation

Per-request probability is represented as a number from 0 to 1 in core and displayed as 0% to 100% in the UI. Values are clamped by the existing probability helper; builder input should reject out-of-range values before saving.

The builder should validate:

- allowed HTTP statuses;
- delay and latency as non-negative bounded milliseconds;
- bandwidth as positive bounded KB/s;
- non-empty rule names;
- JSON Pointer paths beginning with `/`, or the explicitly supported root path;
- `type_mismatch.targetType` as `string`, `number`, `boolean`, or `null`.

Only one tab-level `throttle` rule should be active in a scenario. Its probability controls whether the tab configuration is enabled when the scenario is activated; it is not evaluated independently for every request.

## Rule Ordering

Request-stage actions are evaluated in scenario order. The first enabled rule that matches and passes its probability owns the request. A mutation rule is evaluated at Response stage and does not also act at Request stage. If no rule applies, the adapter continues the request or response unchanged.

## Deferred Engine Features

Response schema matching, arbitrary request-body matching, header matching, regex, JSONPath, rule dependencies, sequences, scheduling, and repeat counters belong to later builder or detection work. They should not be added implicitly to MVP 0.2.
