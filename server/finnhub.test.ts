import { describe, it, expect, beforeAll } from "vitest";
import { testFinnhubConnection } from "./finnhub";

describe("Finnhub API Integration", () => {
  it("should successfully connect to Finnhub API", async () => {
    const isConnected = await testFinnhubConnection();
    expect(isConnected).toBe(true);
  });
});
