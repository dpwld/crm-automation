import React from 'react';


export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: (() => void) | null;
  children?: React.ReactNode;
}
export function Toast(props: ToastProps): JSX.Element;
