import { NextRequest, NextResponse } from 'next/server';

interface MarketCapResponse {
  ticker: string;
  date: string;
  price: number;
  shares_outstanding: number;
  market_cap: number;
  market_cap_billions: number;
  formatted_market_cap: string;
}

export async function GET(request: NextRequest) {
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
    
    // Use EODHD API - replace with your actual implementation
    const apiToken = process.env.EODHD_API_TOKEN;
    
    if (!apiToken) {
      throw new Error('EODHD API token not configured');
    }
    
    let apiUrl: string;
    let sharesOutstanding: number;
    
    if (date) {
      // Historical data
      apiUrl = `https://eodhd.com/api/eod/${formattedTicker}?from=${date}&to=${date}&api_token=${apiToken}&fmt=json`;
    } else {
      // Real-time data
      apiUrl = `https://eodhd.com/api/real-time/${formattedTicker}?api_token=${apiToken}&fmt=json`;
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`EODHD API responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Get shares outstanding
    sharesOutstanding = await getSharesOutstanding(formattedTicker, apiToken);
    
    let result: MarketCapResponse;
    
    if (date) {
      // Historical data (array format)
      const dayData = Array.isArray(data) ? data[0] : data;
      if (!dayData) {
        throw new Error(`No price data found for ${ticker} on ${date}`);
      }
      
      const price = dayData.close || dayData.adjusted_close || 0;
      const marketCap = price * sharesOutstanding;
      
      result = {
        ticker: formattedTicker,
        date: date,
        price: price,
        shares_outstanding: sharesOutstanding,
        market_cap: marketCap,
        market_cap_billions: parseFloat((marketCap / 1000000000).toFixed(2)),
        formatted_market_cap: `$${marketCap.toLocaleString()}`
      };
    } else {
      // Real-time data
      const price = data.close || data.price || 0;
      const marketCap = price * sharesOutstanding;
      
      result = {
        ticker: formattedTicker,
        date: new Date().toISOString().split('T')[0],
        price: price,
        shares_outstanding: sharesOutstanding,
        market_cap: marketCap,
        market_cap_billions: parseFloat((marketCap / 1000000000).toFixed(2)),
        formatted_market_cap: `$${marketCap.toLocaleString()}`
      };
    }

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

// Helper function to get shares outstanding
async function getSharesOutstanding(ticker: string, apiToken: string): Promise<number> {
  try {
    // Use EODHD fundamentals API
    const fundamentalsUrl = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${apiToken}`;
    
    const response = await fetch(fundamentalsUrl);
    if (!response.ok) {
      console.warn(`Could not fetch fundamentals for ${ticker}, using default shares outstanding`);
      return getDefaultSharesOutstanding(ticker);
    }
    
    const fundamentals = await response.json();
    const shares = fundamentals?.SharesStats?.SharesOutstanding || 
                   fundamentals?.General?.SharesOutstanding ||
                   getDefaultSharesOutstanding(ticker);
    
    return shares;
    
  } catch (error) {
    console.error('Error fetching shares outstanding:', error);
    return getDefaultSharesOutstanding(ticker);
  }
}

// Fallback shares outstanding for major companies
function getDefaultSharesOutstanding(ticker: string): number {
  const defaultShares: Record<string, number> = {
    'AAPL.US': 15400000000,    // Apple
    'MSFT.US': 7400000000,     // Microsoft
    'GOOGL.US': 6000000000,    // Alphabet Class A
    'GOOG.US': 6000000000,     // Alphabet Class C
    'AMZN.US': 10700000000,    // Amazon
    'TSLA.US': 3200000000,     // Tesla
    'NVDA.US': 2500000000,     // NVIDIA
    'META.US': 2700000000,     // Meta
    'V.US': 2100000000,        // Visa
    'UNH.US': 930000000,       // UnitedHealth
    'TMO.US': 390000000,       // Thermo Fisher
    'MA.US': 970000000,        // Mastercard
    'ASML.AS': 400000000,      // ASML
    'WMT.US': 2700000000,      // Walmart
    'TSM.US': 5200000000,      // Taiwan Semiconductor
    'LLY.US': 950000000,       // Eli Lilly
    'AVGO.US': 460000000,      // Broadcom
    'JNJ.US': 2600000000,      // Johnson & Johnson
    'JPM.US': 2900000000,      // JPMorgan Chase
    'XOM.US': 4200000000,      // ExxonMobil
    'PG.US': 2400000000,       // Procter & Gamble
    'HD.US': 1000000000,       // Home Depot
    'MRK.US': 2500000000,      // Merck
    'CVX.US': 1900000000,      // Chevron
    'ABBV.US': 1800000000,     // AbbVie
    'KO.US': 4300000000,       // Coca-Cola
    'PEP.US': 1400000000,      // PepsiCo
    'COST.US': 440000000,      // Costco
    'ABT.US': 1800000000,      // Abbott Laboratories
    'PFE.US': 5600000000,      // Pfizer
    'DIS.US': 1800000000,      // Disney
    'ADBE.US': 470000000,      // Adobe
    'NFLX.US': 440000000,      // Netflix
    'CRM.US': 990000000,       // Salesforce
    'AMD.US': 1600000000,      // AMD
    'QCOM.US': 1100000000,     // Qualcomm
    'INTC.US': 4100000000,     // Intel
    'TXN.US': 900000000,       // Texas Instruments
    'ORCL.US': 2700000000,     // Oracle
    'CSCO.US': 4200000000,     // Cisco
    'IBM.US': 920000000,       // IBM
    'AMAT.US': 900000000,      // Applied Materials
    'NOW.US': 200000000,       // ServiceNow
    'CCI.US': 470000000,       // Crown Castle
    'INTU.US': 280000000,      // Intuit
    'SNPS.US': 150000000,      // Synopsys
    'CDNS.US': 140000000,      // Cadence Design Systems
    'LRCX.US': 140000000,      // Lam Research
    'PANW.US': 330000000,      // Palo Alto Networks
    'FTNT.US': 800000000,      // Fortinet
    'CRWD.US': 240000000,      // CrowdStrike
    'ZS.US': 140000000,        // Zscaler
    'OKTA.US': 170000000,      // Okta
    'NET.US': 330000000,       // Cloudflare
    'DDOG.US': 340000000,      // Datadog
    'SNOW.US': 340000000,      // Snowflake
    'PLTR.US': 2200000000,     // Palantir
    'TEAM.US': 250000000,      // Atlassian
    'WDAY.US': 260000000,      // Workday
    'SHOP.US': 1300000000,     // Shopify
    'SQ.US': 610000000,        // Block (Square)
    'PYPL.US': 1100000000,     // PayPal
    'SPOT.US': 200000000,      // Spotify
    'UBER.US': 2000000000,     // Uber
    'LYFT.US': 380000000,      // Lyft
    'ABNB.US': 640000000,      // Airbnb
    'DASH.US': 380000000,      // DoorDash
    'RBLX.US': 580000000,      // Roblox
    'COIN.US': 260000000,      // Coinbase
    'HOOD.US': 880000000       // Robinhood
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