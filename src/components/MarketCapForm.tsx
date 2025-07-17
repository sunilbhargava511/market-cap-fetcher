'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Download, Play, Pause, Square, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface MarketCapData {
  ticker: string;
  year: string;
  date: string;
  price?: number;
  adjusted_price?: number;
  shares_outstanding?: number;
  market_cap?: number;
  market_cap_billions?: number;
  formatted_market_cap?: string;
  price_adjustment_note?: string;
}

interface ErrorData {
  ticker: string;
  year: string;
  date: string;
  error: string;
}

interface StartOfYearDates {
  [year: string]: string;
}

const MarketCapForm: React.FC = () => {
  const [tickers, setTickers] = useState<string>('');
  const [startYear, setStartYear] = useState<number>(2010);
  const [endYear, setEndYear] = useState<number>(2025);
  const [results, setResults] = useState<MarketCapData[]>([]);
  const [errors, setErrors] = useState<ErrorData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; failed: number }>({
    completed: 0,
    total: 0,
    failed: 0
  });
  const [delay, setDelay] = useState<number>(100);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [startOfYearDates, setStartOfYearDates] = useState<StartOfYearDates>({
    '2010': '2010-01-05',
    '2011': '2011-01-04',
    '2012': '2012-01-03',
    '2013': '2013-01-02',
    '2014': '2014-01-07',
    '2015': '2015-01-06',
    '2016': '2016-01-05',
    '2017': '2017-01-03',
    '2018': '2018-01-02',
    '2019': '2019-01-02',
    '2020': '2020-01-07',
    '2021': '2021-01-05',
    '2022': '2022-01-04',
    '2023': '2023-01-03',
    '2024': '2024-01-02',
    '2025': '2025-01-07'
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pauseResolveRef = useRef<(() => void) | null>(null);

  // Get API base URL
  const getApiBaseUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  };

  const apiBaseUrl = getApiBaseUrl();

  // File upload handler
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        if (lines.length > 1) {
          const dataRow = lines[1].split(',');
          const newDates: StartOfYearDates = {};
          
          headers.slice(1).forEach((year, index) => {
            if (dataRow[index + 1] && dataRow[index + 1].trim()) {
              newDates[year.trim()] = dataRow[index + 1].trim();
            }
          });
          
          setStartOfYearDates(prev => ({ ...prev, ...newDates }));
        }
      };
      reader.readAsText(file);
    }
  }, []);

  // Create pause promise
  const pausePromise = useCallback(() => {
    if (!isPaused) return Promise.resolve();
    
    return new Promise<void>((resolve) => {
      pauseResolveRef.current = resolve;
    });
  }, [isPaused]);

  // Fetch market cap data
  const fetchMarketCap = async (
    ticker: string, 
    date: string, 
    retries: number = 3
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    const urls = [
      `${apiBaseUrl}/api/market-cap?ticker=${ticker}&date=${date}`
    ];

    for (let attempt = 0; attempt <= retries; attempt++) {
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            signal: abortControllerRef.current?.signal
          });
          
          if (response.ok) {
            const data = await response.json();
            return { success: true, data };
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }
          // Continue to next URL/attempt
        }
      }
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    return { success: false, error: 'All fetch attempts failed' };
  };

  // Main fetch function
  const handleFetch = async () => {
    const tickerList = tickers.split(/\s+/).filter(t => t.trim());
    
    if (tickerList.length === 0) {
      alert('Please enter at least one ticker symbol');
      return;
    }

    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    const totalRequests = tickerList.length * years.length;

    setIsLoading(true);
    setIsPaused(false);
    setResults([]);
    setErrors([]);
    setProgress({ completed: 0, total: totalRequests, failed: 0 });

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    const newResults: MarketCapData[] = [];
    const newErrors: ErrorData[] = [];
    let completed = 0;
    let failed = 0;

    try {
      for (const ticker of tickerList) {
        for (const year of years) {
          // Check for abort
          if (abortControllerRef.current?.signal.aborted) {
            return;
          }

          // Handle pause
          await pausePromise();

          const date = startOfYearDates[year.toString()] || `${year}-01-02`;

          try {
            const result = await fetchMarketCap(ticker, date);
            
            if (result.success && result.data) {
              newResults.push({
                ticker: result.data.ticker || ticker,
                year: year.toString(),
                date: result.data.date || date,
                price: result.data.price || 0,
                adjusted_price: result.data.adjusted_price || result.data.price || 0,
                shares_outstanding: result.data.shares_outstanding || 0,
                market_cap: result.data.market_cap || 0,
                market_cap_billions: result.data.market_cap_billions || 0,
                formatted_market_cap: result.data.formatted_market_cap || '',
                price_adjustment_note: result.data.price_adjustment_note
              });
              completed++;
            } else {
              newErrors.push({ ticker, year: year.toString(), date, error: result.error || 'Unknown error' });
              failed++;
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            newErrors.push({ ticker, year: year.toString(), date, error: errorMessage });
            failed++;
          }

          setProgress({ completed, total: totalRequests, failed });
          setResults([...newResults]);
          setErrors([...newErrors]);

          // Add delay between requests
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    } finally {
      setIsLoading(false);
      setIsPaused(false);
    }
  };

  // Control functions
  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
    pauseResolveRef.current?.();
    pauseResolveRef.current = null;
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setIsPaused(false);
    pauseResolveRef.current?.();
    pauseResolveRef.current = null;
  };

  // Utility functions
  const getSelectedYears = () => {
    return Array.from({ length: endYear - startYear + 1 }, (_, i) => (startYear + i).toString());
  };

  const downloadCsv = (data: (string | number)[][], filename: string) => {
    const csvContent = data.map(row => 
      row.map(cell => 
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const createPivotData = (results: MarketCapData[], field: keyof MarketCapData) => {
    const selectedYears = getSelectedYears();
    const tickerList = [...new Set(results.map(r => r.ticker?.replace('.US', '')))].sort();
    
    // Create header row
    const headers = ['Ticker', ...selectedYears];
    
    // Create data rows
    const rows = tickerList.map(ticker => {
      const row: (string | number)[] = [ticker];
      selectedYears.forEach(year => {
        const result = results.find(r => 
          r.ticker?.replace('.US', '') === ticker && r.year === year
        );
        // Use adjusted_price for price exports, otherwise use the requested field
        const value = result ? (field === 'price' ? result.adjusted_price || result[field] : result[field]) : '';
        row.push(value || '');
      });
      return row;
    });
    
    return [headers, ...rows];
  };

  // CSV export functions
  const exportPricesCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'price');
    downloadCsv(data, `split_adjusted_prices_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportMarketCapCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'market_cap_billions');
    downloadCsv(data, `market_cap_billions_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportSharesCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'shares_outstanding');
    downloadCsv(data, `shares_outstanding_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportErrorsCsv = () => {
    if (errors.length === 0) return;
    const data = [
      ['Ticker', 'Year', 'Date', 'Error'],
      ...errors.map(error => [error.ticker, error.year, error.date, error.error])
    ];
    downloadCsv(data, `errors_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportRawDataCsv = () => {
    if (results.length === 0) return;
    const data = [
      ['Ticker', 'Year', 'Date', 'Raw_Price', 'Adjusted_Price', 'Shares_Outstanding', 'Market_Cap', 'Market_Cap_Billions', 'Price_Adjustment_Note'],
      ...results.map(result => [
        result.ticker?.replace('.US', '') || '',
        result.year || '',
        result.date || '',
        result.price || '',
        result.adjusted_price || '',
        result.shares_outstanding || '',
        result.market_cap || '',
        result.market_cap_billions || '',
        result.price_adjustment_note || ''
      ])
    ];
    downloadCsv(data, `raw_data_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Enhanced Market Cap Fetcher</h1>
        <p className="text-gray-600">
          Fetch split-adjusted historical market capitalization data using EODHD API
        </p>
        <div className="mt-3 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Enhanced with Split-Adjusted Pricing:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Uses <strong>adjusted_close</strong> prices from EODHD API for accurate historical data</li>
                <li>Attempts to fetch historical shares outstanding for specific time periods</li>
                <li>Market cap = split-adjusted price × historical shares outstanding</li>
                <li>Blue prices with asterisks (*) indicate split/dividend adjustments were applied</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left Column - Basic Settings */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Stock Tickers (space-separated)
            </label>
            <textarea
              value={tickers}
              onChange={(e) => setTickers(e.target.value)}
              placeholder="AAPL MSFT GOOGL AMZN TSLA NVDA META NFLX..."
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={4}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              157+ tickers supported. US stocks auto-add .US suffix. International: use ASML.AS, TSM.TW, etc.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Year</label>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value))}
                min="1990"
                max="2025"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Year</label>
              <input
                type="number"
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value))}
                min="1990"
                max="2025"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delay Between Requests (ms)
            </label>
            <input
              type="number"
              value={delay}
              onChange={(e) => setDelay(parseInt(e.target.value))}
              min="0"
              max="5000"
              step="50"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Recommended: 100ms for EODHD API rate limiting
            </p>
          </div>
        </div>

        {/* Right Column - CSV Upload & Start Dates */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Start-of-Year Dates CSV (Optional)
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={isLoading}
                />
                {csvFile && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ Uploaded: {csvFile.name}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Start-of-Year Trading Dates
            </label>
            <div className="bg-gray-50 p-3 rounded-md max-h-40 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(startOfYearDates)
                  .filter(([year]) => parseInt(year) >= startYear && parseInt(year) <= endYear)
                  .map(([year, date]) => (
                    <div key={year} className="flex justify-between">
                      <span className="font-medium">{year}:</span>
                      <span className="text-gray-600">{date}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        {!isLoading ? (
          <button
            onClick={handleFetch}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            <Play className="h-4 w-4" />
            Start Batch Fetch
          </button>
        ) : (
          <div className="flex gap-2">
            {!isPaused ? (
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play className="h-4 w-4" />
                Resume
              </button>
            )}
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Progress Section */}
      {isLoading && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-blue-900">
              {isPaused ? 'Paused' : 'Fetching Market Cap Data...'}
            </h3>
            <span className="text-sm text-blue-700">
              {progress.completed} / {progress.total} completed
              {progress.failed > 0 && ` (${progress.failed} failed)`}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          </div>
          {progress.failed > 0 && (
            <p className="text-sm text-yellow-700 mt-1">
              ⚠️ Some requests failed - see error export for details
            </p>
          )}
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="space-y-6">
          {/* Export Buttons */}
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-medium text-green-900 mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Export Data ({results.length} results)
            </h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportPricesCsv}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Split-Adjusted Prices CSV
              </button>
              <button
                onClick={exportMarketCapCsv}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                <Download className="h-4 w-4" />
                Market Cap CSV
              </button>
              <button
                onClick={exportSharesCsv}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" />
                Shares Outstanding CSV
              </button>
              <button
                onClick={exportRawDataCsv}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Raw Data CSV
              </button>
              {errors.length > 0 && (
                <button
                  onClick={exportErrorsCsv}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  <Download className="h-4 w-4" />
                  Errors CSV ({errors.length})
                </button>
              )}
            </div>
            <p className="text-sm text-green-700 mt-2">
              CSV format: Tickers as rows, years as columns (pivot table ready). Prices are split and dividend-adjusted for accurate historical analysis.
            </p>
          </div>

          {/* Results Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <h3 className="font-medium text-gray-900 p-4 border-b border-gray-200">
              Market Cap Results (First 50)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-left">Ticker</th>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Raw Price</th>
                    <th className="px-3 py-2 text-right">Adj. Price</th>
                    <th className="px-3 py-2 text-right">Market Cap (B)</th>
                    <th className="px-3 py-2 text-right">Shares Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 50).map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-2 font-medium">{result.ticker?.replace('.US', '')}</td>
                      <td className="px-3 py-2">{result.year}</td>
                      <td className="px-3 py-2">{result.date}</td>
                      <td className="px-3 py-2 text-right">${result.price?.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={result.adjusted_price !== result.price ? 'text-blue-600 font-medium' : ''}>
                          ${result.adjusted_price?.toFixed(2)}
                          {result.adjusted_price !== result.price && (
                            <span className="text-xs text-blue-500 ml-1">*</span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">${result.market_cap_billions?.toFixed(1)}B</td>
                      <td className="px-3 py-2 text-right">{result.shares_outstanding?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-gray-50">
              {results.length > 50 && (
                <p className="text-center text-gray-500 mt-3">
                  Showing first 50 results. Export CSVs for complete data.
                </p>
              )}
              {results.some(r => r.adjusted_price !== r.price) && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">* Split/Dividend Adjusted:</span> Blue prices with asterisks (*) indicate split and dividend-adjusted values used for accurate market cap calculations.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Errors Section */}
      {errors.length > 0 && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-medium text-red-900 mb-2 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Errors ({errors.length})
          </h3>
          <div className="max-h-40 overflow-y-auto">
            {errors.slice(0, 10).map((error, index) => (
              <p key={index} className="text-sm text-red-700">
                {error.ticker} ({error.year}): {error.error}
              </p>
            ))}
            {errors.length > 10 && (
              <p className="text-sm text-red-600 mt-2">
                ... and {errors.length - 10} more errors. Export errors CSV for complete list.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketCapForm;