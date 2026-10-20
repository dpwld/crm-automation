import React from 'react';


export interface CommentProps extends React.HTMLAttributes<HTMLDivElement> {
  author: React.ReactNode;
  time?: React.ReactNode;
  
  avatar?: React.ReactNode;
  
  badge?: React.ReactNode;
  
  system?: boolean;
  likes?: number;
  liked?: boolean;
  onLike?: ((liked: boolean) => void) | null;
  
  showLike?: boolean;
  onReply?: (() => void) | null;
  
  replyCount?: number | null;
  
  defaultOpen?: boolean;
  
  replies?: React.ReactNode;
  
  children?: React.ReactNode;
}
export function Comment(props: CommentProps): JSX.Element;

export interface CommentComposerProps extends React.HTMLAttributes<HTMLDivElement> {
  avatar?: React.ReactNode;
  placeholder?: string;
  
  onSubmit?: ((text: string) => void) | null;
  rows?: number;
}
export function CommentComposer(props: CommentComposerProps): JSX.Element;
