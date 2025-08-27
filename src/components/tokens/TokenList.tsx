/**
 * TokenList - Modular component for displaying and managing tokens
 * Extracted from VaultCore to allow flexible token management
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Trash2 } from "lucide-react";
import { formatTokenBalance } from "@/lib/utils";

interface Token {
  address: string;
  symbol: string;
  balance: string;
  decimals: number;
  isNative?: boolean;
}

interface TokenListProps {
  tokens: Token[];
  onTokenSelect: (token: Token) => void;
  selectedToken?: Token | null;
  onAddToken?: (address: string) => void;
  onRemoveToken?: (address: string) => void;
  isLoading?: boolean;
}

export function TokenList({
  tokens,
  onTokenSelect,
  selectedToken,
  onAddToken,
  onRemoveToken,
  isLoading = false
}: TokenListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newTokenAddress, setNewTokenAddress] = useState("");

  // Use utility function for token-specific precision
  const formatBalance = (balance: number, decimals: number = 18): string => {
    return formatTokenBalance(balance, decimals);
  };

  const filteredTokens = tokens.filter(token =>
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddToken = () => {
    if (newTokenAddress && onAddToken) {
      onAddToken(newTokenAddress);
      setNewTokenAddress("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search tokens..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Token Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto">
        {filteredTokens.map((token) => (
          <Card
            key={token.address}
            className={`p-3 cursor-pointer transition-all hover:shadow-md ${
              selectedToken?.address === token.address
                ? 'ring-2 ring-blue-500 bg-blue-50'
                : 'hover:bg-gray-50'
            }`}
            onClick={() => onTokenSelect(token)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-sm">{token.symbol}</span>
              {token.isNative && (
                <Badge variant="secondary" className="text-xs">Native</Badge>
              )}
            </div>
            <div className="text-xs text-gray-600 truncate">
                                          {formatTokenBalance(token.balance, token.decimals)} {token.symbol}
            </div>
            {onRemoveToken && !token.isNative && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveToken(token.address);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </Card>
        ))}
      </div>

      {/* Add Token Section */}
      {onAddToken && (
        <div className="flex gap-2">
          <Input
            placeholder="Token contract address..."
            value={newTokenAddress}
            onChange={(e) => setNewTokenAddress(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleAddToken}
            disabled={!newTokenAddress || isLoading}
            size="sm"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {filteredTokens.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No tokens found</p>
          {searchTerm && <p className="text-sm">Try adjusting your search</p>}
        </div>
      )}
    </div>
  );
}
