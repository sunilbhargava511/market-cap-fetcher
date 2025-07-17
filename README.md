# Market Cap Fetcher

A Next.js web application to fetch market capitalization data for any stock ticker on any given date using the EODHD API.

## Features

- 🔍 Search market cap for any stock ticker
- 📅 Get historical market cap data for specific dates
- 💰 Real-time calculations using stock price × shares outstanding
- 📊 Beautiful, responsive web interface
- 🚀 Deployed on Vercel

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your EODHD API token
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Deployment

This app is configured for easy deployment on Vercel:

1. Push to GitHub
2. Connect your GitHub repo to Vercel
3. Add your `EODHD_API_TOKEN` environment variable in Vercel dashboard
4. Deploy!

## API Usage

The app provides a REST API endpoint:

```
GET /api/market-cap?ticker=AAPL&date=2024-01-15
```

Response:
```json
{
  "ticker": "AAPL.US",
  "date": "2024-01-15",
  "price": 185.92,
  "shares_outstanding": 15441000000,
  "market_cap": 2871374720000,
  "market_cap_billions": 2871.37
}
```
