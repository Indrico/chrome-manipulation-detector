import { defineContentScript } from "wxt/utils/define-content-script";
import { threadsMatches } from "../adapters/threads/selectors";
import { threadsAdapter } from "../adapters/threads/threads-adapter";
import { runFeed } from "../content/run-feed";

export default defineContentScript({
  matches: threadsMatches,
  allFrames: false,
  world: "ISOLATED",
  runAt: "document_idle",
  main: (ctx) => runFeed(ctx, "threads", threadsAdapter),
});
