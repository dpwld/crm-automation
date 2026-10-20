import React from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline';


export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  
  name?: string;
  
  src?: string | null;
  
  size?: AvatarSize;
  
  square?: boolean;
  
  status?: AvatarStatus | null;
}

export function Avatar(props: AvatarProps): JSX.Element;
