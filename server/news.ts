/**
 * 消息面抓取：改為 Yahoo 奇摩台股 RSS（股市匯市新聞）。
 * 原因：原 Google News RSS 在 Cloudflare Pages Functions 執行環境（Workers IP）
 *       常被擋，導致靜默回傳空陣列、消息面板沒內容。Yahoo 台股 RSS 對
 *       Workers datacenter IP 較友善，且為標準 <item> + <![CDATA[]]> 結構。
 * 免 key、server 端 fetch 無 CORS 問題。輕量字串解析，不依賴外部套件。
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
  error?: string; // 抓取失敗時標記，讓前端顯示原因而非靜默空白
}

// 三產業分組：抓整包 Yahoo 台股新聞後，用關鍵字從 title 過濾歸類
const GROUPS: { industry: string; keywords: string[] }[] = [
  { industry: "半導體", keywords: ["半導體", "台積電", "聯發科", "晶圓", "IC", "矽", "AMD", "輝達", "NVIDIA", "GPU", "AI", "處理器"] },
  { industry: "記憶體", keywords: ["記憶體", "南亞科", "華邦電", "群聯", "威剛", "DRAM", "NAND", "SSD"] },
  { industry: "被動元件", keywords: ["被動元件", "國巨", "華新科", "MLCC", "電容", "電阻", "奇力新", "電感"] },
];

// 多來源合併：Yahoo 台股 RSS（對 Workers IP 友善、標準 <item>+CDATA）
// + 鉅亨網 Anue feedburner RSS（台股/財經即時頭條，豐富本地消息）
// 註：工商時報 RSS 被 Cloudflare 自身 403 擋 bot；經濟日報官方 RSS 路徑已失效，
//     故目前本地源採鉅亨網。若要再加源，往 SOURCES 陣列補 URL 即可。
const SOURCES: { name: string; url: string }[] = [
  { name: "Yahoo 奇摩股市", url: "https://tw.news.yahoo.com/rss/stock" },
  { name: "鉅亨網 Anue", url: "https://feeds.feedburner.com/cnyes" },
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

// 先去 CDATA 包裹，再去 HTML tag
function cleanText(s: string): string {
  const noCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeEntities(noCdata.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// 從 RSS XML 抽出所有 <item>，回傳結構化新聞（不限制數量，由分組邏輯取前 N）
function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      return r ? r[1] : "";
    };
    const title = cleanText(get("title"));
    const link = decodeEntities(get("link").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
    // Yahoo 來源多為 Yahoo 奇摩新聞；若有 <source> 取之
    const srcRe = /<source[^>]*>([\s\S]*?)<\/source>/.exec(block);
    const source = srcRe ? cleanText(srcRe[1]) : "Yahoo 奇摩新聞";
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

// 依關鍵字把整包新聞分到各組，每組取前 limit 則
function groupNews(all: NewsItem[], limit = 5): NewsGroup[] {
  return GROUPS.map((g) => {
    const items = all
      .filter((it) => g.keywords.some((kw) => it.title.includes(kw)))
      .slice(0, limit);
    return { industry: g.industry, query: g.keywords.join(" / "), items };
  });
}

export async function fetchIndustryNews(): Promise<NewsGroup[]> {
  let all: NewsItem[] = [];
  const errors: string[] = [];

  // 並行抓取所有來源，任一失敗不影響其他源
  const results = await Promise.allSettled(
    SOURCES.map(async (src) => {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`${src.name} HTTP ${res.status}`);
      const xml = await res.text();
      return parseRss(xml);
    })
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`[News] ${SOURCES[i].name}: 抓取 ${r.value.length} 則`);
      all = all.concat(r.value);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`[News] ${SOURCES[i].name} 抓取失敗:`, msg);
      errors.push(`${SOURCES[i].name}: ${msg}`);
    }
  });

  if (all.length === 0) {
    // 全部來源都掛：標記錯誤讓前端顯示原因，不再靜默空白
    return GROUPS.map((g) => ({
      industry: g.industry,
      query: g.keywords.join(" / "),
      items: [],
      error: `所有新聞源抓取失敗：${errors.join("；")}`,
    }));
  }

  // 依link去重（不同源可能轉載同則）
  const seen = new Set<string>();
  all = all.filter((it) => {
    if (seen.has(it.link)) return false;
    seen.add(it.link);
    return true;
  });

  console.log(`[News] 合併去重後共 ${all.length} 則，分組中…`);
  const groups = groupNews(all, 5);
  groups.forEach((g) => console.log(`[News] ${g.industry}: ${g.items.length} 則`));

  // 三組皆空（關鍵字未命中）時，退化顯示整包前 5 則，避免全空白
  if (groups.every((g) => g.items.length === 0)) {
    groups[0] = { ...groups[0], items: all.slice(0, 5) };
    console.warn("[News] 關鍵字未命中，已退化顯示整包前 5 則");
  }
  return groups;
}
