import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PreCallForm, validateVisitorDetails } from "./PreCallForm.js";

const visibleText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("validateVisitorDetails: the pre-call form only starts a call with usable details", () => {
  it("accepts a trimmed name and a valid email", () => {
    expect(validateVisitorDetails("  Ayesha Khan ", "  ayesha@mail.test ")).toBeNull();
  });

  it("rejects a missing name", () => {
    expect(validateVisitorDetails("   ", "ayesha@mail.test")).toContain("name");
  });

  it("rejects a malformed email instead of routing the booking nowhere", () => {
    expect(validateVisitorDetails("Ayesha Khan", "not-an-email")).toContain("email");
    expect(validateVisitorDetails("Ayesha Khan", "")).toContain("email");
  });
});

describe("PreCallForm: collects visitor details before the voice call", () => {
  it("renders name and confirmation-email fields with a direct call action", () => {
    const html = renderToStaticMarkup(
      <PreCallForm isOpen onCancel={() => {}} onStart={() => {}} />
    );
    const text = visibleText(html);

    expect(html).toContain('name="visitorName"');
    expect(html).toContain('name="visitorEmail"');
    expect(html).toContain('type="email"');
    expect(text).toContain("Call now");
    expect(text).toContain("booking confirmation");
    expect(text).not.toContain("Submit");
  });

  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <PreCallForm isOpen={false} onCancel={() => {}} onStart={() => {}} />
    );
    expect(html).toBe("");
  });
});
