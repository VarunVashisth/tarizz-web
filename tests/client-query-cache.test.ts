import { beforeEach, describe, expect, it, vi } from "vitest";

import { cachedClientQuery, invalidateClientQuery } from "@/lib/client-query-cache";

describe("client query cache", () => {
  beforeEach(() => {
    invalidateClientQuery();
  });

  it("deduplicates concurrent requests for the same user-scoped key", async () => {
    const loader = vi.fn(async () => ({ title: "Tarizz" }));

    const [first, second] = await Promise.all([
      cachedClientQuery("workspace:user-1:project-1", loader),
      cachedClientQuery("workspace:user-1:project-1", loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("reloads data after a matching cache prefix is invalidated", async () => {
    const loader = vi.fn(async () => loader.mock.calls.length);

    await cachedClientQuery("editor:user-1:note-1", loader);
    invalidateClientQuery("editor:user-1");
    const refreshed = await cachedClientQuery("editor:user-1:note-1", loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(refreshed).toBe(2);
  });
});
