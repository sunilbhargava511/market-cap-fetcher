import { NextRequest, NextResponse } from 'next/server';

interface EODHDPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

interface EODHDSharesData {
  date: string;
  shares_outstanding: number;
}

interface MarketCapResult {
  ticker: string;
  date: string;
  price: number;
  adjusted_price: number;
  shares_outstanding: number;
  market_cap: number;
  market_cap_billions: number;
  formatted_market_cap: string;
  price_adjustment_note?: string;
}

export async function POST(request: NextRequest) {
  try {
    // DEBUG LOGGING - Add these lines to see what's happening
    console.log('=== API ROUTE DEBUG START ===');
    console.log('Environment check:');
    console.log('- EODHD_API_TOKEN exists:', !!process.env.EODHD_API_TOKEN);
    console.log('- Token length:', process.env.EODHD_API_TOKEN?.length || 0);
    console.log('- Token preview:', process.env.EODHD_API_TOKEN?.substring(0, 10) + '...');

    const requestBody = await request.json();
    console.log('Request body:', requestBody);

    const { ticker, date } = requestBody;
    console.log('Parsed ticker:', ticker);
    console.log('Parsed date:', date);
    
    if (!ticker || !date) {
      console.log('❌ Missing ticker or date');
      return NextResponse.json(
        { error: 'Ticker and date are required' },
        { status: 400 }
      );
    }

    const apiToken = process.env.EODHD_API_TOKEN;
    if (!apiToken) {
      console.log('❌ No API token found in environment');
      return NextResponse.json(
        { error: 'EODHD API token not configured' },
        { status: 500 }
      );
    }

    // Ensure ticker has .US suffix for US stocks
    const formattedTicker = ticker.includes('.') ? ticker : `${ticker}.US`;
    console.log('Formatted ticker:', formattedTicker);
    
    // Get split-adjusted price data
    console.log('🔄 Calling getSplitAdjustedPrice...');
    const priceData = await getSplitAdjustedPrice(formattedTicker, date, apiToken);
    console.log('✅ Price data received:', priceData);
    
    if (!priceData) {
      console.log('❌ No price data returned');
      throw new Error(`No price data available for ${formattedTicker} on ${date}`);
    }

    // Get shares outstanding (try historical first, fall back to defaults)
    console.log('🔄 Getting shares outstanding...');
    let sharesOutstanding = await getSharesOutstanding(formattedTicker, date, apiToken);
    if (!sharesOutstanding) {
      console.log('📊 Using default shares outstanding');
      sharesOutstanding = getDefaultSharesOutstanding(formattedTicker);
    }
    console.log('Shares outstanding:', sharesOutstanding);

    // Calculate market cap
    const rawPrice = priceData.close;
    const adjustedPrice = priceData.adjusted_close;
    const marketCap = adjustedPrice * sharesOutstanding;
    const marketCapBillions = marketCap / 1_000_000_000;

    const result: MarketCapResult = {
      ticker: formattedTicker,
      date: priceData.date,
      price: rawPrice,
      adjusted_price: adjustedPrice,
      shares_outstanding: sharesOutstanding,
      market_cap: marketCap,
      market_cap_billions: marketCapBillions,
      formatted_market_cap: `$${marketCapBillions.toFixed(2)}B`,
      price_adjustment_note: Math.abs(adjustedPrice - rawPrice) > 0.01 ? 
        `Split/dividend adjusted price used (${((adjustedPrice / rawPrice - 1) * 100).toFixed(1)}% adjustment)` : 
        undefined
    };

    console.log('✅ Final result:', result);
    console.log('=== API ROUTE DEBUG END ===');
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ API ROUTE ERROR:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch market cap data: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Get split-adjusted historical price
async function getSplitAdjustedPrice(ticker: string, date: string, apiToken: string): Promise<EODHDPriceData> {
  try {
    console.log(`🔄 Fetching price for ${ticker} on ${date}`);
    
    // Method 1: Use EOD API with focus on adjusted_close
    const eodUrl = `https://eodhd.com/api/eod/${ticker}?from=${date}&to=${date}&api_token=${apiToken}&fmt=json`;
    console.log('📡 API URL:', eodUrl.replace(apiToken, 'TOKEN_HIDDEN'));
    
    const response = await fetch(eodUrl);
    console.log('📡 Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`EODHD EOD API responded with status: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('📡 Raw API response:', data);
    
    const dayData = Array.isArray(data) ? data[0] : data;
    
    if (!dayData || !dayData.adjusted_close) {
      throw new Error(`No price data found for ${ticker} on ${date}`);
    }
    
    console.log('✅ Parsed day data:', dayData);
    
    return {
      date: dayData.date,
      open: dayData.open,
      high: dayData.high,
      low: dayData.low,
      close: dayData.close,
      adjusted_close: dayData.adjusted_close,
      volume: dayData.volume
    };
    
  } catch (error) {
    console.error(`❌ Error fetching price for ${ticker} on ${date}:`, error);
    throw error;
  }
}

// Get historical shares outstanding
async function getSharesOutstanding(ticker: string, date: string, apiToken: string): Promise<number | null> {
  try {
    console.log(`🔄 Attempting to fetch shares outstanding for ${ticker}`);
    
    // Try fundamentals API for shares outstanding
    const year = new Date(date).getFullYear();
    const fundamentalsUrl = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiToken}&fmt=json`;
    
    const response = await fetch(fundamentalsUrl);
    if (!response.ok) {
      console.log(`📊 Fundamentals API failed for ${ticker} (${response.status}), using defaults`);
      return null;
    }
    
    const data = await response.json();
    
    // Try to get shares outstanding from various sources in the fundamentals data
    const sharesOutstanding = 
      data?.SharesStats?.SharesOutstanding ||
      data?.Highlights?.SharesOutstanding ||
      data?.General?.SharesOutstanding ||
      data?.shareStatsSharesOutstanding ||
      data?.outstandingShares;

    if (sharesOutstanding && sharesOutstanding > 0) {
      console.log(`✅ Found shares outstanding from API: ${sharesOutstanding}`);
      return sharesOutstanding;
    }
    
    console.log(`📊 No shares outstanding found in fundamentals for ${ticker}`);
    return null;
    
  } catch (error) {
    console.log(`📊 Failed to fetch shares outstanding for ${ticker}:`, error);
    return null;
  }
}

// Default shares outstanding for major companies (as fallback)
function getDefaultSharesOutstanding(ticker: string): number {
  console.log(`📊 Using default shares outstanding for ${ticker}`);
  
  const defaultShares: { [key: string]: number } = {
    // FAANG/Tech Giants
    'AAPL.US': 15400000000,   // Apple
    'MSFT.US': 7400000000,    // Microsoft
    'GOOGL.US': 1240000000,   // Alphabet Class A
    'GOOG.US': 1240000000,    // Alphabet Class C
    'AMZN.US': 10700000000,   // Amazon
    'META.US': 2700000000,    // Meta
    'TSLA.US': 3200000000,    // Tesla
    'NFLX.US': 440000000,     // Netflix
    'NVDA.US': 2500000000,    // NVIDIA
    
    // Other Major Tech
    'CRM.US': 1000000000,     // Salesforce
    'ORCL.US': 2700000000,    // Oracle
    'ADBE.US': 460000000,     // Adobe
    'NOW.US': 200000000,      // ServiceNow
    'INTU.US': 280000000,     // Intuit
    'CSCO.US': 4200000000,    // Cisco
    'IBM.US': 920000000,      // IBM
    'SHOP.US': 1300000000,    // Shopify
    
    // Financial Services
    'V.US': 2100000000,       // Visa
    'MA.US': 970000000,       // Mastercard
    'JPM.US': 2900000000,     // JPMorgan Chase
    'BAC.US': 8200000000,     // Bank of America
    'WFC.US': 3700000000,     // Wells Fargo
    'GS.US': 340000000,       // Goldman Sachs
    'MS.US': 1600000000,      // Morgan Stanley
    'AXP.US': 740000000,      // American Express
    'PYPL.US': 1100000000,    // PayPal
    'SQ.US': 610000000,       // Block (Square)
    
    // Healthcare & Pharma
    'UNH.US': 930000000,      // UnitedHealth
    'JNJ.US': 2600000000,     // Johnson & Johnson
    'PFE.US': 5600000000,     // Pfizer
    'ABT.US': 1800000000,     // Abbott Laboratories
    'TMO.US': 390000000,      // Thermo Fisher
    'DHR.US': 720000000,      // Danaher
    'BMY.US': 2100000000,     // Bristol Myers Squibb
    'ABBV.US': 1800000000,    // AbbVie
    'MRK.US': 2500000000,     // Merck
    'LLY.US': 950000000,      // Eli Lilly
    'GILD.US': 1300000000,    // Gilead Sciences
    'AMGN.US': 540000000,     // Amgen
    'REGN.US': 110000000,     // Regeneron
    'VRTX.US': 260000000,     // Vertex Pharmaceuticals
    'BIIB.US': 150000000,     // Biogen
    'ISRG.US': 360000000,     // Intuitive Surgical
    
    // Consumer & Retail
    'WMT.US': 2700000000,     // Walmart
    'HD.US': 1000000000,      // Home Depot
    'COST.US': 440000000,     // Costco
    'TGT.US': 460000000,      // Target
    'LOW.US': 690000000,      // Lowe's
    'NKE.US': 1500000000,     // Nike
    'SBUX.US': 1100000000,    // Starbucks
    'MCD.US': 740000000,      // McDonald's
    'DIS.US': 1800000000,     // Disney
    
    // Consumer Goods
    'PG.US': 2400000000,      // Procter & Gamble
    'KO.US': 4300000000,      // Coca-Cola
    'PEP.US': 1400000000,     // PepsiCo
    'CL.US': 840000000,       // Colgate-Palmolive
    'KMB.US': 340000000,      // Kimberly-Clark
    'GIS.US': 600000000,      // General Mills
    'K.US': 340000000,        // Kellogg
    
    // Energy
    'XOM.US': 4200000000,     // ExxonMobil
    'CVX.US': 1900000000,     // Chevron
    'COP.US': 1300000000,     // ConocoPhillips
    'EOG.US': 580000000,      // EOG Resources
    'SLB.US': 1400000000,     // Schlumberger
    
    // Semiconductors
    'TSM.US': 5200000000,     // Taiwan Semiconductor
    'AVGO.US': 460000000,     // Broadcom
    'TXN.US': 900000000,      // Texas Instruments
    'QCOM.US': 1100000000,    // Qualcomm
    'AMD.US': 1600000000,     // AMD
    'INTC.US': 4100000000,    // Intel
    'MU.US': 1100000000,      // Micron Technology
    'MRVL.US': 850000000,     // Marvell Technology
    'AMAT.US': 900000000,     // Applied Materials
    'LRCX.US': 140000000,     // Lam Research
    'KLA.US': 140000000,      // KLA Corporation
    'SNPS.US': 150000000,     // Synopsys
    'CDNS.US': 140000000,     // Cadence Design Systems
    
    // Industrials
    'HON.US': 680000000,      // Honeywell
    'UPS.US': 870000000,      // UPS
    'CAT.US': 510000000,      // Caterpillar
    'DE.US': 300000000,       // Deere & Company
    'GE.US': 1100000000,      // General Electric
    'MMM.US': 570000000,      // 3M
    'LMT.US': 270000000,      // Lockheed Martin
    'RTX.US': 1500000000,     // Raytheon Technologies
    'BA.US': 590000000,       // Boeing
    'NOC.US': 160000000,      // Northrop Grumman
    'LHX.US': 420000000,      // L3Harris Technologies
    
    // Cybersecurity & Cloud
    'PANW.US': 330000000,     // Palo Alto Networks
    'FTNT.US': 800000000,     // Fortinet
    'CRWD.US': 240000000,     // CrowdStrike
    'ZS.US': 140000000,       // Zscaler
    'OKTA.US': 170000000,     // Okta
    'NET.US': 330000000,      // Cloudflare
    'DDOG.US': 340000000,     // Datadog
    'SNOW.US': 340000000,     // Snowflake
    'PLTR.US': 2200000000,    // Palantir
    'S.US': 120000000,        // SentinelOne
    
    // Transportation & Logistics
    'UBER.US': 2000000000,    // Uber
    'LYFT.US': 380000000,     // Lyft
    'ABNB.US': 640000000,     // Airbnb
    'DASH.US': 380000000,     // DoorDash
    'FDX.US': 260000000,      // FedEx
    
    // Gaming & Entertainment
    'RBLX.US': 580000000,     // Roblox
    'EA.US': 280000000,       // Electronic Arts
    'ATVI.US': 780000000,     // Activision Blizzard
    'TTWO.US': 110000000,     // Take-Two Interactive
    
    // Fintech & Crypto
    'COIN.US': 260000000,     // Coinbase
    'HOOD.US': 880000000,     // Robinhood
    'SOFI.US': 920000000,     // SoFi Technologies
    'UPST.US': 850000000,     // Upstart
    'AFRM.US': 300000000,     // Affirm
    
    // Biotech
    'MRNA.US': 380000000,     // Moderna
    'BNTX.US': 240000000,     // BioNTech
    'NVAX.US': 780000000,     // Novavax
    
    // REITs
    'AMT.US': 450000000,      // American Tower
    'CCI.US': 470000000,      // Crown Castle
    'EQIX.US': 90000000,      // Equinix
    'PLD.US': 770000000,      // Prologis
    'SPG.US': 310000000,      // Simon Property Group
    
    // Communications
    'VZ.US': 4200000000,      // Verizon
    'T.US': 7200000000,       // AT&T
    'TMUS.US': 1300000000,    // T-Mobile
    'CHTR.US': 160000000,     // Charter Communications
    'CMCSA.US': 4500000000,   // Comcast
  };
  
  const shares = defaultShares[ticker] || 1000000000; // 1B shares as ultimate fallback
  console.log(`📊 Default shares for ${ticker}: ${shares.toLocaleString()}`);
  return shares;
}

// Handle CORS if needed
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}