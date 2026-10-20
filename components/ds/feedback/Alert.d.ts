import React from 'react';


export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  title?: React.ReactNode;
  
  icon?: React.ReactNode;
  onClose?: (() => void) | null;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}
export function Alert(props: AlertProps): JSX.Element;
