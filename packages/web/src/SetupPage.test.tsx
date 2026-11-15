import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SetupPage } from "./SetupPage.js";

const render = (hash: string) => {
  vi.stubGlobal("window", { location: { hash } });
  return renderToStaticMarkup(<SetupPage onDone={() => {}} />);
};

describe("SetupPage setup code", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is prefilled from the #setup= link the desktop app opens", () => {
    expect(render("#setup=ab12-CD34")).toContain('value="ab12-CD34"');
  });

  it("stays empty without a link", () => {
    expect(render("")).not.toMatch(/aria-label="Setup code"[^>]*value="[^"]/);
  });
});
