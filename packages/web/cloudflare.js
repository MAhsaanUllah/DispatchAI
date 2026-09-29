export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return Response.json(
        { error: "This public portfolio preview does not expose the local operations API." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    return env.ASSETS.fetch(request);
  }
};
