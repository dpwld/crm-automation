import React from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeVariant = 'soft' | 'solid' | 'outline';


export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  
  tone?: BadgeTone;
  
  variant?: BadgeVariant;
  
  size?: 'sm' | 'md';
  
  pill?: boolean;
  
  dot?: boolean;
  
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;
