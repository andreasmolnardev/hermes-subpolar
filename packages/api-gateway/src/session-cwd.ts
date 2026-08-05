export type GatewaySessionCwdStore = {
  load(sessionId: string): string | undefined | Promise<string | undefined>;
  save(sessionId: string, cwd: string): void | Promise<void>;
  clear?(sessionId?: string): void | Promise<void>;
};

export function validateSessionCwd(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Gateway cwd must be a string");
  const cwd = value.trim();
  if (cwd.length === 0) throw new TypeError("Gateway cwd must be non-empty");
  if (cwd.includes("\u0000")) throw new TypeError("Gateway cwd must not contain NUL");
  if (!(cwd.startsWith("/") || /^[A-Za-z]:[\\/]/.test(cwd))) {
    throw new TypeError("Gateway cwd must be absolute");
  }
  if (/(^|[\\/])\.\.(?=([\\/]|$))/.test(cwd)) {
    throw new TypeError("Gateway cwd must not contain traversal segments");
  }
  return cwd;
}

export class MemoryGatewaySessionCwdStore implements GatewaySessionCwdStore {
  private readonly cwds = new Map<string, string>();

  load(sessionId: string): string | undefined {
    return this.cwds.get(sessionId);
  }

  save(sessionId: string, cwd: string): void {
    this.cwds.set(sessionId, cwd);
  }

  clear(sessionId?: string): void {
    if (sessionId === undefined) this.cwds.clear();
    else this.cwds.delete(sessionId);
  }
}
