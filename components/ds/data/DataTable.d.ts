import React from 'react';

export interface Column<Row = any> {
  
  key: string;
  header: React.ReactNode;
  
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  
  mono?: boolean;
  
  num?: boolean;
  
  strong?: boolean;
  
  render?: (row: Row, index: number) => React.ReactNode;
}


export interface DataTableProps<Row = any> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  columns: Column<Row>[];
  data: Row[];
  
  rowKey?: (row: Row, index: number) => string | number;
  density?: 'compact' | 'default' | 'relaxed';
  zebra?: boolean;
  hover?: boolean;
  stickyHeader?: boolean;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  selectable?: boolean;
  selectedKeys?: Array<string | number> | null;
  onSelectionChange?: (keys: Array<string | number>) => void;
  onRowClick?: (row: Row, index: number) => void;
  
  resizable?: boolean;
  
  storageKey?: string;
}
export function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
