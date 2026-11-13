import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BackupPanel } from "./BackupPanel.js";

describe("Backup panel", () => {
  const html = renderToStaticMarkup(<BackupPanel />);

  it("tells the owner the file is private and how to restore it", () => {
    expect(html).toContain("Keep the file private");
    expect(html).toContain("plugin keys");
    expect(html).toContain("restore-backup.ts");
    expect(html).toContain("--force");
    expect(html).toContain("never deleted");
  });

  it("offers the download and says when nothing was downloaded yet", () => {
    expect(html).toContain("Download backup");
    expect(html).toContain("No backup downloaded from this browser yet.");
  });
});
