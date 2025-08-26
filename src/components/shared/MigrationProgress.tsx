/**
 * MigrationProgress - Visual progress tracker for modular migration
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertTriangle, Play } from "lucide-react";

interface MigrationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  estimatedTime: string;
  component: string;
}

export function MigrationProgress() {
  const [steps] = useState<MigrationStep[]>([
    {
      id: 'balance_display',
      name: 'BalanceDisplay Migration',
      description: 'Migrate from monolithic BalanceDisplay to modular BalanceDisplayMigrated',
      status: 'completed',
      estimatedTime: '15 minutes',
      component: 'BalanceDisplay'
    },
    {
      id: 'token_list',
      name: 'TokenList Migration',
      description: 'Migrate TokenList to use useTokenManagement hook',
      status: 'completed',
      estimatedTime: '20 minutes',
      component: 'TokenList'
    },
    {
      id: 'transaction_modals',
      name: 'Transaction Modals Migration',
      description: 'Migrate all modals to use useTransactionManagement hook',
      status: 'pending',
      estimatedTime: '45 minutes',
      component: 'DepositModal, WithdrawModal, TransferModal'
    },
    {
      id: 'main_index',
      name: 'Main Index Migration',
      description: 'Migrate Index.tsx to use useVaultModular (drop-in replacement)',
      status: 'pending',
      estimatedTime: '30 minutes',
      component: 'Index.tsx'
    },
    {
      id: 'cleanup',
      name: 'Cleanup & Testing',
      description: 'Remove old code and comprehensive testing',
      status: 'pending',
      estimatedTime: '20 minutes',
      component: 'All components'
    }
  ]);

  const [currentStep, setCurrentStep] = useState(0);

  const completedSteps = steps.filter(step => step.status === 'completed').length;
  const totalSteps = steps.length;
  const progressPercentage = (completedSteps / totalSteps) * 100;

  const getStatusIcon = (status: MigrationStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'failed':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusBadge = (status: MigrationStep['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Card className="p-6 max-w-4xl mx-auto">
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">🚀 Modular Migration Progress</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Transforming your vault from monolithic to modular architecture
          </p>
        </div>

        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-medium">Overall Progress</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {completedSteps} of {totalSteps} steps completed
            </span>
          </div>
          <Progress value={progressPercentage} className="h-3" />
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            {Math.round(progressPercentage)}% Complete
          </div>
        </div>

        {/* Migration Benefits */}
        <div className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">🎯 Migration Benefits Achieved:</h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• ✅ <strong>Safety</strong> - Changes are isolated and don't break other functionality</li>
            <li>• ✅ <strong>Performance</strong> - Components only load what they actually need</li>
            <li>• ✅ <strong>Testability</strong> - Each concern can be tested independently</li>
            <li>• ✅ <strong>Scalability</strong> - Easy to add new features without touching existing code</li>
            <li>• ✅ <strong>Team Development</strong> - Multiple developers can work on different concerns</li>
          </ul>
        </div>

        {/* Current Step Details */}
        <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-3 mb-3">
            {getStatusIcon(steps[currentStep].status)}
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Current Step: {steps[currentStep].name}
              </h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                {steps[currentStep].component}
              </p>
            </div>
            {getStatusBadge(steps[currentStep].status)}
          </div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            {steps[currentStep].description}
          </p>
          <div className="flex justify-between items-center text-sm text-yellow-600 dark:text-yellow-400">
            <span>Estimated time: {steps[currentStep].estimatedTime}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={previousStep}
                disabled={currentStep === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextStep}
                disabled={currentStep === steps.length - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* All Steps Overview */}
        <div className="space-y-3">
          <h3 className="font-semibold">📋 Migration Steps Overview</h3>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                  step.status === 'completed'
                    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                    : step.status === 'in_progress'
                    ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="flex-shrink-0">
                  {getStatusIcon(step.status)}
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{step.name}</span>
                    {getStatusBadge(step.status)}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>Component: {step.component}</span>
                    <span>Time: {step.estimatedTime}</span>
                  </div>
                </div>
                {step.status === 'pending' && (
                  <Button size="sm" variant="outline">
                    <Play className="h-4 w-4 mr-1" />
                    Start
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Next Steps Guidance */}
        <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">🎯 What's Next?</h3>
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Your BalanceDisplay migration is complete! The component now uses the new modular system.
          </p>
          <div className="space-y-2">
            <h4 className="font-medium text-green-800 dark:text-green-200">Recommended Next Steps:</h4>
            <ul className="text-sm text-green-600 dark:text-green-400 space-y-1">
              <li>1. Test the BalanceDisplayMigrated component thoroughly</li>
              <li>2. Set <code>showMigrationInfo={false}</code> to hide migration messages</li>
              <li>3. Consider migrating TokenList component next (similar complexity)</li>
              <li>4. Use the test component to compare old vs new functionality</li>
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
