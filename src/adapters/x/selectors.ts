export const xOrigin = "https://x.com";
export const xMatches = [`${xOrigin}/*`];

export const selectors = {
  column: '[data-testid="primaryColumn"]',
  feed: 'section[role="region"], section[aria-labelledby], section[aria-label]',
  selectedTab: '[role="tab"][aria-selected="true"]',
  cell: '[data-testid="cellInnerDiv"]',
  card: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  translationControl: 'button, [role="button"]',
  explicitQuote: '[data-testid="quoteTweet"]',
  quote:
    '[data-testid="quoteTweet"], [data-testid="card.wrapper"], div[role="link"]',
  reply: '[data-testid="replyingTo"], [data-testid="replyContext"]',
  collapsed: '[data-testid="tweet-text-show-more-link"]',
};
