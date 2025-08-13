// api/comps.js
const EBAY_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const CSE_URL = 'https://www.googleapis.com/customsearch/v1';

module.exports = async (req, res) => {
  try {
    const { q = '', category = '', condition = '' } = req.query || {};
    if (!q.trim()) return res.status(400).json({ error: 'Missing q (query)' });

    // 1) Google Programmable Search (free 100/day)
    const cseKey = process.env.GCSE_KEY;
    const cseCx  = process.env.GCSE_CX;
    let web = [];
    if (cseKey && cseCx) {
      const webUrl = new URL(CSE_URL);
      webUrl.searchParams.set('key', cseKey);
      webUrl.searchParams.set('cx', cseCx);
      webUrl.searchParams.set('q', q);
      const webResp = await fetch(webUrl);
      const webJson = await webResp.json();
      web = (webJson.items || []).map(r => ({ title: r.title, link: r.link, snippet: r.snippet }));
    }

    // 2) eBay Browse (active comps)
    const ebayToken = process.env.EBAY_BROWSE_TOKEN; // OAuth application token
    let items = [];
    if (ebayToken) {
      const ebayUrl = new URL(EBAY_BROWSE_URL);
      ebayUrl.searchParams.set('q', q);
      // Optional filters you can uncomment later:
      // ebayUrl.searchParams.set('filter', 'buyingOptions:{FIXED_PRICE}');
      // if (condition) ebayUrl.searchParams.set('filter', `conditions:{${condition}}`);
      const ebayResp = await fetch(ebayUrl, {
        headers: { 'Authorization': `Bearer ${ebayToken}`, 'Accept': 'application/json' }
      });
      const ebayJson = await ebayResp.json();
      items = (ebayJson.itemSummaries || []).map(it => ({
        title: it.title,
        price: it.price?.value ? Number(it.price.value) : null,
        currency: it.price?.currency || 'USD',
        condition: it.condition || null,
        url: it.itemWebUrl || it.itemAffiliateWebUrl || null,
        status: 'active'
      })).filter(x => x.price != null);
    }

    // Compute p25 / median / p75
    const prices = items.map(i => i.price).sort((a,b)=>a-b);
    const pick = (arr, p) => {
      if (!arr.length) return 0;
      const idx = Math.floor((p/100) * arr.length);
      return arr[Math.max(0, Math.min(arr.length - 1, idx))];
    };
    const stats = { p25: pick(prices, 25), p50: pick(prices, 50), p75: pick(prices, 75), sample: prices.length, source: 'active-ebay' };

    res.status(200).json({ query: q, stats, items, web });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
};
