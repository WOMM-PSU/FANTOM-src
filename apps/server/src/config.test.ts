import { describe, expect, it } from "vitest";
import { loadServerRuntimeConfig } from "./config";

describe("loadServerRuntimeConfig", () => {
  it("uses the predictable default port when PORT is unset or zero", () => {
    expect(loadServerRuntimeConfig({}).port).toBe(4000);
    expect(loadServerRuntimeConfig({ PORT: "0" }).port).toBe(4000);
  });

  it("prefers FANTOM_PORT over PORT", () => {
    expect(
      loadServerRuntimeConfig({
        PORT: "7777",
        FANTOM_PORT: "5000",
      }).port,
    ).toBe(5000);
  });

  it("rejects malformed numeric settings", () => {
    expect(() =>
      loadServerRuntimeConfig({ COUNTDOWN_MS: "-1" }),
    ).toThrow(/COUNTDOWN_MS/);
    expect(() =>
      loadServerRuntimeConfig({ MAX_PLAYERS: "99" }),
    ).toThrow(/MAX_PLAYERS/);
  });
});
