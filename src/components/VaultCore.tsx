import { Shield, Lock, Coins, ArrowUpDown, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletConnector } from "./WalletConnector";
import { useAccount } from "wagmi";
import { switchToChain, getActiveChainInfo, getChainConfig } from "@/config/web3";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface VaultCoreProps {
  walletBalance: string;
  vaultBalance: string;
  currentFee: string;
  isLoading: boolean;
  isSimulating?: boolean;
  isTransactionConfirmed?: boolean;
  // ETH operation handlers
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  // Token operation handlers
  onTokenDeposit: (token: { symbol: string; address: string; balance: string }) => void;
  onTokenWithdraw: (token: { symbol: string; address: string; balance: string }) => void;
  onTokenTransfer: (token: { symbol: string; address: string; balance: string }) => void;
  // Token display props
  walletTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  vaultTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  isLoadingTokens: boolean;
  refetchWalletTokens: () => void;
  refetchVaultTokens: () => void;
  // Chain switching props
  activeChain: 'ETH' | 'BSC';
  setActiveChain: (chain: 'ETH' | 'BSC') => void;
}

// Add animated chain cycling state
const useAnimatedChainDisplay = () => {
  const [currentDisplayChain, setCurrentDisplayChain] = useState<'ETH' | 'BSC'>('ETH');
  const [currentMessage, setCurrentMessage] = useState(0);
  
  const vaultMessages = [
    "Securing the royal vault...",
    "Protecting the empire's wealth...",
    "Guarding ancient secrets..."
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDisplayChain(prev => prev === 'ETH' ? 'BSC' : 'ETH');
      setCurrentMessage(prev => (prev + 1) % vaultMessages.length);
    }, 3000); // Switch every 3 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return { currentDisplayChain, currentMessage: vaultMessages[currentMessage] };
};

