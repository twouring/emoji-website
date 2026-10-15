'use strict';
// Presentation only: legacy CMS records and booking venue codes remain untouched.
const { SPACE_SEED } = require('./space-content');
const LEVEL = /[一二三四五]樓|樓層|閣樓|頂樓|樓上|[1-5]\s*F\b|[1-5]階|屋上|屋根裏|上階|フロア|\b(?:floors?|rooftop|attic|upstairs)\b/i;
function publicText(value) {
  if (typeof value !== 'string') return value;
  // Keep links and markup (including asset paths) verbatim. Only text is adapted.
  return value.split(/(<[^>]*>|https?:\/\/[^\s<>"']+)/g).map(part => {
    if (part.startsWith('<')) return part.replace(/\b(alt|title|aria-label)=("([^"]*)"|'([^']*)')/gi, (_, name, quoted, double, single) => {
      const quote = quoted[0];
      return name + '=' + quote + publicText(double ?? single) + quote;
    });
    if (/^https?:\/\//.test(part)) return part;
    return part
      .replace(/二[、與和]?三樓(?:與頂樓)?/g, '等等空間')
      .replace(/三樓共享空間/g, '等等空間共享活動區')
      .replace(/二樓交誼廳/g, '等等空間交誼廳')
      .replace(/閣樓休憩空間/g, '等等空間休憩區')
      .replace(/一樓咖啡餐酒館/g, '在咖啡／三點水餐飲空間')
      .replace(/一樓/g, '在咖啡／三點水').replace(/[二三]樓/g, '等等空間')
      .replace(/頂樓|四樓|五樓/g, '會員附屬設施').replace(/閣樓/g, '休憩區').replace(/樓層|樓上/g, '空間')
      .replace(/2F\s*(?:and|[、／/・–])\s*3F/gi, 'Stay Square')
      .replace(/(?:on|on the)\s+(?:[1-5]F|(?:ground|first|second|third|fourth|fifth)[ -]floor)/gi, 'at the venue')
      .replace(/\b(?:ground|first|second|third|fourth|fifth)[ -]floor\b/gi, 'venue')
      .replace(/(?<![a-z0-9_])1\s*F(?![a-z0-9_])/gi, 'at cafe / 3AM')
      .replace(/(?<![a-z0-9_])[2-5]\s*F(?![a-z0-9_])/gi, 'Stay Square')
      .replace(/2\s*階[・と]3\s*階/g, 'Stay Square').replace(/1\s*階/g, '在咖啡・三點水').replace(/[2-5]\s*階/g, 'Stay Square')
      .replace(/屋上|屋根裏|上階/g, '会員向け設備').replace(/フロア/g, 'スペース')
      .replace(/\brooftop\b/gi, 'member facilities').replace(/\battic\b/gi, 'rest area').replace(/\bupstairs\b/gi, 'in the member area')
      .replace(/\bfloors?\b/gi, 'space');
  }).join('');
}
function publicContent(content) {
  const out = { ...content };
  for (const [key, value] of Object.entries(out)) {
    // Use reviewed brand copy in place of old spatial descriptions. Images and
    // the structured menu / ordering configuration are not prose and never rewritten.
    if (/^space_[1-4]f(?:_(?:zh|en|ja))?$/.test(key) && LEVEL.test(String(value))) {
      out[key] = SPACE_SEED[key] || SPACE_SEED[key + '_zh'] || publicText(value);
    } else if (/^(?:announcement|hero|intro|notice|headline|tagline)(?:_|$)/.test(key)) {
      out[key] = publicText(value);
    }
  }
  return out;
}
function publicEventCopy(event) {
  if (!event) return event;
  const out = { ...event };
  for (const key of ['title', 'description', 'location', 'content_html', 'body', 'content']) {
    if (key in out) out[key] = publicText(out[key]);
  }
  if (event.rich_content) out.rich_content = Object.fromEntries(Object.entries(event.rich_content).map(([lang, html]) => [lang, publicText(html)]));
  if (event.translations) out.translations = Object.fromEntries(Object.entries(event.translations).map(([lang, fields]) => [lang,
    Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, /(?:url|image|id|slug)$/.test(key) ? value : publicText(value)]))]));
  return out;
}
module.exports = { publicText, publicContent, publicEventCopy };
