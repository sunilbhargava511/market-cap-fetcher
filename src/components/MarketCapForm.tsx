'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Download, Play, Pause, RotateCcw, Upload, AlertCircle, CheckCircle, Clock, TrendingUp, Package } from 'lucide-react';

interface MarketCapData {
  ticker: string;
  year: string;
  date: string;
  price?: number;
  shares_outstanding?: number;
  market_cap?: number;
  market_cap_billions?: number;
  formatted_market_cap?: string;
}

interface ErrorData {
  ticker: string;
  year: string;
  date?: string;
  error: string;
}

const MarketCapForm: React.FC = () => {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('http://localhost:3000');
  const [tickers, setTickers] = useState<string>('');
  const [startYear, setStartYear] = useState<number>(2010);
  const [endYear, setEndYear] = useState<number>(2025);
  const [yearDates, setYearDates] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentTicker, setCurrentTicker] = useState<string>('');
  const [currentYear, setCurrentYear] = useState<string>('');
  const [results, setResults] = useState<MarketCapData[]>([]);
  const [errors, setErrors] = useState<ErrorData[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0 });
  const [delay, setDelay] = useState<number>(100);
  const [csvData, setCsvData] = useState<Record<string, string> | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default start-of-year dates
  const defaultYearDates: Record<string, string> = {
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
  };

  const defaultTickers = `AMZN MSFT GOOG NVDA AAPL V UNH TMO MA NOW ASML META CRM CRWD TSLA WMT AVGO TSM LLY AZN SAP BX ACN ISRG ADBE HON DHR LRCX PANW CDNS FICO ARM MELI VRTX BAM FTNT NET REGN TEAM DDOG CYBR ILMN SHOP SNOW HUBS ORCL NFLX JNJ NVO TM LIN GS INTU CAT BLK SPGI NEE DE NKE CME ROP IDXX MKL BIP ICE SNPS BN VEEV ADSK DXCM DT BABA SE TTD MDB SONY KO NOC PLTR NU ETSY COST PG HD MRK TXN UL MMC MCO UPS LHX ABT AXP DIS SHEL RTX BKNG QCOM AMAT SYK ETN PFE SBUX TRI FI CVS ELV ECL EQIX CARR WDAY NDAQ EW MSCI ARES RMD IQV IBKR LULU CBOE LH WST PAYC EPAM AMD PDD SPOT KKR ABNB NTES AXON NXPI ZS BIDU SMCI ON PTC OKTA APTV MBLY PCOR NICE ESTC CFLT BEP LSCC RGEN ENPH BEPC GLOB CALX IAC FIVN ALNY SYM DUOL GTLB`;

  useEffect(() => {
    setYearDates(defaultYearDates);
    setTickers(defaultTickers);
  }, []);

  const getSelectedYears = (): string[] => {
    const years: string[] = [];
    for (let year = startYear; year <= endYear; year++) {
      if (yearDates[year.toString()]) {
        years.push(year.toString());
      }
    }
    return years;
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      if (lines.length > 1) {
        const dataRow = lines[1].split(',').map(d => d.trim());
        const newYearDates: Record<string, string> = {};
        
        headers.forEach((header, index) => {
          if (header.match(/^\d{4}$/) && dataRow[index]) {
            // Convert date format from M/D/YY to YYYY-MM-DD
            const dateParts = dataRow[index].split('/');
            if (dateParts.length === 3) {
              const month = dateParts[0].padStart(2, '0');
              const day = dateParts[1].padStart(2, '0');
              let year = dateParts[2];
              
              if (year.length === 2) {
                const yearNum = parseInt(year);
                year = yearNum < 50 ? `20${year}` : `19${year}`;
              }
              
              newYearDates[header] = `${year}-${month}-${day}`;
            }
          }
        });
        
        setYearDates(prev => ({ ...prev, ...newYearDates }));
        setCsvData(newYearDates);
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
    }
  };

  const fetchMarketCap = async (ticker: string, date: string, retries: number = 3) => {
    // Try multiple endpoints including your existing one
    const urls = [
      `${apiBaseUrl}/api/market-cap?ticker=${ticker}&date=${date}`,
      `https://market-cap-api.vercel.app/api/market-cap?ticker=${ticker}&date=${date}`
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

  const startBatchFetch = async () => {
    const tickerList = tickers.trim().split(/\s+/).filter(t => t);
    const selectedYears = getSelectedYears();
    const totalRequests = tickerList.length * selectedYears.length;
    
    if (totalRequests === 0) {
      alert('Please select tickers and valid year range');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    setProgress(0);
    setResults([]);
    setErrors([]);
    setStats({ total: totalRequests, completed: 0, failed: 0 });
    
    abortControllerRef.current = new AbortController();
    
    let completed = 0;
    let failed = 0;
    const newResults: MarketCapData[] = [];
    const newErrors: ErrorData[] = [];

    try {
      for (const ticker of tickerList) {
        for (const year of selectedYears) {
          if (abortControllerRef.current?.signal.aborted) break;
          
          // Check for pause
          while (isPaused && !abortControllerRef.current?.signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          if (abortControllerRef.current?.signal.aborted) break;
          
          setCurrentTicker(ticker);
          setCurrentYear(year);
          
          const date = yearDates[year];
          if (!date) {
            newErrors.push({ ticker, year, error: 'No date found for year' });
            failed++;
            continue;
          }
          
          try {
            const result = await fetchMarketCap(ticker, date);
            
            if (result.success) {
              newResults.push({
                ticker,
                year,
                date,
                ...result.data
              });
              completed++;
            } else {
              newErrors.push({ ticker, year, date, error: result.error });
              failed++;
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') break;
            
            newErrors.push({ ticker, year, date, error: error instanceof Error ? error.message : 'Unknown error' });
            failed++;
          }
          
          const totalProcessed = completed + failed;
          setProgress((totalProcessed / totalRequests) * 100);
          setStats({ total: totalRequests, completed, failed });
          
          // Update results and errors periodically
          if (totalProcessed % 10 === 0 || totalProcessed === totalRequests) {
            setResults([...newResults]);
            setErrors([...newErrors]);
          }
          
          // Rate limiting delay
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
        
        if (abortControllerRef.current?.signal.aborted) break;
      }
    } catch (error) {
      console.error('Batch fetch error:', error);
    }
    
    setResults(newResults);
    setErrors(newErrors);
    setIsRunning(false);
    setCurrentTicker('');
    setCurrentYear('');
  };

  const pauseResume = () => {
    setIsPaused(!isPaused);
  };

  const stopFetch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
    setIsPaused(false);
    setCurrentTicker('');
    setCurrentYear('');
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
        row.push(result ? result[field] || '' : '');
      });
      return row;
    });
    
    return [headers, ...rows];
  };

  const downloadCsv = (data: (string | number)[][], filename: string) => {
    const csvContent = data.map(row => 
      row.map(cell => 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
      ).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPricesCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'price');
    downloadCsv(data, `prices_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportMarketCapCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'market_cap_billions');
    downloadCsv(data, `market_cap_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportSharesCsv = () => {
    if (results.length === 0) return;
    const data = createPivotData(results, 'shares_outstanding');
    downloadCsv(data, `shares_outstanding_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportAllCsvs = () => {
    if (results.length === 0) return;
    
    // Small delay between downloads to ensure they all trigger
    exportPricesCsv();
    setTimeout(() => exportMarketCapCsv(), 100);
    setTimeout(() => exportSharesCsv(), 200);
  };

  const exportErrorsToCsv = () => {
    if (errors.length === 0) return;
    
    const headers = ['Ticker', 'Year', 'Date', 'Error'];
    const csvContent = [
      headers.join(','),
      ...errors.map(error => [
        error.ticker || '',
        error.year || '',
        error.date || '',
        `"${error.error?.replace(/"/g, '""') || ''}"` // Escape quotes in error messages
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market_cap_errors_${startYear}_${endYear}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    stopFetch();
    setResults([]);
    setErrors([]);
    setProgress(0);
    setStats({ total: 0, completed: 0, failed: 0 });
  };

  const selectedYears = getSelectedYears();
  const tickerCount = tickers.trim().split(/\s+/).filter(t => t).length;
  const totalRequests = tickerCount * selectedYears.length;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <TrendingUp className="h-8 w-8 text-blue-600" />
          Enhanced Market Cap Fetcher
        </h1>
        
        {/* API Configuration */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Base URL
          </label>
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="http://localhost:3000"
          />
        </div>

        {/* CSV Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Start-of-Year CSV (Optional)
          </label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              <Upload className="h-4 w-4" />
              Upload CSV
            </button>
            {csvData && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                CSV loaded with {Object.keys(csvData).length} years
              </span>
            )}
          </div>
        </div>

        {/* Year Range Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Year Range
          </label>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Year</label>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
                min="2010"
                max="2025"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Year</label>
              <input
                type="number"
                value={endYear}
                onChange={(e) => setEndYear(Number(e.target.value))}
                min="2010"
                max="2025"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="text-sm text-gray-600 mt-4">
              {selectedYears.length} years selected: {selectedYears.join(', ')}
            </div>
          </div>
        </div>

        {/* Tickers Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stock Tickers (space-separated)
          </label>
          <textarea
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="AAPL MSFT AMZN GOOGL..."
          />
          <p className="text-sm text-gray-500 mt-1">
            {tickerCount} tickers • {selectedYears.length} years • {totalRequests} total requests
          </p>
        </div>

        {/* Delay Configuration */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Delay Between Requests (ms)
          </label>
          <input
            type="number"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            min="0"
            max="5000"
            className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6">
          {!isRunning ? (
            <button
              onClick={startBatchFetch}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={selectedYears.length === 0 || !tickers.trim()}
            >
              <Play className="h-4 w-4" />
              Start Batch Fetch
            </button>
          ) : (
            <>
              <button
                onClick={pauseResume}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={stopFetch}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Stop
              </button>
            </>
          )}
          
          <button
            onClick={resetAll}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>

        {/* Export Controls */}
        {results.length > 0 && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <h3 className="text-lg font-semibold text-green-800 mb-3">Export Data</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportAllCsvs}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
              >
                <Package className="h-4 w-4" />
                Download All 3 CSVs
              </button>
              <button
                onClick={exportPricesCsv}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Prices CSV
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
              {errors.length > 0 && (
                <button
                  onClick={exportErrorsToCsv}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                >
                  <Download className="h-4 w-4" />
                  Export Errors
                </button>
              )}
            </div>
            <p className="text-sm text-green-700 mt-2">
              CSV format: Tickers as rows, years as columns (pivot table ready)
            </p>
          </div>
        )}

        {/* Progress */}
        {isRunning && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {isPaused ? 'Paused' : 'Processing'}: {currentTicker} ({currentYear})
                </span>
              </div>
              <span className="text-sm text-gray-600">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-blue-600">Total Requests</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-green-600">Completed</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-sm text-red-600">Failed</div>
          </div>
        </div>

        {/* Results Preview */}
        {results.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Results ({results.length})
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-left">Ticker</th>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Price</th>
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
                      <td className="px-3 py-2 text-right">${result.market_cap_billions?.toFixed(1)}B</td>
                      <td className="px-3 py-2 text-right">{result.shares_outstanding?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.length > 50 && (
                <p className="text-center text-gray-500 mt-3">
                  Showing first 50 results. Export CSVs for complete data.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Errors Preview */}
        {errors.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Errors ({errors.length})
            </h3>
            <div className="bg-red-50 rounded-lg p-4 max-h-64 overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-red-100">
                    <th className="px-3 py-2 text-left">Ticker</th>
                    <th className="px-3 py-2 text-left">Year</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.slice(0, 20).map((error, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-2 font-medium">{error.ticker}</td>
                      <td className="px-3 py-2">{error.year}</td>
                      <td className="px-3 py-2">{error.date}</td>
                      <td className="px-3 py-2 text-red-600">{error.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errors.length > 20 && (
                <p className="text-center text-gray-500 mt-3">
                  Showing first 20 errors. Export CSV for complete error log.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketCapForm;