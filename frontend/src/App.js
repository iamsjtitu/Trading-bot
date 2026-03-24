import '@/App.css';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import useAppState from '@/hooks/useAppState';
import AppHeader from '@/components/AppHeader';
import AppFooter from '@/components/AppFooter';
import PortfolioCards from '@/components/PortfolioCards';
import LivePositions from '@/components/LivePositions';
import NotificationToasts from '@/components/NotificationToasts';
import SettingsPanel from '@/components/SettingsPanel';
import MarketTicker from '@/components/MarketTicker';
import RiskPanel from '@/components/RiskPanel';
import NewsFeed from '@/components/NewsFeed';
import TradesList from '@/components/TradesList';
import SignalsList from '@/components/SignalsList';
import QuickTrade from '@/components/QuickTrade';
import AutoTradingSettings from '@/components/AutoTradingSettings';
import PositionCalculator from '@/components/PositionCalculator';
import TradeHistory from '@/components/TradeHistory';
import TradeAnalytics from '@/components/TradeAnalytics';
import TaxReports from '@/components/TaxReports';
import AIInsights from '@/components/AIInsights';
import TechnicalAnalysis from '@/components/TechnicalAnalysis';
import OptionChain from '@/components/OptionChain';
import TradeJournal from '@/components/TradeJournal';
import UpdateBanner from '@/components/UpdateBanner';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import AIGuards from '@/components/AIGuards';
import SystemHealth from '@/components/SystemHealth';

