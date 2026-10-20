import React from 'react';

export interface Step { title: React.ReactNode; subtitle?: React.ReactNode; icon?: React.ReactNode; }


export interface StepperProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: Step[];
  
  current: number;
  
  onStepClick?: ((index: number) => void) | null;
  
  clickAny?: boolean;
  
  active?: number | null;
}
export function Stepper(props: StepperProps): JSX.Element;
