type Matcher = RegExp | ((error: unknown) => boolean);

function message(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function fail(detail: string): never {
  throw new Error(detail);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export const assert = {
  equal(actual: unknown, expected: unknown, label?: string): void {
    if (!Object.is(actual, expected)) fail(label ?? `Expected ${String(actual)} to equal ${String(expected)}`);
  },
  strictEqual(actual: unknown, expected: unknown): void {
    if (actual !== expected) fail(`Expected values to be strictly equal`);
  },
  deepEqual(actual: unknown, expected: unknown): void {
    const actualJson = JSON.stringify(stable(actual));
    const expectedJson = JSON.stringify(stable(expected));
    if (actualJson !== expectedJson) {
      fail(`Expected ${actualJson} to deeply equal ${expectedJson}`);
    }
  },
  ok(value: unknown, label?: string): void {
    if (!value) fail(label ?? "Expected a truthy value");
  },
  throws(operation: () => unknown, matcher?: Matcher): void {
    try {
      operation();
    } catch (error) {
      if (matcher instanceof RegExp && !matcher.test(message(error))) fail("Thrown error did not match");
      if (typeof matcher === "function" && !matcher(error)) fail("Thrown error did not match");
      return;
    }
    fail("Expected operation to throw");
  }
};
