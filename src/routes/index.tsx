import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/rivu/Workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rivulídeos AI — Contagem de ovos de rivulídeos" },
      { name: "description", content: "Ferramenta científica para identificar, contar e revisar ovos de rivulídeos em fotografias de substrato, direto no navegador." },
      { property: "og:title", content: "Rivulídeos AI" },
      { property: "og:description", content: "Identificação, contagem e revisão de ovos de rivulídeos em fotografias, com processamento local." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});
