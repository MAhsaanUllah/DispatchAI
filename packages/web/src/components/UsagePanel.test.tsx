import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UsagePanel, usd } from "./UsagePanel.js";

describe("usage money", () => {
  it("shows small amounts with enough digits to mean something", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(0.004)).toBe("under $0.01");
    expect(usd(0.6)).toBe("$0.600");
    expect(usd(12.3456)).toBe("$12.35");
  });
});

describe("usage panel", () => {
  it("starts by saying it is reading, and offers a refresh", () => {
    const html = renderToStaticMarkup(<UsagePanel />);
    expect(html).toContain("Usage and cost");
    expect(html).toContain("Reading usage");
    expect(html).toContain("Refresh");
  });
});
