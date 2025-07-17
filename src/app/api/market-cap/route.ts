import { NextRequest, NextResponse } from 'next/server';

interface MarketCapResponse {
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

interface EODHDPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjusted_close: number;
  volume: number;
}

interface SharesStats {
  SharesOutstanding?: number;
  SharesFloat?: number;
  commonStockSharesOutstanding?: number;
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const date = searchParams.get('date');

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 });
  }

  // Validate date format if provided
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Date must be in YYYY-MM-DD format' }, { status: 400 });
  }

  try {
    // Add .US suffix if not already present
    const formattedTicker = ticker.includes('.') ? ticker : `${ticker}.US`;
    
    // Use EODHD API
    const apiToken = process.env.EODHD_API_TOKEN || 'demo';
    
    let priceData: EODHDPriceData;
    let sharesOutstanding: number;
    let targetDate = date || new Date().toISOString().split('T')[0];
    
    // Get split-adjusted historical prices
    if (date) {
      priceData = await getSplitAdjustedPrice(formattedTicker, date, apiToken);
    } else {
      // For current data, get the latest available
      priceData = await getCurrentPrice(formattedTicker, apiToken);
      targetDate = priceData.date;
    }
    
    // Get historical shares outstanding for the specific date
    sharesOutstanding = await getHistoricalSharesOutstanding(formattedTicker, targetDate, apiToken);
    
    // Calculate market cap using adjusted price
    const adjustedPrice = priceData.adjusted_close || priceData.close;
    const rawPrice = priceData.close;
    const marketCap = adjustedPrice * sharesOutstanding;
    
    const result: MarketCapResponse = {
      ticker: formattedTicker,
      date: targetDate,
      price: rawPrice,
      adjusted_price: adjustedPrice,
      shares_outstanding: sharesOutstanding,
      market_cap: marketCap,
      market_cap_billions: parseFloat((marketCap / 1000000000).toFixed(2)),
      formatted_market_cap: `$${marketCap.toLocaleString()}`,
      price_adjustment_note: adjustedPrice !== rawPrice ? 
        `Split/dividend adjusted price used (${((adjustedPrice / rawPrice - 1) * 100).toFixed(1)}% adjustment)` : 
        undefined
    };

    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error fetching market cap data:', error);
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
    // Method 1: Use EOD API with focus on adjusted_close
    const eodUrl = `https://eodhd.com/api/eod/${ticker}?from=${date}&to=${date}&api_token=${apiToken}&fmt=json`;
    
    const response = await fetch(eodUrl);
    if (!response.ok) {
      throw new Error(`EODHD EOD API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    const dayData = Array.isArray(data) ? data[0] : data;
    
    if (!dayData) {
      throw new Error(`No price data found for ${ticker} on ${date}`);
    }
    
    return {
      date: dayData.date || date,
      open: dayData.open || 0,
      high: dayData.high || 0,
      low: dayData.low || 0,
      close: dayData.close || 0,
      adjusted_close: dayData.adjusted_close || dayData.close || 0,
      volume: dayData.volume || 0
    };
    
  } catch (error) {
    console.error(`Error fetching split-adjusted price for ${ticker} on ${date}:`, error);
    
    // Fallback: Try alternative API or use estimated price
    try {
      // Alternative: Use technical indicator for split adjustment
      const techUrl = `https://eodhd.com/api/technical-indicators?s=${ticker}&api_token=${apiToken}&function=splitadjusted&fmt=json`;
      const techResponse = await fetch(techUrl);
      
      if (techResponse.ok) {
        const techData = await techResponse.json();
        // Process technical indicator data if available
        const relevantData = techData.find((item: any) => item.date === date);
        if (relevantData) {
          return {
            date: date,
            open: relevantData.open || 0,
            high: relevantData.high || 0,
            low: relevantData.low || 0,
            close: relevantData.close || 0,
            adjusted_close: relevantData.close || 0,
            volume: 0
          };
        }
      }
    } catch (fallbackError) {
      console.warn('Technical indicator fallback also failed:', fallbackError);
    }
    
    throw error;
  }
}

