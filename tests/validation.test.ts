import { afterEach, describe, expect, it } from "vitest";
import { allowedMachines, isAllowedMachine } from "@/lib/validation";

const originalAllowedMachines = process.env.ALLOWED_MACHINES;

afterEach(() => {
  process.env.ALLOWED_MACHINES = originalAllowedMachines;
});

describe("machine allowlist", () => {
  it("allows titan051 through titan100 by default", () => {
    delete process.env.ALLOWED_MACHINES;

    expect(isAllowedMachine("titan051")).toBe(true);
    expect(isAllowedMachine("titan097")).toBe(true);
    expect(isAllowedMachine("titan100")).toBe(true);
    expect(isAllowedMachine("titan050")).toBe(false);
    expect(isAllowedMachine("titan101")).toBe(false);
  });

  it("keeps the default Titan range when ALLOWED_MACHINES adds extra machines", () => {
    process.env.ALLOWED_MACHINES = "extra-node,titan200";

    const machines = allowedMachines();

    expect(machines.has("titan097")).toBe(true);
    expect(machines.has("extra-node")).toBe(true);
    expect(machines.has("titan200")).toBe(true);
  });
});
