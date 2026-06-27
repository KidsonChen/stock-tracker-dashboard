import fetch from 'node:fetch';

async function testTWSE() {
  try {
    console.log('Testing TWSE API...\n');
    
    // 測試即時報價
    const quoteUrl = 'https://api.tse.com.tw/api/v1/stock/2330/intraday';
    console.log(`Fetching: ${quoteUrl}`);
    const quoteResp = await fetch(quoteUrl);
    const quoteData = await quoteResp.json();
    console.log('Quote Response:', JSON.stringify(quoteData).substring(0, 200));
    
    // 測試日線資料
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const dailyUrl = `https://api.tse.com.tw/api/v1/exchangeReport/OHLC?response=json&date=${dateStr}&symbol=2330`;
    console.log(`\nFetching: ${dailyUrl}`);
    const dailyResp = await fetch(dailyUrl);
    const dailyData = await dailyResp.json();
    console.log('Daily Response:', JSON.stringify(dailyData).substring(0, 200));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testTWSE();
