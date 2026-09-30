import { handleDemoRequest, DemoAccess } from "./demo-auth.js";

export { DemoAccess };

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleDemoRequest(request, env);
    return env.ASSETS.fetch(request);
  }
};
