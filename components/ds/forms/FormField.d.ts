import React from 'react';


export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  
  hint?: React.ReactNode;
  
  error?: React.ReactNode;
  
  htmlFor?: string | null;
  children?: React.ReactNode;
}
export function FormField(props: FormFieldProps): JSX.Element;
