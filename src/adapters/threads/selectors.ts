export const threadsOrigin = "https://www.threads.com";
export const threadsMatches = [`${threadsOrigin}/*`];

export const threadsSelectors = {
  column:
    '[role="region"][aria-label="Column body"], [role="region"][aria-label="Isi kolom"], main, [role="main"]',
  region: '[role="region"]',
  permalink: 'a[href*="/post/"]:has(time)',
  // Threads renders these row and text wrappers even before pressable behavior hydrates.
  row: ".xrvj5dj.xd0jker",
  card: 'article, [role="article"], [data-pressable-container="true"]',
  cell: "[data-virtualized]",
  text: '.x1a6qonq, [data-testid="post-text"]',
  directional: '[dir="auto"]',
  quote:
    'blockquote, [data-testid="quoted-post"], [role="link"], [data-pressable-container="true"]',
  hidden: '[hidden], [aria-hidden="true"]',
  excluded: 'aside, nav, footer, [role="dialog"], [role="complementary"]',
  control:
    'button, [role="button"], [role="menu"], [contenteditable="true"], textarea',
  reply:
    '[data-testid="replyingTo"], [aria-label^="Replying to" i], [aria-label^="Membalas" i]',
  restricted:
    '[data-visibility]:not([data-visibility="public"]), [aria-label="Private profile" i], [aria-label="Profil privat" i], [aria-label="Private account" i], [aria-label="Akun privat" i], [aria-label*="followers only" i], [aria-label*="khusus pengikut" i]',
};
