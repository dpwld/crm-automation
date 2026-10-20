import React from 'react';

export interface TabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number | string;
}


export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  variant?: 'underline' | 'enclosed';
}
export function Tabs(props: TabsProps): JSX.Element;
