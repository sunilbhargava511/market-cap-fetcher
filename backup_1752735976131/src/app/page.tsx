import MarketCapForm from '@/components/MarketCapForm'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            📊 Market Cap Fetcher
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Get real-time and historical market capitalization data for any stock ticker. 
            Enter a ticker symbol and date to see the company's market value.
          </p>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-8">
          <MarketCapForm />
        </div>
        
        <div className="mt-12 text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="bg-white/50 backdrop-blur rounded-lg p-6">
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="font-semibold text-gray-900 mb-2">Any Ticker</h3>
              <p className="text-gray-600 text-sm">
                Search US and international stocks with automatic exchange detection
              </p>
            </div>
            <div className="bg-white/50 backdrop-blur rounded-lg p-6">
              <div className="text-3xl mb-2">📅</div>
              <h3 className="font-semibold text-gray-900 mb-2">Any Date</h3>
              <p className="text-gray-600 text-sm">
                Get historical market cap data for any trading day
              </p>
            </div>
            <div className="bg-white/50 backdrop-blur rounded-lg p-6">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="font-semibold text-gray-900 mb-2">Real-time</h3>
              <p className="text-gray-600 text-sm">
                Live calculations using current shares outstanding
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
