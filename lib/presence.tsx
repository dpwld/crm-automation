"use client";
import type {ReactNode} from 'react';
export function PresenceProvider({children}:{meKey:string;children:ReactNode}) {return children;}
const unavailable=new Set<string>();
export function usePresence():Set<string>{return unavailable;}
