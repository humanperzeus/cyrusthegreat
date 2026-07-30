import { useEffect } from "react";

const SITE = "https://cyrusthegreat.dev";

export interface Seo {
  /** Full <title> for the route. */
  title: string;
  /** meta[name=description] content for the route. */
  description: string;
  /** Absolute path, e.g. "/pay". Becomes the canonical URL. */
  path: string;
}

/**
 * Per-route SEO for this client-rendered SPA. Googlebot executes JS, so it
 * reads the rendered <title>, meta description, and <link rel=canonical> —
 * this hook keeps them unique per route. Base defaults (what non-JS social
 * scrapers see) live in index.html; this only refines for JS-rendering crawlers.
 * Restores previous values on unmount so routes don't leak meta into each other.
 */
export function useSeo({ title, description, path }: Seo): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const descEl = document.querySelector('meta[name="description"]');
    const prevDesc = descEl?.getAttribute("content") ?? "";
    descEl?.setAttribute("content", description);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevCanonical = canonical?.getAttribute("href") ?? `${SITE}/`;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${SITE}${path}`;

    return () => {
      document.title = prevTitle;
      descEl?.setAttribute("content", prevDesc);
      canonical?.setAttribute("href", prevCanonical);
    };
  }, [title, description, path]);
}
