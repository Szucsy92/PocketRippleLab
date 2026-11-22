import { createFileRoute } from "@tanstack/react-router";
import { WaterApp } from "@/components/WaterApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Víztükör – érintésre fodrozódó víz gyerekeknek" },
      { name: "description", content: "Teljes képernyős, nyugtató vízjáték: érintésre fodrozódik, kacsák, hajók és halak úsznak benne." },
      { property: "og:title", content: "Víztükör – érintésre fodrozódó víz" },
      { property: "og:description", content: "Nyugtató, ragyogó vízjáték gyerekeknek, döntésre mozgó tárgyakkal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WaterApp,
});
