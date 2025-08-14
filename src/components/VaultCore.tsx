import { Shield, Lock, Coins, ArrowUpDown, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { WalletConnector } from "./WalletConnector";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VaultCoreProps {
  walletBalance: string;
  vaultBalance: string;
  currentFee: string;
  onDeposit: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
  // Token display props
  walletTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  vaultTokens: Array<{address: string, symbol: string, balance: string, decimals: number}>;
  isLoadingTokens: boolean;
  refetchWalletTokens: () => void;
  refetchVaultTokens: () => void;
}

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
  refetchVaultTokens
}: VaultCoreProps) => {
  const { isConnected } = useAccount();
  
  // Display mode state
  const [displayMode, setDisplayMode] = useState<'tabs' | 'cards'>('tabs');

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
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  // CARDS Mode Component
  const CardsMode = () => (
    <div className="w-full max-w-md space-y-4">
      {/* Wallet Tokens */}
      <div className="text-center space-y-3">
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
        {isLoadingTokens ? (
          <div className="text-sm text-muted-foreground">Loading tokens...</div>
        ) : walletTokens.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {walletTokens.map((token, index) => (
              <Card key={index} className="bg-background/20 border-border/30 p-3">
                <div className="text-center space-y-1">
                  <div className="text-sm font-semibold text-foreground">{token.symbol}</div>
                  <div className="text-lg font-bold text-vault-warning">
                    {parseFloat(token.balance).toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {token.address.slice(0, 6)}...{token.address.slice(-4)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No tokens found</div>
        )}
      </div>

      {/* Vault Tokens */}
      <div className="text-center space-y-3">
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
        {isLoadingTokens ? (
          <div className="text-sm text-muted-foreground">Loading tokens...</div>
        ) : vaultTokens.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {vaultTokens.map((token, index) => (
              <Card key={index} className="bg-background/20 border-border/30 p-3">
                <div className="text-center space-y-1">
                  <div className="text-sm font-semibold text-foreground">{token.symbol}</div>
                  <div className="text-lg font-bold text-vault-success">
                    {parseFloat(token.balance).toFixed(4)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {token.address.slice(0, 6)}...{token.address.slice(-4)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No tokens in vault</div>
        )}
      </div>
    </div>
  );

  // TABS Mode Component
  const TabsMode = () => (
    <div className="w-full max-w-md">
      <Tabs defaultValue="eth" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="eth">ETH</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>
        
        <TabsContent value="eth" className="space-y-4 mt-4">
          {/* ETH balances remain the same */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
              <div className="text-sm text-muted-foreground">Wallet Balance</div>
              <div className="text-lg sm:text-xl font-bold text-vault-warning break-all">
                {walletBalance} ETH
              </div>
            </div>
            <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
              <div className="text-sm text-muted-foreground">Vault Balance</div>
              <div className="text-lg sm:text-xl font-bold text-vault-success break-all">
                {vaultBalance} ETH
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="tokens" className="space-y-4 mt-4">
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
            {isLoadingTokens ? (
              <div className="text-sm text-muted-foreground">Loading tokens...</div>
            ) : walletTokens.length > 0 ? (
              <div className="space-y-1">
                {walletTokens.map((token, index) => (
                  <div key={index} className="text-xs text-foreground">
                    {token.symbol}: {token.balance}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No tokens found</div>
            )}
          </div>

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
            {isLoadingTokens ? (
              <div className="text-sm text-muted-foreground">Loading tokens...</div>
            ) : vaultTokens.length > 0 ? (
              <div className="space-y-1">
                {vaultTokens.map((token, index) => (
                  <div key={index} className="text-xs text-foreground">
                    {token.symbol}: {token.balance}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">No tokens in vault</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold bg-gradient-vault bg-clip-text text-transparent">
          cyrusthegreat.dev
        </h1>
        <p className="text-xl text-muted-foreground">
          human rights since 539BC
        </p>
        {isConnected && (
          <div className="flex items-center justify-center">
            <WalletConnector />
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
                    src="/lovable-uploads/6c482ff7-4c96-458d-99ec-89ce96a62004.png" 
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground hover:bg-background/20"
                  onClick={() => window.open(`https://sepolia.etherscan.io/address/0x3d6e43cbf157110015edF062173BbeBF78De61B4`, '_blank')}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  View Contract on Etherscan
                </Button>
              </div>
            </div>

            {/* Balance Display */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
              <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Wallet Balance</div>
                <div className="text-lg sm:text-xl font-bold text-vault-warning break-all">
                  {walletBalance} ETH
                </div>
              </div>
              <div className="text-center space-y-2 p-3 bg-background/20 rounded-lg border border-border/30">
                <div className="text-sm text-muted-foreground">Vault Balance</div>
                <div className="text-lg sm:text-xl font-bold text-vault-success break-all">
                  {vaultBalance} ETH
                </div>
              </div>
            </div>

            {/* Dynamic Token Display Section */}
            {isConnected && (
              <>
                {displayMode === 'tabs' && <TabsMode />}
                {displayMode === 'cards' && <CardsMode />}
              </>
            )}

            {/* Fee Info */}
            <div className="text-center px-4">
              <p className="text-xs text-muted-foreground">
                Dynamic fee: ~$0.10 USD • Automatically calculated from Chainlink price feed
              </p>
            </div>
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
      <div className="text-xs text-muted-foreground text-center p-2 bg-muted/20 rounded">
        💡 Console Switcher: <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+1</kbd> for Tabs, <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+2</kbd> for Cards
      </div>
    </div>
  );
};