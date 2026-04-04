import { describe, it, expect, vi, afterEach } from "vitest";
import os from "node:os";
import { getMachineName } from "../../../src/utils/machine.js";

describe("getMachineName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a lowercase hostname", () => {
    const name = getMachineName();
    expect(name).toBe(name.toLowerCase());
  });

  it("strips .local suffix from hostname", () => {
    vi.spyOn(os, "hostname").mockReturnValue("MacBook-Pro.local");
    const name = getMachineName();
    expect(name).toBe("macbook-pro");
  });

  it("lowercases the hostname", () => {
    vi.spyOn(os, "hostname").mockReturnValue("MY-DESKTOP");
    const name = getMachineName();
    expect(name).toBe("my-desktop");
  });

  it("handles hostname without .local suffix", () => {
    vi.spyOn(os, "hostname").mockReturnValue("workstation");
    const name = getMachineName();
    expect(name).toBe("workstation");
  });

  it("only strips .local at the end, not in the middle", () => {
    vi.spyOn(os, "hostname").mockReturnValue("local-machine");
    const name = getMachineName();
    expect(name).toBe("local-machine");
  });

  it("handles hostname that is exactly '.local'", () => {
    vi.spyOn(os, "hostname").mockReturnValue(".local");
    const name = getMachineName();
    expect(name).toBe("");
  });

  it("handles hostname with multiple dots", () => {
    vi.spyOn(os, "hostname").mockReturnValue("host.subdomain.local");
    const name = getMachineName();
    expect(name).toBe("host.subdomain");
  });

  it("returns a string", () => {
    const name = getMachineName();
    expect(typeof name).toBe("string");
  });
});
