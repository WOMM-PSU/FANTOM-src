import { describe, expect, it } from "vitest";
import { DEFAULT_MATCH_CONFIG, parseMatchConfig } from "./config";
import {
  MAX_MATCH_DURATION_SECONDS,
  MIN_MATCH_DURATION_SECONDS,
} from "./constants";
import {
  createMatchRequestSchema,
  displayNameSchema,
  joinCodeSchema,
} from "./protocol";

describe("match configuration", () => {
  it("accepts the default configuration", () => {
    expect(parseMatchConfig(DEFAULT_MATCH_CONFIG)).toEqual(
      DEFAULT_MATCH_CONFIG,
    );
  });

  it("rejects durations outside shared bounds", () => {
    expect(
      parseMatchConfig({
        mode: "ffa",
        durationSeconds: MIN_MATCH_DURATION_SECONDS - 1,
        allowManualTargeting: false,
      }),
    ).toBeNull();
    expect(
      parseMatchConfig({
        mode: "ffa",
        durationSeconds: MAX_MATCH_DURATION_SECONDS + 1,
        allowManualTargeting: false,
      }),
    ).toBeNull();
    expect(
      parseMatchConfig({
        mode: "ffa",
        durationSeconds: 120.5,
        allowManualTargeting: false,
      }),
    ).toBeNull();
  });

  it("rejects unknown modes and strips unknown fields", () => {
    expect(
      parseMatchConfig({
        mode: "battle-royale",
        durationSeconds: 300,
        allowManualTargeting: false,
      }),
    ).toBeNull();
    expect(
      parseMatchConfig({
        mode: "ffa",
        durationSeconds: 300,
        allowManualTargeting: true,
        injected: true,
      }),
    ).toEqual({
      mode: "ffa",
      durationSeconds: 300,
      allowManualTargeting: true,
    });
  });
});

describe("HTTP request schemas", () => {
  it("normalizes display names before validation", () => {
    expect(displayNameSchema.parse("  Nova  ")).toBe("Nova");
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  it("normalizes join codes before validation", () => {
    expect(joinCodeSchema.parse(" ab-cd ")).toBe("ABCD");
    expect(joinCodeSchema.safeParse("ABC").success).toBe(false);
  });

  it("requires a request id and display name", () => {
    expect(
      createMatchRequestSchema.safeParse({
        requestId: "request-123",
        displayName: "Nova",
      }).success,
    ).toBe(true);
    expect(
      createMatchRequestSchema.safeParse({ displayName: "Nova" }).success,
    ).toBe(false);
  });
});
