import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubSessionResponse = () =>
  vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ ok: true, data: { signedUrl: "https://voice.test/signed", voiceToolToken: "voice_tok_1" } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );

describe("createVoiceSession forwards visitor details to the worker", () => {
  it("includes visitorName and visitorEmail in the session request body", async () => {
    const fetchSpy = stubSessionResponse();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await api.createVoiceSession("public_demo_123", { name: "Ayesha Khan", email: "ayesha@mail.test" });

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/voice/session");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      sessionId: "public_demo_123",
      visitorName: "Ayesha Khan",
      visitorEmail: "ayesha@mail.test"
    });
  });

  it("omits visitor fields when none are supplied", async () => {
    const fetchSpy = stubSessionResponse();
    vi.stubGlobal("fetch", fetchSpy);

    await api.createVoiceSession("legacy_session");

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ sessionId: "legacy_session" });
  });
});