// Get current price data
async function getCurrentPrice(ticker: string, apiToken: string): Promise<EODHDPriceData> {
  try {
    // Get latest EOD data
    const eodUrl = `https://eodhd.com/api/eod/${ticker}?api_token=${apiToken}&fmt=json&period=d&order=d&limit=1`;
    
    const response = await fetch(eodUrl);
    if (!response.ok) {
      throw new Error(`EODHD API responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    const latestData = Array.isArray(data) ? data[0] : data;
    
    if (!latestData) {
      throw new Error(`No current price data found for ${ticker}`);
    }
    
    return {
      date: latestData.date || new Date().toISOString().split('T')[0],
      open: latestData.open || 0,
      high: latestData.high || 0,
      low: latestData.low || 0,
      close: latestData.close || 0,
      adjusted_close: latestData.adjusted_close || latestData.close || 0,
      volume: latestData.volume || 0
    };
    
  } catch (error) {
    console.error(`Error fetching current price for ${ticker}:`, error);
    throw error;
  }
}

// Get historical shares outstanding for a specific date
async function getHistoricalSharesOutstanding(ticker: string, date: string, apiToken: string): Promise<number> {
  try {
    // First, try to get historical shares from quarterly financials
    const year = date.split('-')[0];
    const month = date.split('-')[1];
    
    // Determine the most recent quarter end date before our target date
    let quarterEndDate: string;
    if (month <= '03') {
      quarterEndDate = `${parseInt(year) - 1}-12-31`;
    } else if (month <= '06') {
      quarterEndDate = `${year}-03-31`;
    } else if (month <= '09') {
      quarterEndDate = `${year}-06-30`;
    } else {
      quarterEndDate = `${year}-09-30`;
    }
    
    // Try to get historical shares outstanding from quarterly data
    try {
      const historicalUrl = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiToken}&fmt=json&filter=Financials::Balance_Sheet::quarterly::${quarterEndDate}::commonStockSharesOutstanding`;
      
      const historicalResponse = await fetch(historicalUrl);
      if (historicalResponse.ok) {
        const historicalData = await historicalResponse.json();
        if (historicalData && typeof historicalData === 'number' && historicalData > 0) {
          console.log(`Found historical shares for ${ticker} at ${quarterEndDate}: ${historicalData}`);
          return historicalData;
        }
      }
    } catch (historicalError) {
      console.warn(`Could not fetch historical shares for ${ticker} at ${quarterEndDate}:`, historicalError);
    }
    
    // Fallback: Get latest shares outstanding
    const latestUrl = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiToken}&fmt=json&filter=SharesStats`;
    
    const response = await fetch(latestUrl);
    if (!response.ok) {
      console.warn(`Could not fetch current fundamentals for ${ticker}, using default shares outstanding`);
      return getDefaultSharesOutstanding(ticker);
    }
    
    const fundamentals: SharesStats = await response.json();
    const shares = fundamentals?.SharesOutstanding || 
                   fundamentals?.commonStockSharesOutstanding ||
                   getDefaultSharesOutstanding(ticker);
    
    console.log(`Using latest shares for ${ticker}: ${shares}`);
    return shares;
    
  } catch (error) {
    console.error('Error fetching shares outstanding:', error);
    return getDefaultSharesOutstanding(ticker);
  }
}

// Enhanced fallback shares outstanding for major companies
function getDefaultSharesOutstanding(ticker: string): number {
  const defaultShares: Record<string, number> = {
    // Major Tech Companies
    'AAPL.US': 15400000000,    // Apple
    'MSFT.US': 7400000000,     // Microsoft
    'GOOGL.US': 6000000000,    // Alphabet Class A
    'GOOG.US': 6000000000,     // Alphabet Class C
    'AMZN.US': 10700000000,    // Amazon
    'TSLA.US': 3200000000,     // Tesla
    'NVDA.US': 2500000000,     // NVIDIA
    'META.US': 2700000000,     // Meta
    'NFLX.US': 440000000,      // Netflix
    'ADBE.US': 470000000,      // Adobe
    'CRM.US': 990000000,       // Salesforce
    'ORCL.US': 2700000000,     // Oracle
    'NOW.US': 200000000,       // ServiceNow
    'TEAM.US': 250000000,      // Atlassian
    'WDAY.US': 260000000,      // Workday
    'SHOP.US': 1300000000,     // Shopify
    
    // Financial Services
    'V.US': 2100000000,        // Visa
    'MA.US': 970000000,        // Mastercard
    'JPM.US': 2900000000,      // JPMorgan Chase
    'BAC.US': 8200000000,      // Bank of America
    'WFC.US': 3700000000,      // Wells Fargo
    'GS.US': 340000000,        // Goldman Sachs
    'MS.US': 1600000000,       // Morgan Stanley
    'AXP.US': 740000000,       // American Express
    'PYPL.US': 1100000000,     // PayPal
    'SQ.US': 610000000,        // Block (Square)
    
    // Healthcare & Pharma
    'UNH.US': 930000000,       // UnitedHealth
    'JNJ.US': 2600000000,      // Johnson & Johnson
    'PFE.US': 5600000000,      // Pfizer
    'ABT.US': 1800000000,      // Abbott Laboratories
    'TMO.US': 390000000,       // Thermo Fisher
    'DHR.US': 720000000,       // Danaher
    'BMY.US': 2100000000,      // Bristol Myers Squibb
    'ABBV.US': 1800000000,     // AbbVie
    'MRK.US': 2500000000,      // Merck
    'LLY.US': 950000000,       // Eli Lilly
    'GILD.US': 1300000000,     // Gilead Sciences
    'AMGN.US': 540000000,      // Amgen
    'REGN.US': 110000000,      // Regeneron
    'VRTX.US': 260000000,      // Vertex Pharmaceuticals
    'BIIB.US': 150000000,      // Biogen
    'ISRG.US': 360000000,      // Intuitive Surgical
    
    // Consumer & Retail
    'WMT.US': 2700000000,      // Walmart
    'HD.US': 1000000000,       // Home Depot
    'COST.US': 440000000,      // Costco
    'TGT.US': 460000000,       // Target
    'LOW.US': 690000000,       // Lowe's
    'NKE.US': 1500000000,      // Nike
    'SBUX.US': 1100000000,     // Starbucks
    'MCD.US': 740000000,       // McDonald's
    'DIS.US': 1800000000,      // Disney
    
    // Consumer Goods
    'PG.US': 2400000000,       // Procter & Gamble
    'KO.US': 4300000000,       // Coca-Cola
    'PEP.US': 1400000000,      // PepsiCo
    'CL.US': 840000000,        // Colgate-Palmolive
    'KMB.US': 340000000,       // Kimberly-Clark
    'GIS.US': 600000000,       // General Mills
    'K.US': 340000000,         // Kellogg
    
    // Energy
    'XOM.US': 4200000000,      // ExxonMobil
    'CVX.US': 1900000000,      // Chevron
    'COP.US': 1300000000,      // ConocoPhillips
    'EOG.US': 580000000,       // EOG Resources
    'SLB.US': 1400000000,      // Schlumberger
    
    // Semiconductors
    'TSM.US': 5200000000,      // Taiwan Semiconductor
    'AVGO.US': 460000000,      // Broadcom
    'TXN.US': 900000000,       // Texas Instruments
    'QCOM.US': 1100000000,     // Qualcomm
    'AMD.US': 1600000000,      // AMD
    'INTC.US': 4100000000,     // Intel
    'MU.US': 1100000000,       // Micron Technology
    'MRVL.US': 850000000,      // Marvell Technology
    'AMAT.US': 900000000,      // Applied Materials
    'LRCX.US': 140000000,      // Lam Research
    'KLA.US': 140000000,       // KLA Corporation
    'SNPS.US': 150000000,      // Synopsys
    'CDNS.US': 140000000,      // Cadence Design Systems
    
    // Industrials
    'HON.US': 680000000,       // Honeywell
    'UPS.US': 870000000,       // UPS
    'CAT.US': 510000000,       // Caterpillar
    'DE.US': 300000000,        // Deere & Company
    'GE.US': 1100000000,       // General Electric
    'MMM.US': 570000000,       // 3M
    'LMT.US': 270000000,       // Lockheed Martin
    'RTX.US': 1500000000,      // Raytheon Technologies
    'BA.US': 590000000,        // Boeing
    'NOC.US': 160000000,       // Northrop Grumman
    'LHX.US': 420000000,       // L3Harris Technologies
    
    // Cybersecurity & Cloud
    'PANW.US': 330000000,      // Palo Alto Networks
    'FTNT.US': 800000000,      // Fortinet
    'CRWD.US': 240000000,      // CrowdStrike
    'ZS.US': 140000000,        // Zscaler
    'OKTA.US': 170000000,      // Okta
    'NET.US': 330000000,       // Cloudflare
    'DDOG.US': 340000000,      // Datadog
    'SNOW.US': 340000000,      // Snowflake
    'PLTR.US': 2200000000,     // Palantir
    'S.US': 120000000,         // SentinelOne
    
    // Transportation & Logistics
    'UBER.US': 2000000000,     // Uber
    'LYFT.US': 380000000,      // Lyft
    'ABNB.US': 640000000,      // Airbnb
    'DASH.US': 380000000,      // DoorDash
    'FDX.US': 260000000,       // FedEx
    
    // Gaming & Entertainment
    'RBLX.US': 580000000,      // Roblox
    'EA.US': 280000000,        // Electronic Arts
    'ATVI.US': 780000000,      // Activision Blizzard
    'TTWO.US': 110000000,      // Take-Two Interactive
    
    // Fintech & Crypto
    'COIN.US': 260000000,      // Coinbase
    'HOOD.US': 880000000,      // Robinhood
    'SOFI.US': 920000000,      // SoFi Technologies
    'UPST.US': 850000000,      // Upstart
    'AFRM.US': 300000000,      // Affirm
    
    // Biotech
    'MRNA.US': 380000000,      // Moderna
    'BNTX.US': 240000000,      // BioNTech
    'NVAX.US': 780000000,      // Novavax
    
    // REITs
    'AMT.US': 450000000,       // American Tower
    'CCI.US': 470000000,       // Crown Castle
    'EQIX.US': 90000000,       // Equinix
    'PLD.US': 770000000,       // Prologis
    'SPG.US': 310000000,       // Simon Property Group
    
    // Communications
    'VZ.US': 4200000000,       // Verizon
    'T.US': 7200000000,        // AT&T
    'TMUS.US': 1300000000,     // T-Mobile
    'CHTR.US': 160000000,      // Charter Communications
    'CMCSA.US': 4500000000,    // Comcast
  };
  
  return defaultShares[ticker] || 1000000000; // 1B shares as ultimate fallback
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