import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  manifest: {
    name: "Manipulation Detector",
    description:
      "Pelajari pola retorika yang mungkin muncul dalam unggahan media sosial.",
    permissions: ["storage"],
  },
});
