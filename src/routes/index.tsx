import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/rivu/Workspace";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Rivulídeos AI — Contagem de ovos de rivulídeos" },
      {
        name: "description",
        content:
          "Ferramenta científica para identificar, contar e revisar ovos de rivulídeos em fotografias de substrato, direto no navegador.",
      },
      { property: "og:title", content: "Rivulídeos AI" },
      {
        property: "og:description",
        content:
          "Identificação, contagem e revisão de ovos de rivulídeos em fotografias, com processamento local.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://rivulideos-ai.online/" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://rivulideos-ai.online/og-image.png" },
      { name: "twitter:image", content: "https://rivulideos-ai.online/og-image.png" },
      {
        name: "google-site-verification",
        content: "XLF6KDjzMQw4Rq55HG2PBmGA-2RZFkFZ76Tk8lirP-Y",
      },
    ],
    links: [{ rel: "canonical", href: "https://rivulideos-ai.online/" }],
  }),
  component: Workspace,
});
