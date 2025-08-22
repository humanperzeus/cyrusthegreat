/**
 * EnhancedTokenSelection - High Priority Feature
 * Advanced token selection with search, filtering, and token bundles
 */

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Filter,
  Star,
  TrendingUp,
  Shield,
  Zap,
  Plus,
  CheckCircle
} from "lucide-react";

interface Token {
  address: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
  logoURI?: string;
  priceUSD?: number;
  volume24h?: number;
  verified?: boolean;
  trending?: boolean;
}

interface TokenBundle {
  id: string;
  name: string;
  description: string;
  tokens: Token[];
  category: 'popular' | 'stable' | 'defi' | 'custom';
}

interface EnhancedTokenSelectionProps {
  tokens: Token[];
  selectedTokens: Token[];
  onTokenSelect: (token: Token) => void;
  onTokenDeselect: (token: Token) => void;
  maxSelection?: number;
  showBalances?: boolean;
  showPrices?: boolean;
  onBundleSelect?: (bundle: TokenBundle) => void;
}

const predefinedBundles: TokenBundle[] = [
  {
    id: 'stablecoins',
    name: 'Stablecoins',
    description: 'USDC, USDT, DAI - Low volatility',
    category: 'stable',
    tokens: []
  },
  {
    id: 'popular',
    name: 'Popular Tokens',
    description: 'Most traded tokens',
    category: 'popular',
    tokens: []
  },
  {
    id: 'defi',
    name: 'DeFi Tokens',
    description: 'Decentralized Finance tokens',
    category: 'defi',
    tokens: []
  }
];

export function EnhancedTokenSelection({
  tokens,
  selectedTokens,
  onTokenSelect,
  onTokenDeselect,
  maxSelection = 25,
  showBalances = true,
  showPrices = true,
  onBundleSelect
}: EnhancedTokenSelectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "balance" | "price" | "volume">("name");

  const categories = [
    { value: "all", label: "All Tokens" },
    { value: "native", label: "Native Currency" },
    { value: "verified", label: "Verified" },
    { value: "trending", label: "Trending" },
    { value: "stable", label: "Stablecoins" },
    { value: "defi", label: "DeFi" }
  ];

  const filteredAndSortedTokens = useMemo(() => {
    let filtered = tokens.filter(token => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (!token.symbol.toLowerCase().includes(searchLower) &&
            !token.name.toLowerCase().includes(searchLower) &&
            !token.address.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Category filter
      switch (selectedCategory) {
        case "native":
          return token.isNative;
        case "verified":
          return token.verified;
        case "trending":
          return token.trending;
        case "stable":
          return token.symbol.includes("USD") || ["USDC", "USDT", "DAI", "BUSD"].includes(token.symbol);
        case "defi":
          return ["UNI", "AAVE", "COMP", "MKR", "SNX", "YFI"].includes(token.symbol);
        default:
          return true;
      }
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "balance":
          return parseFloat(b.balance) - parseFloat(a.balance);
        case "price":
          return (b.priceUSD || 0) - (a.priceUSD || 0);
        case "volume":
          return (b.volume24h || 0) - (a.volume24h || 0);
        case "name":
        default:
          return a.symbol.localeCompare(b.symbol);
      }
    });

    return filtered;
  }, [tokens, searchTerm, selectedCategory, sortBy]);

  const isTokenSelected = (token: Token) => {
    return selectedTokens.some(t => t.address === token.address);
  };

  const canSelectMore = selectedTokens.length < maxSelection;

  const handleTokenToggle = (token: Token) => {
    if (isTokenSelected(token)) {
      onTokenDeselect(token);
    } else if (canSelectMore) {
      onTokenSelect(token);
    }
  };

  const getTokenIcon = (token: Token) => {
    if (token.logoURI) {
      return <img src={token.logoURI} alt={token.symbol} className="w-6 h-6 rounded-full" />;
    }
    return <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center text-xs font-bold">{token.symbol.slice(0, 2)}</div>;
  };

  return (
    <div className="space-y-4">
      {/* Header with Selection Count */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Select Tokens</h3>
        <Badge variant={selectedTokens.length >= maxSelection ? "destructive" : "secondary"}>
          {selectedTokens.length}/{maxSelection} selected
        </Badge>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search tokens by name, symbol, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex space-x-2">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(category => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="balance">Balance</SelectItem>
              {showPrices && <SelectItem value="price">Price</SelectItem>}
              <SelectItem value="volume">Volume</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Token Bundles */}
      {onBundleSelect && (
        <Card className="p-4">
          <h4 className="font-medium mb-3">Quick Select Bundles</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {predefinedBundles.map(bundle => (
              <Button
                key={bundle.id}
                variant="outline"
                size="sm"
                className="h-auto p-3 flex flex-col items-start space-y-1"
                onClick={() => onBundleSelect(bundle)}
              >
                <div className="flex items-center space-x-1">
                  <span className="text-sm font-medium">{bundle.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {bundle.category}
                  </Badge>
                </div>
                <div className="text-xs text-gray-600 text-left">
                  {bundle.description}
                </div>
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Token List */}
      <Card className="p-4">
        <Tabs defaultValue="available" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="available">
              Available Tokens ({filteredAndSortedTokens.length})
            </TabsTrigger>
            <TabsTrigger value="selected">
              Selected ({selectedTokens.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-4">
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredAndSortedTokens.map(token => {
                  const isSelected = isTokenSelected(token);
                  const canSelect = !isSelected && canSelectMore;

                  return (
                    <Card
                      key={token.address}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'ring-2 ring-blue-500 bg-blue-50'
                          : canSelect
                            ? 'hover:bg-gray-50'
                            : 'opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => canSelect && handleTokenToggle(token)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getTokenIcon(token)}
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{token.symbol}</span>
                              {token.verified && <Shield className="h-3 w-3 text-green-600" />}
                              {token.trending && <TrendingUp className="h-3 w-3 text-orange-600" />}
                            </div>
                            <div className="text-sm text-gray-600 truncate max-w-32">
                              {token.name}
                            </div>
                          </div>
                        </div>

                        <div className="text-right space-y-1">
                          {showBalances && (
                            <div className="text-sm font-mono">
                              {parseFloat(token.balance).toFixed(4)} {token.symbol}
                            </div>
                          )}
                          {showPrices && token.priceUSD && (
                            <div className="text-xs text-gray-600">
                              ${token.priceUSD.toFixed(2)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                          )}
                          {!canSelect && !isSelected && (
                            <Badge variant="outline" className="text-xs">
                              Limit Reached
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="selected" className="mt-4">
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {selectedTokens.map(token => (
                  <Card key={token.address} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getTokenIcon(token)}
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{token.symbol}</span>
                            <Badge variant="default" className="text-xs">Selected</Badge>
                          </div>
                          <div className="text-sm text-gray-600">{token.name}</div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTokenToggle(token)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </Button>
                    </div>
                  </Card>
                ))}

                {selectedTokens.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No tokens selected</p>
                    <p className="text-sm">Select tokens from the Available tab</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Selection Summary */}
      {selectedTokens.length > 0 && (
        <Card className="p-4 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Selected Tokens: </span>
              <span className="text-sm text-gray-600">
                {selectedTokens.map(t => t.symbol).join(", ")}
              </span>
            </div>
            <Badge variant="default">
              {selectedTokens.length} tokens
            </Badge>
          </div>
        </Card>
      )}
    </div>
  );
}
