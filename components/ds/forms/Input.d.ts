import React from 'react';


export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  
  mono?: boolean;
  
  icon?: React.ReactNode;
  
  prefix?: React.ReactNode;
  
  suffix?: React.ReactNode;
  
  suffixDivided?: boolean;
}
export function Input(props: InputProps): JSX.Element;
