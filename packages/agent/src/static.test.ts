import { describe, expect, it } from "vitest";
import { serveStatic } from "./static.js";

describe("serveStatic with hostile paths", () => {
  it("answers 400 to a broken percent escape instead of throwing", async () => {
    const response = await serveStatic(new Request("http://x/%E0%A4%A"));
    expect(response?.status).toBe(400);
  });
  it("still refuses to leave the web folder", async () => {
    const response = await serveStatic(new Request("http://x/..%2f..%2fpackage.json"));
    expect(response?.status).toBe(404);
  });
});
