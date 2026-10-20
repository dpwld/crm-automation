import React from 'react';

export interface SpecSheetColumn { key: string; label: React.ReactNode; }

export interface SpecSheetRow {
  param: React.ReactNode;
  
  symbol?: React.ReactNode;
  
  unit?: React.ReactNode;
  
  [columnKey: string]: any;
  
  merged?: boolean;
  
  value?: React.ReactNode;
  
  text?: boolean;
  
  editable?: boolean;
}

export interface SpecSheetSection { name: React.ReactNode; rows: SpecSheetRow[]; }


export interface SpecSheetProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  titleNote?: React.ReactNode;
  
  titleActions?: React.ReactNode;
  
  valueColumns?: SpecSheetColumn[];
  sections: SpecSheetSection[];
  
  editable?: boolean;
  
  onCellChange?: (e: { section: number; row: number; column: string; value: string }) => void;
}
export function SpecSheet(props: SpecSheetProps): JSX.Element;
