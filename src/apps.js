// Names the common Shopify apps and trackers behind a script URL, so a report can say
// "Klaviyo, 3 scripts" instead of listing hostnames. Unknown hosts fall back to the hostname.

const KNOWN = [
  [/klaviyo\.com/, 'Klaviyo', 'email'],
  [/judge\.me/, 'Judge.me', 'reviews'],
  [/yotpo\.com/, 'Yotpo', 'reviews'],
  [/loox\.io/, 'Loox', 'reviews'],
  [/stamped\.io/, 'Stamped', 'reviews'],
  [/okendo\.io/, 'Okendo', 'reviews'],
  [/reviews\.io|reviewsio/, 'REVIEWS.io', 'reviews'],
  [/privy\.com/, 'Privy', 'popups'],
  [/omnisend\.com/, 'Omnisend', 'email'],
  [/mailchimp|chimpstatic\.com/, 'Mailchimp', 'email'],
  [/hotjar\.com/, 'Hotjar', 'analytics'],
  [/clarity\.ms/, 'Microsoft Clarity', 'analytics'],
  [/googletagmanager\.com/, 'Google Tag Manager', 'analytics'],
  [/google-analytics\.com/, 'Google Analytics', 'analytics'],
  [/connect\.facebook\.net|facebook\.com\/tr/, 'Meta Pixel', 'ads'],
  [/analytics\.tiktok\.com/, 'TikTok Pixel', 'ads'],
  [/snapchat\.com|sc-static\.net/, 'Snap Pixel', 'ads'],
  [/pinimg\.com|pinterest\.com/, 'Pinterest Tag', 'ads'],
  [/bat\.bing\.com/, 'Microsoft Ads', 'ads'],
  [/gorgias\.(chat|io)/, 'Gorgias', 'chat'],
  [/tidio\.co/, 'Tidio', 'chat'],
  [/zdassets\.com|zendesk/, 'Zendesk', 'chat'],
  [/intercom(cdn)?\.(io|com)/, 'Intercom', 'chat'],
  [/tawk\.to/, 'Tawk.to', 'chat'],
  [/rechargeapps\.com|rechargecdn/, 'Recharge', 'subscriptions'],
  [/boldapps\.net|boldcommerce/, 'Bold', 'apps'],
  [/smile\.io/, 'Smile.io', 'loyalty'],
  [/afterpay|clearpay/, 'Afterpay', 'payments'],
  [/klarna/, 'Klarna', 'payments'],
  [/paypal\.com|paypalobjects\.com/, 'PayPal', 'payments'],
  [/youtube\.com|ytimg\.com/, 'YouTube', 'media'],
  [/vimeo\.com/, 'Vimeo', 'media'],
  [/fonts\.googleapis\.com|fonts\.gstatic\.com/, 'Google Fonts', 'fonts'],
  [/use\.typekit\.net/, 'Adobe Fonts', 'fonts'],
  [/jquery/, 'jQuery', 'library'],
];

// Scripts Shopify serves for the storefront itself (checkout, analytics, Shop Pay) that a merchant can't remove
const PLATFORM = /cdn\.shopify\.com\/(s\/|shopifycloud\/)|\/cdn\/shopifycloud\/|shop\.app|shopify\.com\/(s\/trekkie|storefront)/;
// App embeds and app blocks installed from the Shopify App Store
const APP_EXTENSION = /cdn\.shopify\.com\/extensions\/|\/cdn\/shop\/t\/\d+\/compiled_assets|shopifyapps\.com/;

export function identify(src, pageHost) {
  let host;
  try { host = new URL(src).hostname; } catch { return { name: 'unknown', category: 'other', kind: 'third-party' }; }
  for (const [re, name, category] of KNOWN) if (re.test(src)) return { name, category, kind: 'third-party', host };
  if (APP_EXTENSION.test(src)) return { name: 'Shopify app embeds', category: 'apps', kind: 'app', host };
  if (PLATFORM.test(src)) return { name: 'Shopify platform', category: 'platform', kind: 'platform', host };
  if (host === pageHost || /cdn\.shopify\.com$/.test(host) || src.includes('/cdn/shop/')) return { name: 'Theme', category: 'theme', kind: 'theme', host };
  return { name: host, category: 'other', kind: 'third-party', host };
}
