export type JsonMutation =
  | { op: "remove"; path: string }
  | { op: "nullify"; path: string }
  | { op: "empty_array"; path: string }
  | {
      op: "type_mismatch";
      path: string;
      targetType: "string" | "number" | "boolean" | "null";
    };

type MutationResult = { applied: boolean; value: unknown };

export function applyJsonMutations(
  rawBody: string,
  mutations: JsonMutation[],
): string {
  let value: unknown;

  try {
    value = JSON.parse(rawBody);
  } catch {
    return rawBody;
  }

  for (const mutation of mutations) {
    const result = applyJsonMutation(value, mutation);
    if (result.applied) value = result.value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return rawBody;
  }
}

function applyJsonMutation(
  value: unknown,
  mutation: JsonMutation,
): MutationResult {
  const path = parseJsonPointer(mutation.path);
  if (path == null) return { applied: false, value };

  if (path.length === 0) {
    return mutation.op === "remove"
      ? { applied: false, value }
      : { applied: true, value: replacementValue(mutation) };
  }

  return applyAtPath(value, path, mutation);
}

function applyAtPath(
  value: unknown,
  path: string[],
  mutation: JsonMutation,
): MutationResult {
  const [key, ...rest] = path;
  if (key === "*") {
    if (Array.isArray(value)) {
      let applied = false;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const result = applyChildMutation(value, String(index), rest, mutation);
        applied ||= result.applied;
      }
      return { applied, value };
    }
    if (isObject(value)) {
      let applied = false;
      for (const childKey of Object.keys(value)) {
        const result = applyChildMutation(value, childKey, rest, mutation);
        applied ||= result.applied;
      }
      return { applied, value };
    }
    return { applied: false, value };
  }

  if (!hasChild(value, key)) return { applied: false, value };
  return applyChildMutation(value, key, rest, mutation);
}

function applyChildMutation(
  parent: unknown,
  key: string,
  rest: string[],
  mutation: JsonMutation,
): MutationResult {
  if (rest.length > 0) {
    const child = getChild(parent, key);
    const result = applyAtPath(child, rest, mutation);
    if (result.applied) setChild(parent, key, result.value);
    return { applied: result.applied, value: parent };
  }

  if (mutation.op === "remove") {
    removeChild(parent, key);
  } else {
    setChild(parent, key, replacementValue(mutation));
  }
  return { applied: true, value: parent };
}

function parseJsonPointer(path: string): string[] | null {
  if (path === "") return [];
  if (!path.startsWith("/")) return null;

  const tokens = path.slice(1).split("/");
  if (tokens.some((token) => /~[^01]/.test(token))) return null;
  return tokens.map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function hasChild(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    const index = parseArrayIndex(key);
    return index != null && index < value.length;
  }
  return (
    typeof value === "object" &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

function getChild(value: unknown, key: string): unknown {
  return Array.isArray(value)
    ? value[parseArrayIndex(key) as number]
    : (value as Record<string, unknown>)[key];
}

function setChild(value: unknown, key: string, child: unknown): void {
  if (Array.isArray(value)) {
    value[parseArrayIndex(key) as number] = child;
  } else {
    (value as Record<string, unknown>)[key] = child;
  }
}

function removeChild(value: unknown, key: string): void {
  if (Array.isArray(value)) {
    value.splice(parseArrayIndex(key) as number, 1);
  } else {
    delete (value as Record<string, unknown>)[key];
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArrayIndex(key: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(key)) return null;
  const index = Number(key);
  return Number.isSafeInteger(index) ? index : null;
}

function replacementValue(
  mutation: Exclude<JsonMutation, { op: "remove" }>,
): unknown {
  if (mutation.op === "nullify") return null;
  if (mutation.op === "empty_array") return [];
  return valueForType(mutation.targetType);
}

export function collectJsonPaths(rawBody: string, maxPaths = 500): string[] {
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return [];
  }

  const paths = new Set<string>();
  collectPaths(value, "", paths, maxPaths);
  return [...paths].sort();
}

function collectPaths(
  value: unknown,
  path: string,
  paths: Set<string>,
  maxPaths: number,
): void {
  if (paths.size >= maxPaths || value == null || typeof value !== "object")
    return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    const wildcardPath = `${path}/*`;
    paths.add(wildcardPath);
    collectPaths(value[0], wildcardPath, paths, maxPaths);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (paths.size >= maxPaths) return;
    const childPath = `${path}/${escapeJsonPointerToken(key)}`;
    paths.add(childPath);
    collectPaths(child, childPath, paths, maxPaths);
  }
}

function escapeJsonPointerToken(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function valueForType(
  targetType: "string" | "number" | "boolean" | "null",
): unknown {
  if (targetType === "string") return "";
  if (targetType === "number") return 0;
  if (targetType === "boolean") return false;
  return null;
}
