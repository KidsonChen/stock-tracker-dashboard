import fetch from 'node-fetch';

const API_KEY = 'd8vk4thr01qgrv4p09agd8vk4thr01qgrv4p09b0';
const symbols = ['2330.TW', '2330', 'TSMC', 'AAPL'];

async function testSymbol(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log(`\n[${symbol}]`);
    if (data.c) {
      console.log(`  ✓ 成功: 價格 = $${data.c}`);
    } else if (data.error) {
      console.log(`  ✗ 錯誤: ${data.error}`);
    } else {
      console.log(`  ✗ 無數據:`, data);
    }
  } catch (error) {
    console.log(`  ✗ 異常: ${error.message}`);
  }
}

console.log('測試 Finnhub 台股支援...');
for (const symbol of symbols) {
  await testSymbol(symbol);
}
