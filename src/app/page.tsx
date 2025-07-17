import MarketCapForm from '../components/MarketCapForm';

export const metadata = {
  title: 'Enhanced Market Cap Fetcher',
  description: 'Fetch historical market cap data for multiple tickers across multiple years',
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <MarketCapForm />
    </div>
  );
}