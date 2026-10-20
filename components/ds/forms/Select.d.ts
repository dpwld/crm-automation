import React from 'react';

export interface SelectOption { value: string; label: string; }


export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  placeholder?: string | null;
  options?: Array<string | SelectOption> | null;
}
export function Select(props: SelectProps): JSX.Element;
