import { resolve } from "node:path";
import { defineConfig } from "wxt";

const onlineOrigin = process.env.MD_ONLINE_ORIGIN ?? "";
const onlineTest = process.env.MD_ONLINE_TEST === "1";
const groqOrigin =
  (onlineTest && process.env.MD_GROQ_TEST_ORIGIN) || "https://api.groq.com";
if (
  groqOrigin !== "https://api.groq.com" &&
  !/^http:\/\/127\.0\.0\.1:\d+$/u.test(groqOrigin)
)
  throw new Error("The Groq test endpoint must use loopback.");
const endpoint = onlineOrigin ? new URL(onlineOrigin) : undefined;
if (
  endpoint &&
  (endpoint.origin !== onlineOrigin ||
    endpoint.hostname.includes("*") ||
    (endpoint.protocol !== "https:" &&
      !(
        onlineTest &&
        endpoint.hostname === "127.0.0.1" &&
        endpoint.protocol === "http:"
      )))
)
  throw new Error(
    "MD_ONLINE_ORIGIN must be an HTTPS origin (or a loopback origin for tests).",
  );
const api = endpoint ?? new URL(groqOrigin);

export default defineConfig({
  srcDir: "src",
  outDir: onlineTest ? ".output/online-test" : ".output",
  manifestVersion: 3,
  vite: () => ({
    define: {
      "import.meta.env.MD_ONLINE_ORIGIN": JSON.stringify(onlineOrigin),
      "import.meta.env.MD_GROQ_ORIGIN": JSON.stringify(groqOrigin),
    },
  }),
  manifest: ({ mode }) => ({
    name: "Manipulation Detector",
    description:
      "Pelajari pola retorika yang mungkin muncul dalam unggahan media sosial.",
    permissions: ["storage"],
    optional_host_permissions: [`${api.protocol}//${api.hostname}/*`],
    ...(mode === "production" && {
      content_security_policy: {
        extension_pages: `script-src 'self'; object-src 'none'; connect-src ${api.origin}; form-action 'none'`,
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
