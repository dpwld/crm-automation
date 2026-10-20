import React from 'react';


export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  indeterminate?: boolean;
  children?: React.ReactNode;
}
export function Checkbox(props: CheckboxProps): JSX.Element;
