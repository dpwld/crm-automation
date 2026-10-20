import React from 'react';


export interface DrawerProps extends React.HTMLAttributes<HTMLElement> {
  open: boolean;
  onClose?: (() => void) | null;
  title?: React.ReactNode;
  
  titleIcon?: React.ReactNode;
  side?: 'right' | 'left';
  
  width?: number | string;
  
  scrim?: boolean;
  
  closeOnOutside?: boolean;
  
  headerActions?: React.ReactNode;
  
  footer?: React.ReactNode;
  bodyClassName?: string;
  children?: React.ReactNode;
}
export function Drawer(props: DrawerProps): JSX.Element | null;
