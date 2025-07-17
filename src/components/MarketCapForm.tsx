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
    if (file) {
      setCsvFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          parseTickersFromCsv(text);
        }
      };
      reader.readAsText(file);
    }
  }, []);

  // Parse tickers from CSV
  const parseTickersFromCsv = (csvText: string) => {
    const lines = csvText.split('\n');
    const tickerSet = new Set<string>();
    
    for (const line of lines) {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      for (const value of values) {
        if (value && value.length > 0 && value !== 'ticker') {
          tickerSet.add(value.toUpperCase());
        }
      }
    }
    
    const extractedTickers = Array.from(tickerSet).join(' ');
    setTickers(extractedTickers);
  };

  // Wait for pause/resume
  const waitForResume = (): Promise<void> => {
    return new Promise((resolve) => {
      if (!isPaused) {
        resolve();
        return;
      }
      pauseResolveRef.current = resolve;
    });
  };

  // Sleep function
  const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // Process data
  const processData = async () => {
    if (!tickers.trim()) {
      alert('Please enter at least one ticker');
      return;
    }

    // Reset state
    setResults([]);
    setErrors([]);
    setIsLoading(true);
    setIsPaused(false);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Parse tickers and years
    const tickerList = tickers.trim().split(/\s+/).map(t => t.toUpperCase());
    const years = Array.from(
      { length: endYear - startYear + 1 }, 
      (_, i) => startYear + i
    );

    const totalRequests = tickerList.length * years.length;
    
    setProgress({
      completed: 0,
      total: totalRequests,
      failed: 0
    });

    const allResults: MarketCapData[] = [];
    const allErrors: ErrorData[] = [];
    let completed = 0;
    let failed = 0;

    try {
      for (const ticker of tickerList) {
        for (const year of years) {
          // Check if aborted
          if (abortControllerRef.current?.signal.aborted) {
            console.log('Fetch aborted');
            return;
          }

          // Wait for resume if paused
          await waitForResume();

          const date = startOfYearDates[year.toString()] || `${year}-01-02`;

          try {
            const response = await fetch(`${apiBaseUrl}/api/market-cap`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker, date }),
              signal: abortControllerRef.current?.signal
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.error) {
              allErrors.push({
                ticker,
                year: year.toString(),
                date,
                error: data.error
              });
              failed++;
            } else {
              allResults.push({
                ...data,
                year: year.toString()
              });
            }

          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.log('Request aborted');
              return;
            }
            
            allErrors.push({
              ticker,
              year: year.toString(),
              date,
              error: error.message || 'Unknown error'
            });
            failed++;
          }

          completed++;
          setProgress({ completed, total: totalRequests, failed });
          setResults([...allResults]);
          setErrors([...allErrors]);

          // Add delay to avoid rate limiting
          if (delay > 0) {
            await sleep(delay);
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Processing error:', error);
      }
    } finally {
      setIsLoading(false);
      setIsPaused(false);
    }
  };

  // Pause/Resume handlers
  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
    if (pauseResolveRef.current) {
      pauseResolveRef.current();
      pauseResolveRef.current = null;
    }
  };

  // Stop handler
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setIsPaused(false);
    if (pauseResolveRef.current) {
      pauseResolveRef.current();
      pauseResolveRef.current = null;
    }
  };

  // Get selected years for export
  const getSelectedYears = () => {
    return Array.from(
      { length: endYear - startYear + 1 }, 
      (_, i) => (startYear + i).toString()
    );
  };

  // Create pivot data helper
  const createPivotData = (results: MarketCapData[], field: keyof MarketCapData) => {
    const selectedYears = getSelectedYears();
    // FIXED LINE: Use Array.from() instead of spread operator
    const tickerList = Array.from(new Set(results.map(r => r.ticker?.replace('.US', '')))).sort();

    // Create header row
    const headers = ['Ticker', ...selectedYears];

    // Create data rows
    const rows = tickerList.map(ticker => {
      const row = [ticker];
      for (const year of selectedYears) {
        const result = results.find(r => 
          r.ticker?.replace('.US', '') === ticker && r.year === year
        );
        const value = result?.[field];
        row.push(value !== undefined ? value.toString() : '');
      }
      return row;
    });

    return [headers, ...rows];
  };

  // CSV Export Functions
  const exportPricesCsv = () => {
    const csvData = createPivotData(results, 'adjusted_price');
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    downloadCsv(csvContent, 'market_cap_prices.csv');
  };

  const exportMarketCapCsv = () => {
    const csvData = createPivotData(results, 'market_cap_billions');
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    downloadCsv(csvContent, 'market_cap_values.csv');
  };

  const exportSharesCsv = () => {
    const csvData = createPivotData(results, 'shares_outstanding');
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    downloadCsv(csvContent, 'shares_outstanding.csv');
  };

  const exportRawDataCsv = () => {
    if (results.length === 0) return;
    
    const headers = ['ticker', 'year', 'date', 'price', 'adjusted_price', 'shares_outstanding', 'market_cap', 'market_cap_billions'];
    const csvContent = [
      headers.join(','),
      ...results.map(result => [
        result.ticker || '',
        result.year || '',
        result.date || '',
        result.price || '',
        result.adjusted_price || '',
        result.shares_outstanding || '',
        result.market_cap || '',
        result.market_cap_billions || ''
      ].join(','))
    ].join('\n');
    
    downloadCsv(csvContent, 'market_cap_raw_data.csv');
  };

  const exportErrorsCsv = () => {
    if (errors.length === 0) return;
    
    const headers = ['ticker', 'year', 'date', 'error'];
    const csvContent = [
      headers.join(','),
      ...errors.map(error => [
        error.ticker,
        error.year,
        error.date,
        `"${error.error}"`
      ].join(','))
    ].join('\n');
    
    downloadCsv(csvContent, 'market_cap_errors.csv');
  };

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Enhanced Market Cap Fetcher</h1>
        <p className="text-gray-600 mb-4">
          Fetch historical market cap data for multiple tickers across multiple years using split-adjusted prices.
        </p>
        
        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-900 mb-2">How It Works</h3>
              <ul className="text-sm list-disc list-inside space-y-1 text-blue-700">
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
              Recommended: 100ms (free tier), 50ms (paid tier)
            </p>
          </div>
        </div>

        {/* Right Column - CSV Upload & Controls */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Or Upload CSV File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
                disabled={isLoading}
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {csvFile ? csvFile.name : 'Click to upload ticker CSV'}
                </span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isLoading ? (
              <button
                onClick={processData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                <Play className="h-4 w-4" />
                Start Fetching Market Cap Data
              </button>
            ) : (
              <div className="flex gap-2">
                {!isPaused ? (
                  <button
                    onClick={handlePause}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </button>
                )}
                <button
                  onClick={handleStop}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      {isLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
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
              CSV format: Tickers as rows, years as columns (pivot table ready). 
              Prices are split and dividend-adjusted for accurate historical analysis.
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