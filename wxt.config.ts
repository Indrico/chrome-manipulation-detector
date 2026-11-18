import { resolve } from "node:path";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifestVersion: 3,
  manifest: ({ mode }) => ({
    name: "Manipulation Detector",
    description:
      "Pelajari pola retorika yang mungkin muncul dalam unggahan media sosial.",
    permissions: ["storage"],
    ...(mode === "production" && {
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; connect-src 'none'",
      },
    }),
  }),
  hooks: {
    "build:publicAssets": (wxt, files) => {
      files.push({
        absoluteSrc: resolve(wxt.config.root, "LICENSE"),
        relativeDest: "LICENSE",
      });
    },
    "vite:build:extendConfig": (entries, config) => {
      const name = entries
        .map(({ name }) => name)
        .sort()
        .join("-");
      config.build = {
        ...config.build,
        modulePreload: { polyfill: false },
        license: { fileName: `notices/${name}.md` },
      };
    },
  },
});
