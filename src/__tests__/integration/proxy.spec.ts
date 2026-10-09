import { test, expect } from "@playwright/test";
//need to generate random IPs
import { randomUUID } from "crypto";

test.describe("Proxy tests", () => {
  test("Anonymous users must be denied from strict routes", async ({
    request,
  }) => {
    const headers = { "x-forwarded-for": `ip-${randomUUID()}` };
    const routes = ["/api/forecast", "/api/insights", "/api/onboarding"];

    for (const route of routes) {
      const response = await request.get(route, { headers });
      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Authentication required!");
    }
  });

  test("Anonymous user must be throttled on teaser route", async ({
    request,
  }) => {
    const headers = { "x-forwarded-for": `ip-${randomUUID()}` };
    const route = "/api/teaser";
    const ANONYMOUS_LIMIT = 3;

    for (let i = 0; i < ANONYMOUS_LIMIT; i++) {
      const response = await request.get(route, { headers });
      expect(response.status()).not.toBe(429);
    }

    const throttledResponse = await request.get(route, { headers });
    expect(throttledResponse.status()).toBe(429);
    const body = await throttledResponse.json();
    expect(body.error).toBe("Anonymous user throttled");
  });

  test("Free users are downgraded from insights", async ({ request }) => {
    const userId = randomUUID();
    const csrfReq = await request.get("/api/auth/csrf");
    const { csrfToken } = await csrfReq.json();

    await request.post("/api/auth/callback/test-credentials", {
      form: { id: userId, plan: "FREE", csrfToken: csrfToken },
    });

    const response = await request.get("/api/insights");
    expect(response.status()).toBe(429);
    expect(response.headers()["x-downgrade"]).toBe("teaser");
  });

  test("Free users are throttled for teaser, onboarding and forecast", async ({
    request,
  }) => {
    const routes = ["/api/teaser", "/api/forecast", "/api/onboarding"];
    const ANONYMOUS_LIMIT = 3;

    for (const route of routes) {
      const userId = randomUUID();
      const csrfReq = await request.get("/api/auth/csrf");
      const { csrfToken } = await csrfReq.json();

      await request.post("/api/auth/callback/test-credentials", {
        form: { id: userId, plan: "FREE", csrfToken: csrfToken },
      });

      for (let i = 0; i < ANONYMOUS_LIMIT; i++) {
        const response = await request.post(route, { data: {} });
        expect(response.status()).not.toBe(429);
      }

      const throttledResponse = await request.get(route);
      expect(throttledResponse.status()).toBe(429);
      const body = await throttledResponse.json();
      expect(body.error).toBe("Unlock higher limits with pro membership!");
    }
  });

  test("Pro users are throttled using Pro limit identifier", async ({
    request,
  }) => {
    const routes = [
      "/api/teaser",
      "/api/forecast",
      "/api/onboarding",
      "/api/insights",
    ];
    const PRO_LIMIT = 10;

    for (const route of routes) {
      const userId = randomUUID();
      const csrfReq = await request.get("/api/auth/csrf");
      const { csrfToken } = await csrfReq.json();

      await request.post("/api/auth/callback/test-credentials", {
        form: { id: userId, plan: "PRO", csrfToken: csrfToken },
      });
      for (let i = 0; i < PRO_LIMIT; i++) {
        const response = await request.post(route, { data: {} });
        expect(response.status()).not.toBe(429);
      }
      const softThrottleRes = await request.get(route);
      expect(softThrottleRes.status()).not.toBe(429);
      expect(softThrottleRes.headers()["x-vektor-ai-throttle"]).toBe("true");
    }
  });
});
