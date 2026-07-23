/**
 * 消息面抓取：Google News RSS（台股相關關鍵字）→ 結構化新聞清單。
 * 免 key、CORS 在 server 端無礙。用 node 內建 fetch + 輕量 XML 字串解析，不依賴外部套件。
 */

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string; // ISO
}

export interface NewsGroup {
  industry: string;
  query: string;
  items: NewsItem[];
}

// 三產業對應的 Google News 查詢關鍵字（繁體，貼近台股用語）
const GROUPS: { industry: string; query: string }[] = [
  { industry: "半導體", query: "台股 半導體 台積電 聯發科" },
  { industry: "記憶體", query: "台股 記憶體 南亞科 華邦電" },
  { industry: "被動元件", query: "台股 被動元件 國巨 華新科" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// 從 RSS XML 抽取 <item> 區塊，解析 title/source/link/pubDate
function parseRss(xml: string, limit = 5): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return r ? r[1] : "";
    };
    const title = stripTags(get("title"));
    const link = decodeEntities(get("link"));
    // source 可能在 <source url=...> 裡
    const srcRe = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block);
    const source = srcRe ? stripTags(srcRe[1]) : "Google News";
    const pubDate = get("pubDate");
    if (!title) continue;
    items.push({
      title,
      source,
      link,
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

export async function fetchIndustryNews(): Promise<NewsGroup[]> {
  const groups: NewsGroup[] = [];
  for (const g of GROUPS) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
        g.query
      )}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      const xml = await res.text();
      const items = parseRss(xml, 5);
      groups.push({ industry: g.industry, query: g.query, items });
    } catch (e) {
      console.error(`[News] ${g.industry} RSS failed:`, (e as Error).message);
      groups.push({ industry: g.industry, query: g.query, items: [] });
    }
  }
  return groups;
}
