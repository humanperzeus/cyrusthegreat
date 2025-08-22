/**
 * RateLimitStatusDisplay - High Priority Feature
 * Shows users their current rate limit status to prevent transaction failures
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, AlertTriangle, CheckCircle, Zap } from "lucide-react";

interface RateLimitStatus {
  remaining: number;
  total: number;
  resetTime: number;
  lastTransaction?: number;
}

interface RateLimitStatusDisplayProps {
  rateLimitStatus: RateLimitStatus | null;
  isVisible?: boolean;
  compact?: boolean;
  showWarnings?: boolean;
}

export function RateLimitStatusDisplay({
  rateLimitStatus,
  isVisible = true,
  compact = false,
  showWarnings = true
}: RateLimitStatusDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (!rateLimitStatus?.resetTime) return;

    const updateTimeRemaining = () => {
      const now = Date.now();
      const remaining = Math.max(0, rateLimitStatus.resetTime - now);
      setTimeRemaining(remaining);
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [rateLimitStatus?.resetTime]);

  if (!isVisible || !rateLimitStatus) {
    return null;
  }

  const usagePercentage = ((rateLimitStatus.total - rateLimitStatus.remaining) / rateLimitStatus.total) * 100;
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = rateLimitStatus.remaining === 0;
  const isLow = rateLimitStatus.remaining <= 5;

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusColor = () => {
    if (isAtLimit) return "text-red-600";
    if (isNearLimit) return "text-orange-600";
    if (isLow) return "text-yellow-600";
    return "text-green-600";
  };

  const getStatusIcon = () => {
    if (isAtLimit) return <AlertTriangle className="h-4 w-4 text-red-600" />;
    if (isNearLimit) return <Clock className="h-4 w-4 text-orange-600" />;
    if (isLow) return <Zap className="h-4 w-4 text-yellow-600" />;
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  };

  const getStatusBadge = () => {
    if (isAtLimit) return <Badge variant="destructive">LIMIT REACHED</Badge>;
    if (isNearLimit) return <Badge variant="secondary">NEAR LIMIT</Badge>;
    if (isLow) return <Badge variant="outline">LOW</Badge>;
    return <Badge variant="default">HEALTHY</Badge>;
  };

  if (compact) {
    return (
      <div className={`flex items-center space-x-2 ${getStatusColor()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">
          {rateLimitStatus.remaining}/{rateLimitStatus.total}
        </span>
        {isAtLimit && (
          <span className="text-xs">
            ({formatTime(timeRemaining)})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main Status Card */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-sm">Rate Limit Status</span>
            {getStatusBadge()}
          </div>
          <div className="flex items-center space-x-1 text-sm">
            <span className={`font-bold ${getStatusColor()}`}>
              {rateLimitStatus.remaining}
            </span>
            <span className="text-gray-500">/{rateLimitStatus.total}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress
            value={usagePercentage}
            className={`w-full ${
              isAtLimit ? 'bg-red-100' :
              isNearLimit ? 'bg-orange-100' :
              isLow ? 'bg-yellow-100' : 'bg-green-100'
            }`}
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>{Math.round(usagePercentage)}% used</span>
            <span>{rateLimitStatus.remaining} remaining</span>
          </div>
        </div>

        {/* Time Remaining */}
        {isAtLimit && (
          <div className="mt-3 flex items-center space-x-2 text-sm">
            <Clock className="h-4 w-4 text-red-600" />
            <span className="text-red-600 font-medium">
              Resets in: {formatTime(timeRemaining)}
            </span>
          </div>
        )}
      </Card>

      {/* Warnings */}
      {showWarnings && (
        <div className="space-y-2">
          {isAtLimit && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Rate limit exceeded! Wait for reset before making more transactions.
              </AlertDescription>
            </Alert>
          )}

          {isNearLimit && !isAtLimit && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Approaching rate limit ({rateLimitStatus.remaining} transactions left).
                Consider waiting to avoid transaction failures.
              </AlertDescription>
            </Alert>
          )}

          {isLow && !isNearLimit && !isAtLimit && (
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertDescription>
                Running low on transactions ({rateLimitStatus.remaining} left).
                Plan your transactions accordingly.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>Reset: {new Date(rateLimitStatus.resetTime).toLocaleTimeString()}</div>
        <div>Window: 60 seconds</div>
      </div>
    </div>
  );
}
