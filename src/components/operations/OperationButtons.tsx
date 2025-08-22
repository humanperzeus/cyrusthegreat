/**
 * OperationButtons - Modular component for operation buttons
 * This allows flexible operation handling without hard-coding button types
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, ArrowRight, Coins } from "lucide-react";

export type OperationType = 'deposit' | 'withdraw' | 'transfer' | 'multideposit' | 'multiwithdraw' | 'multitransfer';

interface OperationButton {
  type: OperationType;
  label: string;
  icon: React.ReactNode;
  description: string;
  variant?: 'default' | 'secondary' | 'outline';
  disabled?: boolean;
  isNew?: boolean;
}

interface OperationButtonsProps {
  onOperationSelect: (operation: OperationType) => void;
  selectedOperation?: OperationType;
  disabledOperations?: OperationType[];
  showMultiToken?: boolean;
  isLoading?: boolean;
}

const baseOperations: OperationButton[] = [
  {
    type: 'deposit',
    label: 'Deposit',
    icon: <ArrowDown className="h-4 w-4" />,
    description: 'Add funds to vault',
    variant: 'default'
  },
  {
    type: 'withdraw',
    label: 'Withdraw',
    icon: <ArrowUp className="h-4 w-4" />,
    description: 'Remove funds from vault',
    variant: 'secondary'
  },
  {
    type: 'transfer',
    label: 'Transfer',
    icon: <ArrowRight className="h-4 w-4" />,
    description: 'Send to another address',
    variant: 'outline'
  }
];

const multiTokenOperations: OperationButton[] = [
  {
    type: 'multideposit',
    label: 'Multi Deposit',
    icon: <Coins className="h-4 w-4" />,
    description: 'Deposit multiple tokens',
    variant: 'default',
    isNew: true
  },
  {
    type: 'multiwithdraw',
    label: 'Multi Withdraw',
    icon: <Coins className="h-4 w-4" />,
    description: 'Withdraw multiple tokens',
    variant: 'secondary',
    isNew: true
  },
  {
    type: 'multitransfer',
    label: 'Multi Transfer',
    icon: <Coins className="h-4 w-4" />,
    description: 'Transfer multiple tokens',
    variant: 'outline',
    isNew: true
  }
];

export function OperationButtons({
  onOperationSelect,
  selectedOperation,
  disabledOperations = [],
  showMultiToken = true,
  isLoading = false
}: OperationButtonsProps) {
  const allOperations = showMultiToken
    ? [...baseOperations, ...multiTokenOperations]
    : baseOperations;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {allOperations.map((operation) => {
        const isDisabled = disabledOperations.includes(operation.type) || isLoading;
        const isSelected = selectedOperation === operation.type;

        return (
          <Button
            key={operation.type}
            variant={isSelected ? 'default' : operation.variant}
            className={`h-auto p-4 flex flex-col items-center space-y-2 transition-all ${
              isSelected ? 'ring-2 ring-blue-500' : ''
            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !isDisabled && onOperationSelect(operation.type)}
            disabled={isDisabled}
          >
            <div className="flex items-center justify-center space-x-2">
              {operation.icon}
              {operation.isNew && (
                <Badge variant="secondary" className="text-xs">NEW</Badge>
              )}
            </div>
            <div className="text-center">
              <div className="font-medium text-sm">{operation.label}</div>
              <div className="text-xs text-gray-600 mt-1">{operation.description}</div>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
