import React from 'react';


export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  
  unit?: React.ReactNode;
  icon?: React.ReactNode;
  
  delta?: React.ReactNode;
  deltaDirection?: 'up' | 'down' | 'flat';
  note?: React.ReactNode;
}
export function StatCard(props: StatCardProps): JSX.Element;
