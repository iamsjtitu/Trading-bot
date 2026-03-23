export default function AppFooter({ tradingMode, appVersion }) {
  return (
    <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-8 py-4 shadow-sm">
      <div className="container mx-auto px-4 text-center text-sm text-gray-600">
        <p>{tradingMode === 'LIVE' ? 'LIVE TRADING' : 'Paper Trading'} Mode | AI-Powered Options Trading Bot | v{appVersion || '...'}</p>
        <p className="text-xs text-gray-400 mt-1">Designed By : <a href="https://www.9x.Design" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">https://www.9x.Design</a> | Contact Us: +91 72059 30002</p>
        <p className="text-xs mt-1 text-gray-500">Trading involves risk. Past performance does not guarantee future results.</p>
      </div>
    </footer>
  );
}