function App() {
  const state = useAppState();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 text-gray-900">
      <UpdateBanner />

      <AppHeader
        tradingMode={state.tradingMode}
        brokerConnected={state.brokerConnected}
        brokerProfile={state.brokerProfile}
        wsConnected={state.wsConnected}
        autoAnalyze={state.autoAnalyze}
        setAutoAnalyze={state.setAutoAnalyze}
        nextAnalysis={state.nextAnalysis}
        formatCountdown={state.formatCountdown}
        setShowSettings={state.setShowSettings}
        loading={state.loading}
        loadData={state.loadData}
        fetchingNews={state.fetchingNews}
        fetchNewNews={state.fetchNewNews}
      />

      <div className="container mx-auto px-4 py-6">
        {/* LIVE Trading Warning */}
        {state.tradingMode === 'LIVE' && (
          <div className={`p-4 rounded-lg mb-4 shadow-lg border-2 ${state.brokerConnected ? 'bg-gradient-to-r from-red-600 to-orange-600 border-red-700' : 'bg-gradient-to-r from-yellow-500 to-orange-500 border-yellow-600'} text-white`} data-testid="live-trading-warning">
            <div className="flex items-center gap-3">
              <div className="text-3xl">!</div>
              <div className="flex-1">
                {state.brokerConnected ? (
                  <>
                    <h3 className="font-bold text-lg">LIVE TRADING MODE - CONNECTED</h3>
                    <p className="text-sm">Real money trades active. Market data is LIVE.</p>
                  </>
                ) : (
                  <>
                    <h3 className="font-bold text-lg">LIVE MODE - NOT CONNECTED</h3>
                    <p className="text-sm">Go to Settings &gt; Broker to login to your Broker and start live trading.</p>
                  </>
                )}
              </div>
              <Button onClick={() => state.setShowSettings(true)} className="bg-white text-red-600 hover:bg-gray-100">Settings</Button>
            </div>
          </div>
        )}

        <MarketStatusBanner />
        <MarketTicker marketIndices={state.marketIndices} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} />

        <NotificationToasts notifications={state.notifications} setNotifications={state.setNotifications} />

        <RiskPanel riskMetrics={state.riskMetrics} emergencyStop={state.emergencyStop} onEmergencyStop={state.handleEmergencyStop} formatCurrency={state.formatCurrency} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} stoploss_pct={state.autoSettings.stoploss_pct} />
        <AutoTradingSettings autoSettings={state.autoSettings} showAutoSettings={state.showAutoSettings} setShowAutoSettings={state.setShowAutoSettings} updateAutoSettings={state.updateAutoSettings} onDebug={state.runAutoTradeDebug} onExecuteSignal={state.executeLatestSignal} debugResult={state.debugResult} />
        <AIGuards />

        <PortfolioCards displayPortfolio={state.displayPortfolio} stats={state.stats} tradingMode={state.tradingMode} formatCurrency={state.formatCurrency} />

        {/* Main Content Tabs */}
        <Tabs defaultValue="news" value={state.activeTab} onValueChange={state.setActiveTab} className="space-y-4">
          <TabsList className="bg-white border-gray-200 shadow-sm">
            <TabsTrigger value="news" data-testid="news-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">News Feed</TabsTrigger>
            <TabsTrigger value="quick-trade" data-testid="quick-trade-tab" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900 font-bold">Quick Trade</TabsTrigger>
            <TabsTrigger value="signals" data-testid="signals-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Signals</TabsTrigger>
            <TabsTrigger value="trades" data-testid="trades-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Active Trades</TabsTrigger>
            <TabsTrigger value="history" data-testid="history-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Trade History</TabsTrigger>
            <TabsTrigger value="calculator" data-testid="calculator-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Calculator</TabsTrigger>
            <TabsTrigger value="analytics" data-testid="analytics-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Trade Analytics</TabsTrigger>
            <TabsTrigger value="tax" data-testid="tax-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Tax Reports</TabsTrigger>
            <TabsTrigger value="ai-insights" data-testid="ai-insights-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">AI Brain</TabsTrigger>
            <TabsTrigger value="technical" data-testid="technical-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Technical</TabsTrigger>
            <TabsTrigger value="option-chain" data-testid="option-chain-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">Option Chain</TabsTrigger>
            <TabsTrigger value="journal" data-testid="journal-tab" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">AI Journal</TabsTrigger>
            <TabsTrigger value="system-health" data-testid="system-health-tab" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900">System Health</TabsTrigger>
          </TabsList>

          <TabsContent value="news"><NewsFeed news={state.news} formatTime={state.formatTime} onRefresh={state.loadData} /></TabsContent>
          <TabsContent value="quick-trade"><QuickTrade tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} formatCurrency={state.formatCurrency} onTradeExecuted={state.loadData} /></TabsContent>
          <TabsContent value="signals"><SignalsList signals={state.signals} formatCurrency={state.formatCurrency} formatTime={state.formatTime} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} onTradeExecuted={state.loadData} /></TabsContent>
          <TabsContent value="trades"><TradesList trades={state.displayTrades} formatCurrency={state.formatCurrency} formatTime={state.formatTime} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} onManualExit={state.handleManualExit} /></TabsContent>
          <TabsContent value="history"><TradeHistory formatCurrency={state.formatCurrency} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} brokerOrders={state.brokerOrders} /></TabsContent>
          <TabsContent value="calculator"><PositionCalculator riskMetrics={state.riskMetrics} formatCurrency={state.formatCurrency} /></TabsContent>
          <TabsContent value="analytics"><TradeAnalytics tradingMode={state.tradingMode} /></TabsContent>
          <TabsContent value="tax"><TaxReports formatCurrency={state.formatCurrency} /></TabsContent>
          <TabsContent value="ai-insights"><AIInsights /></TabsContent>
          <TabsContent value="technical"><TechnicalAnalysis /></TabsContent>
          <TabsContent value="option-chain"><OptionChain /></TabsContent>
          <TabsContent value="journal"><TradeJournal tradingMode={state.tradingMode} /></TabsContent>
          <TabsContent value="system-health"><SystemHealth /></TabsContent>
        </Tabs>

        <LivePositions trades={state.trades} tradingMode={state.tradingMode} brokerConnected={state.brokerConnected} formatCurrency={state.formatCurrency} />
      </div>

      <AppFooter tradingMode={state.tradingMode} appVersion={state.appVersion} />

      {state.showSettings && (
        <SettingsPanel
          onClose={() => state.setShowSettings(false)}
          onSave={() => { state.setShowSettings(false); state.loadData(); state.loadAutoSettings(); }}
        />
      )}
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