export const VaultCore = ({ 
  walletBalance, 
  vaultBalance, 
  currentFee,
  onDeposit, 
  onWithdraw, 
  onTransfer,
  // Token display props
  walletTokens,
  vaultTokens,
  isLoadingTokens,
  refetchWalletTokens,
  refetchVaultTokens,
  // Token deposit handler
  onTokenDeposit,
  // Token withdraw handler
  onTokenWithdraw,
  // Token transfer handler
  onTokenTransfer,
  // Chain switching props
  activeChain,
  setActiveChain
}: VaultCoreProps) => {
  const { isConnected } = useAccount();
  
  // Display mode state
  const [displayMode, setDisplayMode] = useState<'tabs' | 'cards' | 'tabbed-cards' | 'native-tokens'>('tabs');
  
  // CRITICAL FIX: Add state to track active tab and prevent automatic switching
  const [activeTab, setActiveTab] = useState<'wallet' | 'vault'>('wallet');
  
  // Debug: Log when activeTab changes
  useEffect(() => {
    console.log(`🎯 Active tab changed to: ${activeTab}`);
  }, [activeTab]);
  
  // Chain switching state
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  
  // Get current network info
  const currentNetwork = getActiveChainInfo();

  // Animated chain display for disconnected state
  const { currentDisplayChain, currentMessage } = useAnimatedChainDisplay();

  // State for token deposit modal
  const [tokenDepositInfo, setTokenDepositInfo] = useState<{
    symbol: string;
    address: string;
    balance: string;
  } | null>(null);

  // Handle token deposit click
  const handleTokenDeposit = (token: { symbol: string; address: string; balance: string }) => {
    onTokenDeposit(token);
  };

  // Handle token withdraw click
  const handleTokenWithdraw = (token: { symbol: string; address: string; balance: string }) => {
    onTokenWithdraw(token);
  };

  // Handle token transfer click
  const handleTokenTransfer = (token: { symbol: string; address: string; balance: string }) => {
    onTokenTransfer(token);
  };

  // Handle chain switching
  const handleChainSwitch = async (targetChain: 'ETH' | 'BSC') => {
    if (targetChain === activeChain || isSwitchingChain) return;
    
    console.log(`🔄 Chain switch initiated: ${activeChain} → ${targetChain}`);
    setIsSwitchingChain(true);
    
    try {
      const success = await switchToChain(targetChain);
      if (success) {
        console.log(`✅ MetaMask switched to ${targetChain} successfully`);
        setActiveChain(targetChain);
        console.log(`✅ Frontend activeChain updated to ${targetChain}`);
        
        // Trigger chain-specific data fetching
        // Note: This will be handled by the useVault hook when activeChain changes
        console.log(`🔄 Triggering data refresh for ${targetChain}...`);
      }
    } catch (error) {
      console.error(`❌ Failed to switch to ${targetChain}:`, error);
    } finally {
      setIsSwitchingChain(false);
      console.log(`🔄 Chain switching completed for ${targetChain}`);
    }
  };

  // NativeTokensMode Component
  const NativeTokensMode = () => {
    const chainConfig = getChainConfig(activeChain);
    
    return (
      <div className="w-full">
        <Tabs defaultValue="native" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="native">Native</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
          </TabsList>
          
          <TabsContent value="native" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Native Wallet Balance</div>
                <div className="text-lg sm:text-xl font-bold text-vault-warning break-all">
                  {walletBalance} {chainConfig.nativeCurrency.symbol}
                </div>
              </div>
              <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Native Vault Balance</div>
                <div className="text-lg sm:text-xl font-bold text-vault-success break-all">
                  {vaultBalance} {chainConfig.nativeCurrency.symbol}
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="tokens" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Wallet Tokens Section */}
              <div className="space-y-4">
                <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    Wallet Tokens ({walletTokens.length})
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-background/40"
                      onClick={refetchWalletTokens}
                      disabled={isLoadingTokens}
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
                
                {/* Scrollable Wallet Tokens Container */}
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                  {isLoadingTokens ? (
                    <div className="text-center p-4 text-muted-foreground">Loading tokens...</div>
                  ) : walletTokens.length > 0 ? (
                    walletTokens.map((token, index) => (
                      <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                        <div className="space-y-3">
                          {/* Token Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-vault-warning/20 rounded-full flex items-center justify-center">
                                <span className="text-sm font-medium text-vault-warning">{token.symbol.charAt(0)}</span>
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">{token.symbol}</div>
                                <div className="text-sm text-vault-warning font-bold">{token.balance}</div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="bg-vault-warning hover:bg-vault-warning/80 text-white"
                              onClick={() => handleTokenDeposit(token)}
                            >
                              Deposit
                            </Button>
                          </div>
                          
                          {/* Contract Address - Clickable */}
                          <div className="text-center">
                            <a
                              href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              {token.address.slice(0, 6)}...{token.address.slice(-4)}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 text-muted-foreground">No tokens found</div>
                  )}
                </div>
              </div>

              {/* Vault Tokens Section */}
              <div className="space-y-4">
                <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    Vault Tokens ({vaultTokens.length})
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-background/40"
                      onClick={refetchVaultTokens}
                      disabled={isLoadingTokens}
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
                
                {/* Scrollable Vault Tokens Container */}
                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                  {isLoadingTokens ? (
                    <div className="text-center p-4 text-muted-foreground">Loading tokens...</div>
                  ) : vaultTokens.length > 0 ? (
                    vaultTokens.map((token, index) => (
                      <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                        <div className="space-y-3">
                          {/* Token Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-vault-success/20 rounded-full flex items-center justify-center">
                                <span className="text-sm font-medium text-vault-success">{token.symbol.charAt(0)}</span>
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">{token.symbol}</div>
                                <div className="text-sm text-vault-success font-bold">{token.balance}</div>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-vault-success text-vault-success hover:bg-vault-success hover:text-white"
                                onClick={() => handleTokenWithdraw(token)}
                              >
                                Withdraw
                              </Button>
                              <Button
                                size="sm"
                                className="bg-vault-success hover:bg-vault-success/80 text-white"
                                onClick={() => onTokenTransfer(token)}
                              >
                                Transfer
                              </Button>
                            </div>
                          </div>
                          
                          {/* Contract Address - Clickable */}
                          <div className="text-center">
                            <a
                              href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            >
                              {token.address.slice(0, 6)}...{token.address.slice(-4)}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-4 text-muted-foreground">No tokens in vault</div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  // CARDS Mode Component
  const CardsMode = () => {
    const chainConfig = getChainConfig(activeChain);
    
    return (
    <div className="w-full">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Wallet Tokens Section */}
        <div className="space-y-4">
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Wallet Tokens ({walletTokens.length})
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchWalletTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Scrollable Wallet Tokens Container */}
          <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
            {isLoadingTokens ? (
              <div className="text-center p-4 text-muted-foreground">Loading tokens...</div>
            ) : walletTokens.length > 0 ? (
              walletTokens.map((token, index) => (
                <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                  <div className="space-y-3">
                    {/* Token Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-vault-warning/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-vault-warning">{token.symbol.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{token.symbol}</div>
                          <div className="text-sm text-vault-warning font-bold">{token.balance}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-vault-warning hover:bg-vault-warning/80 text-white"
                        onClick={() => handleTokenDeposit(token)}
                      >
                        Deposit
                      </Button>
                    </div>
                    
                    {/* Contract Address - Clickable */}
                    <div className="text-center">
                      <a
                        href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-4 text-muted-foreground">No tokens found</div>
            )}
          </div>
        </div>

        {/* Vault Tokens Section */}
        <div className="space-y-4">
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Vault Tokens ({vaultTokens.length})
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchVaultTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Scrollable Vault Tokens Container */}
          <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
            {isLoadingTokens ? (
              <div className="text-center p-4 text-muted-foreground">Loading tokens...</div>
            ) : vaultTokens.length > 0 ? (
              vaultTokens.map((token, index) => (
                <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                  <div className="space-y-3">
                    {/* Token Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-vault-success/20 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-vault-success">{token.symbol.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{token.symbol}</div>
                          <div className="text-sm text-vault-success font-bold">{token.balance}</div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-vault-success text-vault-success hover:bg-vault-success hover:text-white"
                          onClick={() => handleTokenWithdraw(token)}
                        >
                          Withdraw
                        </Button>
                        <Button
                          size="sm"
                          className="bg-vault-success hover:bg-vault-success/80 text-white"
                          onClick={() => onTokenTransfer(token)}
                        >
                          Transfer
                        </Button>
                      </div>
                    </div>
                    
                    {/* Contract Address - Clickable */}
                    <div className="text-center">
                      <a
                        href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </a>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-4 text-muted-foreground">No tokens in vault</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

  // TABS Mode Component
  const TabsMode = () => {
    const chainConfig = getChainConfig(activeChain);
    
    // Handler for tab changes
    const handleTabChange = (value: string) => {
      console.log(`🔄 Tab switching from ${activeTab} to ${value}`);
      setActiveTab(value as 'wallet' | 'vault');
    };
    
    return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="wallet">Wallet Tokens ({walletTokens.length})</TabsTrigger>
          <TabsTrigger value="vault">Vault Tokens ({vaultTokens.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="wallet" className="space-y-4 mt-4">
          {/* Wallet Tokens */}
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Wallet Tokens
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchWalletTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            {walletTokens.map((token, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-vault-warning/20 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-vault-warning">{token.symbol.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="font-medium">{token.symbol}</div>
                    <a
                      href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {token.address.slice(0, 6)}...{token.address.slice(-4)}
                    </a>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right mr-3">
                    <div className="font-semibold text-vault-warning">{token.balance}</div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-vault-warning hover:bg-vault-warning/80 text-white"
                    onClick={() => handleTokenDeposit(token)}
                  >
                    Deposit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="vault" className="space-y-4 mt-4">
          {/* Vault Tokens */}
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Vault Tokens
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchVaultTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            {vaultTokens.map((token, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-vault-success/20 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-vault-success">{token.symbol.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="font-medium">{token.symbol}</div>
                    <a
                      href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      {token.address.slice(0, 6)}...{token.address.slice(-4)}
                    </a>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="text-right mr-3">
                    <div className="font-semibold text-vault-success">{token.balance}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-vault-success text-vault-success hover:bg-vault-success hover:text-white"
                    onClick={() => handleTokenWithdraw(token)}
                  >
                    Withdraw
                  </Button>
                  <Button
                    size="sm"
                    className="bg-vault-success hover:bg-vault-success/80 text-white"
                    onClick={() => onTokenTransfer(token)}
                  >
                    Transfer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

  // TABBED-CARDS Mode Component (Combines cards with tabs)
  const TabbedCardsMode = () => {
    const chainConfig = getChainConfig(activeChain);
    
    return (
    <div className="w-full">
      <Tabs defaultValue="wallet" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="wallet">Wallet Tokens ({walletTokens.length})</TabsTrigger>
          <TabsTrigger value="vault">Vault Tokens ({vaultTokens.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="wallet" className="mt-4">
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30 mb-4">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Wallet Tokens
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchWalletTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Grid of Wallet Token Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {isLoadingTokens ? (
              <div className="col-span-full text-center p-8 text-muted-foreground">Loading tokens...</div>
            ) : walletTokens.length > 0 ? (
              walletTokens.map((token, index) => (
                <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 bg-vault-warning/20 rounded-full flex items-center justify-center mx-auto">
                      <span className="text-lg font-medium text-vault-warning">{token.symbol.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{token.symbol}</div>
                      <div className="text-lg font-bold text-vault-warning">{token.balance}</div>
                      <a
                        href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer block mt-1"
                      >
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </a>
                    </div>
                    <Button
                      size="sm"
                      className="w-full bg-vault-warning hover:bg-vault-warning/80 text-white"
                      onClick={() => handleTokenDeposit(token)}
                    >
                      Deposit
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center p-8 text-muted-foreground">No tokens found</div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="vault" className="mt-4">
          <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30 mb-4">
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              Vault Tokens
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-background/40"
                onClick={refetchVaultTokens}
                disabled={isLoadingTokens}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingTokens ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {/* Grid of Vault Token Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {isLoadingTokens ? (
              <div className="col-span-full text-center p-8 text-muted-foreground">Loading tokens...</div>
            ) : vaultTokens.length > 0 ? (
              vaultTokens.map((token, index) => (
                <div key={index} className="p-4 bg-background/20 rounded-lg border border-border/30 hover:bg-background/40 transition-colors">
                  <div className="text-center space-y-3">
                    <div className="w-12 h-12 bg-vault-success/20 rounded-full flex items-center justify-center mx-auto">
                      <span className="text-lg font-medium text-vault-success">{token.symbol.charAt(0)}</span>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{token.symbol}</div>
                      <div className="text-lg font-bold text-vault-success">{token.balance}</div>
                      <a
                        href={`${chainConfig.etherscanUrl}/address/${token.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer block mt-1"
                      >
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </a>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-vault-success text-vault-success hover:bg-vault-success hover:text-white"
                        onClick={() => handleTokenWithdraw(token)}
                      >
                        Withdraw
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-vault-success hover:bg-vault-success/80 text-white"
                        onClick={() => onTokenTransfer(token)}
                      >
                        Transfer
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center p-8 text-muted-foreground">No tokens in vault</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

  // Console switcher for testing different display modes
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case '1':
            event.preventDefault();
            setDisplayMode('tabs');
            console.log('🎯 Switched to TABS mode');
            break;
          case '2':
            event.preventDefault();
            setDisplayMode('cards');
            console.log('🎯 Switched to CARDS mode');
            break;
          case '3':
            event.preventDefault();
            setDisplayMode('tabbed-cards');
            console.log('🎯 Switched to TABBED-CARDS mode');
            break;
          case '4':
            event.preventDefault();
            setDisplayMode('native-tokens');
            console.log('🎯 Switched to NATIVE/TOKENS mode');
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-6 py-4">
        <h1 className="text-5xl font-bold bg-gradient-vault bg-clip-text text-transparent px-4 py-2">
          cyrusthegreat.dev
        </h1>
        <p className="text-xl text-muted-foreground">
          human rights since 539BC
        </p>
        {isConnected && (
          <div className="flex flex-col items-center space-y-4">
            <WalletConnector />
            
            {/* Chain Switcher - Icons Only */}
            <div className="flex justify-center space-x-2">
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  activeChain === 'ETH' 
                    ? 'text-white bg-vault-primary border border-vault-primary' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => handleChainSwitch('ETH')}
                title={`Ethereum ${currentNetwork.networkMode === 'mainnet' ? 'Mainnet' : 'Testnet'} (Click to switch)`}
              >
                {currentNetwork.networkMode === 'mainnet' ? 'ETH' : 'tETH'}
              </div>
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  activeChain === 'BSC' 
                    ? 'text-white bg-vault-primary border border-vault-primary' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => handleChainSwitch('BSC')}
                title={`Binance Chain ${currentNetwork.networkMode === 'mainnet' ? 'Mainnet' : 'Testnet'} (Click to switch)`}
              >
                {currentNetwork.networkMode === 'mainnet' ? 'BSC' : 'tBSC'}
              </div>
              <div className="w-8 h-8 p-0 flex items-center justify-center text-xs font-mono text-muted-foreground/50 bg-transparent border border-muted/30 rounded cursor-not-allowed" title="Base (Coming Soon)">
                BASE
              </div>
              <div className="w-8 h-8 p-0 flex items-center justify-center text-xs font-mono text-muted-foreground/50 bg-transparent border border-muted/30 rounded cursor-not-allowed" title="Solana (Coming Soon)">
                SOL
              </div>
            </div>

            {/* Current Chain Info */}
            <div className="text-center text-xs text-muted-foreground">
              <div className="flex items-center justify-center space-x-2">
                <span>Active: {activeChain}</span>
                <span>•</span>
                <span>{currentNetwork.networkMode.toUpperCase()}</span>
              </div>
              {!isConnected && (
                <div className="mt-1 text-xs text-vault-warning animate-pulse">
                  🗝️ Royal Vault • {currentDisplayChain} • {currentNetwork.networkMode === 'mainnet' ? 'Mainnet' : 'Testnet'}
                </div>
              )}
            </div>

            {/* Chain Switching Status */}
            {isSwitchingChain && (
              <div className="flex items-center space-x-2 text-xs text-vault-warning">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Switching to {activeChain === 'ETH' ? 'Binance Chain' : 'Ethereum'}...</span>
              </div>
            )}

            {/* Display Mode Switcher - Icons Only */}
            <div className="flex justify-center space-x-2">
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  displayMode === 'tabs' 
                    ? 'text-white bg-vault-warning border border-vault-warning' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => setDisplayMode('tabs')}
                title="Tabs Mode"
              >
                📋
              </div>
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  displayMode === 'cards' 
                    ? 'text-white bg-vault-warning border border-vault-warning' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => setDisplayMode('cards')}
                title="Cards Mode"
              >
                🎴
              </div>
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  displayMode === 'tabbed-cards' 
                    ? 'text-white bg-vault-warning border border-vault-warning' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => setDisplayMode('tabbed-cards')}
                title="Tabbed-Cards Mode"
              >
                🎯
              </div>
              <div 
                className={`w-8 h-8 p-0 flex items-center justify-center text-xs font-mono rounded cursor-pointer transition-all duration-200 ${
                  displayMode === 'native-tokens' 
                    ? 'text-white bg-vault-warning border border-vault-warning' 
                    : 'text-muted-foreground/50 bg-transparent border border-muted/30 hover:bg-background/20'
                }`}
                onClick={() => setDisplayMode('native-tokens')}
                title="Native/Tokens Mode"
              >
                ⚡
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Central Vault */}
      <div className="relative">
        {/* Vault Container */}
        <Card className="relative bg-gradient-card border-vault-primary/30 p-12 vault-glow vault-float">
          <div className="absolute inset-0 bg-gradient-glow rounded-lg opacity-50"></div>
          <div className="relative z-10 flex flex-col items-center space-y-6">
            {/* Cyrus Portrait */}
            <div className="relative">
              <div className="w-32 h-32 bg-gradient-vault rounded-full p-1 vault-rotate">
                <div className="w-full h-full rounded-full overflow-hidden bg-gradient-card">
                  <img 
                    src="/ctg.png" 
                    alt="Cyrus the Great" 
                    className="w-full h-full object-cover filter sepia-[0.3] contrast-110"
                  />
                </div>
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-vault-success rounded-full flex items-center justify-center">
                <Lock className="w-4 h-4 text-primary-foreground" />
              </div>
            </div>

            {/* Vault Status */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Secure Vault</h2>
              <p className="text-sm text-muted-foreground">Anonymous • Secure • Decentralized</p>
              
              {/* Contract Link */}
              <div className="pt-2">
                {isConnected ? (
                  // When connected, show only the active chain contract link
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground hover:bg-background/20"
                    onClick={() => {
                      const chainConfig = getChainConfig(activeChain);
                      window.open(`${chainConfig.etherscanUrl}/address/${chainConfig.contractAddress}`, '_blank');
                    }}
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    View Contract on {activeChain === 'ETH' ? 'Etherscan' : 'BscScan'}
                  </Button>
                ) : (
                  // When disconnected, show both contract links
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground hover:bg-background/20"
                      onClick={() => {
                        const ethConfig = getChainConfig('ETH');
                        window.open(`${ethConfig.etherscanUrl}/address/${ethConfig.contractAddress}`, '_blank');
                      }}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      View ETH Contract
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground hover:bg-background/20"
                      onClick={() => {
                        const bscConfig = getChainConfig('BSC');
                        window.open(`${bscConfig.etherscanUrl}/address/${bscConfig.contractAddress}`, '_blank');
                      }}
                    >
                      <Shield className="w-3 h-3 mr-1" />
                      View BSC Contract
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ETH Balances - Only show when NOT in native-tokens mode */}
            {displayMode !== 'native-tokens' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Wallet Balance</div>
                  <div className="text-lg sm:text-xl font-bold text-vault-warning break-all transition-all duration-1000 ease-in-out">
                    {isConnected 
                      ? `${walletBalance} ${getChainConfig(activeChain).nativeCurrency.symbol}`
                      : `0 ${getChainConfig(currentDisplayChain).nativeCurrency.symbol}`
                    }
                    {!isConnected && (
                      <div className="text-xs text-muted-foreground mt-1 animate-pulse">
                        {currentMessage}
                      </div>
                    )}
                  </div>
              </div>
                <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Vault Balance</div>
                  <div className="text-lg sm:text-xl font-bold text-vault-success break-all transition-all duration-1000 ease-in-out">
                    {isConnected 
                      ? `${vaultBalance} ${getChainConfig(activeChain).nativeCurrency.symbol}`
                      : `0 ${getChainConfig(currentDisplayChain).nativeCurrency.symbol}`
                    }
                    {!isConnected && (
                      <div className="text-xs text-muted-foreground mt-1 animate-pulse">
                        {currentMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dynamic Token Display Section */}
            <div className="w-full max-w-4xl">
              {isConnected && (
                <>
                  {displayMode === 'tabs' && <TabsMode />}
                  {displayMode === 'cards' && <CardsMode />}
                  {displayMode === 'tabbed-cards' && <TabbedCardsMode />}
                  {displayMode === 'native-tokens' && <NativeTokensMode />}
                </>
              )}
            </div>

            {/* Fee Info */}
            {isConnected && (
              <div className="text-center px-4">
                <p className="text-xs text-muted-foreground">
                  Dynamic fee: ~$0.10 USD • Automatically calculated from Chainlink price feed
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 flex gap-4">
          <Button 
            variant="default" 
            className="bg-vault-primary hover:bg-vault-primary/90 text-primary-foreground shadow-glow"
            onClick={onDeposit}
            disabled={!isConnected}
          >
            <Coins className="w-4 h-4 mr-2" />
            Deposit
          </Button>
          <Button 
            variant="secondary" 
            className="bg-secondary hover:bg-secondary/90"
            onClick={onWithdraw}
            disabled={!isConnected}
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Withdraw
          </Button>
          <Button 
            variant="outline" 
            className="border-vault-secondary text-vault-secondary hover:bg-vault-secondary hover:text-primary-foreground"
            onClick={onTransfer}
            disabled={!isConnected}
          >
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Transfer
          </Button>
        </div>
      </div>

      {/* Connect Wallet */}
      {!isConnected && (
        <div className="text-center space-y-4">
          <WalletConnector />
        </div>
      )}

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-16">
        <Card className="bg-gradient-card border-border/50 p-6 text-center">
          <Shield className="w-8 h-8 text-vault-primary mx-auto mb-3" />
          <h3 className="font-semibold mb-2">Anonymous Transfers</h3>
          <p className="text-sm text-muted-foreground">
            Transfer assets within the vault without revealing sender or receiver
          </p>
        </Card>
        
        <Card className="bg-gradient-card border-border/50 p-6 text-center">
          <Lock className="w-8 h-8 text-vault-secondary mx-auto mb-3" />
          <h3 className="font-semibold mb-2">Secure Storage</h3>
          <p className="text-sm text-muted-foreground">
            Your assets are protected by smart contract security
          </p>
        </Card>
        
        <Card className="bg-gradient-card border-border/50 p-6 text-center">
          <Coins className="w-8 h-8 text-vault-success mx-auto mb-3" />
          <h3 className="font-semibold mb-2">Multi-Asset Support</h3>
          <p className="text-sm text-muted-foreground">
            Support for ETH and ERC20 tokens with future Solana integration
          </p>
        </Card>
      </div>

      {/* Console Instructions */}
      {isConnected && (
        <div className="text-xs text-muted-foreground text-center p-2 bg-muted/20 rounded">
          💡 Switch modes: Use buttons above or <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+1</kbd> for Tabs, <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+2</kbd> for Cards, <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+3</kbd> for Tabbed-Cards, <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+4</kbd> for Native/Tokens
        </div>
      )}

      {/* v1.0 Release Information */}
      <div className="text-xs text-muted-foreground text-center p-2 bg-muted/20 rounded">
        🚀 <strong>v1.20 Release</strong> - ETH and BNB Chain working - Solana Chain Soon
      </div>

      {/* Made by humanperzeus */}
      <div className="text-xs text-muted-foreground text-center p-2">
        made by <a href="https://x.com/humanperzeus" target="_blank" rel="noopener noreferrer" className="text-vault-primary hover:text-vault-primary/80 transition-colors">@humanperzeus</a>
      </div>
    </div>
  );
};