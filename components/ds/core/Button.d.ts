import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  
  variant?: ButtonVariant;
  
  size?: ButtonSize;
  
  iconOnly?: boolean;
  
  block?: boolean;
  
  loading?: boolean;
  
  leftIcon?: React.ReactNode;
  
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;
