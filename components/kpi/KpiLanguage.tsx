"use client";
import type {ReactNode} from 'react';
export function KpiLanguageProvider({children}:{children:ReactNode}){return <div lang="en" className="kpi-language-scope">{children}</div>;}
export function useKpiLanguage(){return {language:'en' as const};}
