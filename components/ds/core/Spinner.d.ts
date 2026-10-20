import React from 'react';


export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg';
  onPrimary?: boolean;
}
export function Spinner(props: SpinnerProps): JSX.Element;
