import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { sitemapStaticPaths, sitemapXML } from "@/lib/sitemap";
import { routeTree } from "@/routeTree.gen";

describe("Google sitemap", () => {
  it("includes only the public analysis page", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(sitemapStaticPaths(router)).toEqual(["/"]);
  });

  it("uses the published site address in the XML", () => {
    expect(sitemapXML("https://rivulideos-ai.lovable.app", [{ path: "/" }])).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://rivulideos-ai.lovable.app/</loc></url></urlset>',
    );
  });
});
