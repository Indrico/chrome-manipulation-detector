import { defineContentScript } from "wxt/utils/define-content-script";
import { xMatches } from "../adapters/x/selectors";
import { xAdapter } from "../adapters/x/x-adapter";
import { runFeed } from "../content/run-feed";

export default defineContentScript({
  matches: xMatches,
  allFrames: false,
  world: "ISOLATED",
  runAt: "document_idle",
  main: (ctx) => runFeed(ctx, "x", xAdapter),
});
