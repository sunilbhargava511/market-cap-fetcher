interface EODHDPriceData {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjusted_close: number
  volume: number
}

interface MarketCapResult {
  ticker: string
  date: string
  price: number
  shares_outstanding: number
  market_cap: number
  market_cap_billions: number
  formatted_market_cap: string
}

export class EODHDClient {
  private apiToken: string
  private baseUrl = 'https://eodhd.com/api'

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  private normalizeSymbol(ticker: string): string {
    // Add .US suffix if no exchange is specified
    if (!ticker.includes('.')) {
      return `${ticker}.US`
    }
    return ticker
  }

  async getHistoricalPrice(ticker: string, date: string): Promise<number> {
    const symbol = this.normalizeSymbol(ticker)
    const url = `${this.baseUrl}/eod/${symbol}`
    
    const params = new URLSearchParams({
      api_token: this.apiToken,
      from: date,
      to: date,
      period: 'd',
      fmt: 'json'
    })

    const response = await fetch(`${url}?${params}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch price data: ${response.statusText}`)
    }

    const data: EODHDPriceData[] = await response.json()
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`No price data found for ${ticker} on ${date}`)
    }

    return data[0].close
  }

  async getSharesOutstanding(ticker: string): Promise<number> {
    const symbol = this.normalizeSymbol(ticker)
    const url = `${this.baseUrl}/fundamentals/${symbol}`
    
    const params = new URLSearchParams({
      api_token: this.apiToken,
      fmt: 'json',
      filter: 'SharesStats'
    })

    const response = await fetch(`${url}?${params}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch shares data: ${response.statusText}`)
    }

    const data = await response.json()
    
    // Try different possible keys for shares outstanding
    const possibleKeys = [
      'SharesOutstanding',
      'shares_outstanding', 
      'sharesOutstanding',
      'Shares Outstanding',
      'CommonSharesOutstanding'
    ]

    for (const key of possibleKeys) {
      if (data[key] && typeof data[key] === 'number') {
        return data[key]
      }
    }

    throw new Error(`Could not find shares outstanding data for ${ticker}`)
  }

  async getMarketCap(ticker: string, date?: string): Promise<MarketCapResult> {
    const targetDate = date || new Date().toISOString().split('T')[0]
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new Error('Date must be in YYYY-MM-DD format')
    }

    const [price, shares] = await Promise.all([
      this.getHistoricalPrice(ticker, targetDate),
      this.getSharesOutstanding(ticker)
    ])

    const marketCap = price * shares
    
    return {
      ticker: this.normalizeSymbol(ticker),
      date: targetDate,
      price,
      shares_outstanding: shares,
      market_cap: marketCap,
      market_cap_billions: Math.round((marketCap / 1_000_000_000) * 100) / 100,
      formatted_market_cap: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(marketCap)
    }
  }
}
