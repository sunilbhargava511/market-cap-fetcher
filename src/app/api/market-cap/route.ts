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
    const requestBody = await request.json();
    const { ticker, date } = requestBody;
    
    if (!ticker || !date) {
      console.log('❌ Missing required fields:', { ticker: !!ticker, date: !!date });
      return NextResponse.json(
        { error: 'Ticker and date are required' },
        { status: 400 }
      );
    }

    const apiToken = process.env.EODHD_API_TOKEN;
    if (!apiToken) {
      console.error('❌ EODHD_API_TOKEN environment variable not configured');
      return NextResponse.json(
        { error: 'EODHD API token not configured' },
        { status: 500 }
      );
    }

    const formattedTicker = ticker.includes('.') ? ticker : `${ticker}.US`;
    
    // Get split-adjusted price data with fallback logic
    const priceData = await getSplitAdjustedPriceWithFallback(formattedTicker, date, apiToken);
    
    if (!priceData) {
      console.log(`❌ No price data found for ${formattedTicker} around ${date}`);
      throw new Error(`No price data available for ${formattedTicker} around ${date}`);
    }

    // Get shares outstanding
    let sharesOutstanding = await getSharesOutstanding(formattedTicker, date, apiToken);
    if (!sharesOutstanding) {
      sharesOutstanding = getDefaultSharesOutstanding(formattedTicker);
    }

    // Calculate market cap
    const rawPrice = priceData.close;
    const adjustedPrice = priceData.adjusted_close;
    const marketCap = adjustedPrice * sharesOutstanding;
    const marketCapBillions = marketCap / 1_000_000_000;

    const result: MarketCapResult = {
      ticker: formattedTicker,
      date: priceData.date, // Use actual date found
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

    // Log successful requests (useful for monitoring)
    console.log(`✅ Success: ${formattedTicker} (${date} → ${priceData.date}) - $${marketCapBillions.toFixed(1)}B`);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ API Error:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: `Failed to fetch market cap data: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// Enhanced price fetching with fallback logic for holidays/weekends
async function getSplitAdjustedPriceWithFallback(ticker: string, requestedDate: string, apiToken: string): Promise<EODHDPriceData | null> {
  // Try the exact date first
  try {
    const exactData = await tryFetchPriceForDate(ticker, requestedDate, apiToken);
    if (exactData) {
      return exactData;
    }
  } catch (error) {
    // Log API errors but continue to fallback dates
    if (error instanceof Error && !error.message.includes('No data')) {
      console.log(`⚠️ API error for ${ticker} on ${requestedDate}:`, error.message);
    }
  }

  // If exact date fails, try nearby dates (common for holidays/weekends)
  const fallbackDates = generateFallbackDates(requestedDate);
  
  for (const fallbackDate of fallbackDates) {
    try {
      const fallbackData = await tryFetchPriceForDate(ticker, fallbackDate, apiToken);
      if (fallbackData) {
        console.log(`📅 Used fallback date for ${ticker}: ${requestedDate} → ${fallbackDate}`);
        return fallbackData;
      }
    } catch (error) {
      // Continue to next fallback date
      continue;
    }
  }

  return null;
}

// Generate fallback dates (try 1-5 days after the requested date)
function generateFallbackDates(dateStr: string): string[] {
  const baseDate = new Date(dateStr);
  const fallbackDates: string[] = [];
  
  // Try the next 5 days
  for (let i = 1; i <= 5; i++) {
    const nextDate = new Date(baseDate);
    nextDate.setDate(baseDate.getDate() + i);
    fallbackDates.push(nextDate.toISOString().split('T')[0]);
  }
  
  return fallbackDates;
}

// Try to fetch price data for a specific date
async function tryFetchPriceForDate(ticker: string, date: string, apiToken: string): Promise<EODHDPriceData | null> {
  const eodUrl = `https://eodhd.com/api/eod/${ticker}?from=${date}&to=${date}&api_token=${apiToken}&fmt=json`;
  
  const response = await fetch(eodUrl);
  
  if (!response.ok) {
    throw new Error(`EODHD API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Check if we got data
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return null; // No data for this date
  }
  
  const dayData = Array.isArray(data) ? data[0] : data;
  
  if (!dayData || !dayData.adjusted_close) {
    return null;
  }
  
  return {
    date: dayData.date,
    open: dayData.open,
    high: dayData.high,
    low: dayData.low,
    close: dayData.close,
    adjusted_close: dayData.adjusted_close,
    volume: dayData.volume
  };
}

// Get historical shares outstanding
async function getSharesOutstanding(ticker: string, date: string, apiToken: string): Promise<number | null> {
  try {
    const fundamentalsUrl = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiToken}&fmt=json`;
    
    const response = await fetch(fundamentalsUrl);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    const sharesOutstanding = 
      data?.SharesStats?.SharesOutstanding ||
      data?.Highlights?.SharesOutstanding ||
      data?.General?.SharesOutstanding ||
      data?.shareStatsSharesOutstanding ||
      data?.outstandingShares;

    if (sharesOutstanding && sharesOutstanding > 0) {
      return sharesOutstanding;
    }
    
    return null;
    
  } catch (error) {
    // Silently fail - we'll use defaults
    return null;
  }
}

// Default shares outstanding for major companies
function getDefaultSharesOutstanding(ticker: string): number {
  const defaultShares: { [key: string]: number } = {
    'AAPL.US': 15400000000,   // Apple
    'MSFT.US': 7400000000,    // Microsoft
    'GOOGL.US': 1240000000,   // Alphabet Class A
    'GOOG.US': 1240000000,    // Alphabet Class C
    'AMZN.US': 10700000000,   // Amazon
    'META.US': 2700000000,    // Meta
    'TSLA.US': 3200000000,    // Tesla
    'NFLX.US': 440000000,     // Netflix
    'NVDA.US': 2500000000,    // NVIDIA
    'CRM.US': 1000000000,     // Salesforce
    'ORCL.US': 2700000000,    // Oracle
    'ADBE.US': 460000000,     // Adobe
    'NOW.US': 200000000,      // ServiceNow
    'INTU.US': 280000000,     // Intuit
    'CSCO.US': 4200000000,    // Cisco
    'IBM.US': 920000000,      // IBM
    'SHOP.US': 1300000000,    // Shopify
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
    'WMT.US': 2700000000,     // Walmart
    'HD.US': 1000000000,      // Home Depot
    'COST.US': 440000000,     // Costco
    'TGT.US': 460000000,      // Target
    'LOW.US': 690000000,      // Lowe's
    'NKE.US': 1500000000,     // Nike
    'SBUX.US': 1100000000,    // Starbucks
    'MCD.US': 740000000,      // McDonald's
    'DIS.US': 1800000000,     // Disney
    'PG.US': 2400000000,      // Procter & Gamble
    'KO.US': 4300000000,      // Coca-Cola
    'PEP.US': 1400000000,     // PepsiCo
    'CL.US': 840000000,       // Colgate-Palmolive
    'KMB.US': 340000000,      // Kimberly-Clark
    'GIS.US': 600000000,      // General Mills
    'K.US': 340000000,        // Kellogg
    'XOM.US': 4200000000,     // ExxonMobil
    'CVX.US': 1900000000,     // Chevron
    'COP.US': 1300000000,     // ConocoPhillips
    'EOG.US': 580000000,      // EOG Resources
    'SLB.US': 1400000000,     // Schlumberger
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
  };
  
  return defaultShares[ticker] || 1000000000; // 1B shares as fallback
}

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