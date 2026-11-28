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
          "Conte e revise ovos de rivulídeos em fotografias com IA local e marcação manual. Exporte PNG, JSON, CSV e relatório para PDF no navegador.",
      },
      { property: "og:title", content: "Rivulídeos AI" },
      {
        property: "og:description",
        content:
          "Contagem e revisão humana de ovos em fotografias, com IA local e exportações PNG, JSON, CSV e relatório para PDF.",
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Rivulídeos AI",
          url: "https://rivulideos-ai.online/",
          applicationCategory: "ScientificApplication",
          operatingSystem: "Navegador web",
          inLanguage: "pt-BR",
          description:
            "Ferramenta de contagem e revisão de ovos de rivulídeos em fotografias, com processamento local e revisão humana.",
          featureList: [
            "Análise local de imagens",
            "Marcação e revisão manual",
            "Exportação PNG, JSON e CSV",
            "Relatório para PDF",
          ],
        }),
      },
    ],
  }),
  component: Workspace,
});
