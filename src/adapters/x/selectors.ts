export const xOrigin = "https://x.com";
export const xMatches = [`${xOrigin}/*`];
export const conversationPrefix = "urt:conversation:";

export const selectors = {
  column: '[data-testid="primaryColumn"]',
  main: "main",
  feed: '[role="feed"], [role="region"], section[aria-labelledby], section[aria-label]',
  semanticHomeFeed: 'section [id^="urt:home:"]',
  semanticSearchFeed: 'section [id^="urt:search:"]',
  secondary: 'aside, [role="complementary"]',
  selectedTab: '[role="tab"][aria-selected="true"]',
  cell: '[data-testid="cellInnerDiv"]',
  card: "article",
  legacyCard: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  conversationCell: "li[data-index]",
  conversationText: 'div[dir="auto"][lang]',
  conversationTimestamp: "a[data-base-ui-tooltip-trigger][href]",
  navigationLink: 'div[role="link"][data-navigation-stop]',
  translationControl: 'button, [role="button"]',
  explicitQuote:
    '[data-testid="quoteTweet"], [data-slot="embedded-tweet-frame"]',
  quote:
    '[data-testid="quoteTweet"], [data-testid="card.wrapper"], [data-slot="embedded-tweet-frame"], div[role="link"]',
  reply: '[data-testid="replyingTo"], [data-testid="replyContext"]',
  collapsed: '[data-testid="tweet-text-show-more-link"]',
  restricted:
    '[data-testid="icon-lock"], [data-testid="protectedAccount"], [data-testid="superFollowTweet"], [aria-label="Protected account" i], [aria-label="Akun dilindungi" i]',
};
