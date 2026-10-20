import React from 'react';


export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose?: (() => void) | null;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
}
export function Modal(props: ModalProps): JSX.Element | null;
