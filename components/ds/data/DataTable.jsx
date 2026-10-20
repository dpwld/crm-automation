'use client';
import React from 'react';
import { useColWidths, resizeHandleStyle } from '@/lib/hooks/useColWidths';



const CSS = `
.sx-table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-card); }
.sx-table { width: 100%; border-collapse: separate; border-spacing: 0; font-family: var(--font-sans); font-size: var(--text-md); }
.sx-table th, .sx-table td { text-align: left; padding: 0 14px; vertical-align: middle; }
.sx-table thead th {
  height: 40px; background: var(--surface-sunken);
  font-size: var(--text-xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle);
  position: sticky; top: 0; z-index: 1; white-space: nowrap;
}
.sx-table--sticky thead th { box-shadow: 0 1px 0 var(--border-subtle); }
.sx-table thead th.sx-th--sortable { cursor: pointer; user-select: none; }
.sx-table thead th.sx-th--sortable:hover { color: var(--text-default); }
.sx-th__inner { display: inline-flex; align-items: center; gap: 5px; }
.sx-th--right .sx-th__inner { justify-content: flex-end; }
.sx-th__sort { display: inline-flex; color: var(--text-subtle); }
.sx-th__sort svg { width: 13px; height: 13px; }
.sx-th--active { color: var(--text-strong); }
.sx-th--active .sx-th__sort { color: var(--color-primary); }

.sx-table tbody td {
  height: var(--_rh, 48px);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-default);
}
.sx-table tbody tr:last-child td { border-bottom: none; }
.sx-table--zebra tbody tr:nth-child(even) td { background: var(--gray-25); }
.sx-table--hover tbody tr { transition: background var(--dur-fast) var(--ease-out); }
.sx-table--hover tbody tr:hover td { background: var(--surface-hover); }
.sx-table tbody tr.sx-tr--selected td { background: var(--color-primary-soft); }
.sx-table tbody tr.sx-tr--clickable { cursor: pointer; }
.sx-tr--clickable:focus-visible { outline: none; box-shadow: inset var(--ring-focus); }
.sx-tcheck:focus-visible, .sx-th--sortable:focus-visible { outline: none; box-shadow: var(--ring-focus); }
.sx-td--right { text-align: right; }
.sx-td--center { text-align: center; }
.sx-td--mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: var(--text-sm); color: var(--text-strong); }
.sx-td--num { font-variant-numeric: tabular-nums; }
.sx-td--strong { font-weight: var(--weight-semibold); color: var(--text-strong); }
.sx-table--compact { --_rh: 40px; }
.sx-table--relaxed { --_rh: 56px; }
.sx-td--check, .sx-th--check { width: 44px; padding-left: 14px; padding-right: 0; }

.sx-tcheck { width: 17px; height: 17px; border: 1.5px solid var(--border-strong); border-radius: var(--radius-xs); background: var(--surface-card); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color:#fff; vertical-align: middle; }
.sx-tcheck--on { background: var(--color-primary); border-color: var(--color-primary); }
.sx-tcheck svg { width: 12px; height: 12px; }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'datatable');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const SortIcon = ({ dir }) => {
  if (dir === 'asc') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>;
  if (dir === 'desc') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 9 4-4 4 4M8 15l4 4 4-4"/></svg>;
};
const Tick = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>;

export function DataTable({
  columns = [],
  data = [],
  rowKey = (r, i) => r.id ?? i,
  density = 'default',
  zebra = false,
  hover = true,
  stickyHeader = false,
  sortKey = null,
  sortDir = null,
  onSort = null,
  selectable = false,
  selectedKeys = null,
  onSelectionChange = null,
  onRowClick = null,
  resizable = false,
  storageKey = undefined,
  className = '',
  ...rest
}) {
  inject();
  const { widths: userWidths, startResize } = useColWidths(resizable ? storageKey : undefined);
  const [iSortKey, setISortKey] = React.useState(sortKey);
  const [iSortDir, setISortDir] = React.useState(sortDir || 'asc');
  const sKey = onSort ? sortKey : iSortKey;
  const sDir = onSort ? sortDir : iSortDir;

  const handleSort = (col) => {
    if (!col.sortable) return;
    const nextDir = sKey === col.key && sDir === 'asc' ? 'desc' : 'asc';
    if (onSort) onSort(col.key, nextDir);
    else { setISortKey(col.key); setISortDir(nextDir); }
  };

  const selSet = selectedKeys ? new Set(selectedKeys) : null;
  const allKeys = data.map((r, i) => rowKey(r, i));
  const allOn = selSet && allKeys.length > 0 && allKeys.every((k) => selSet.has(k));
  const toggleAll = () => onSelectionChange && onSelectionChange(allOn ? [] : allKeys);
  const toggleRow = (k) => {
    if (!onSelectionChange) return;
    const next = new Set(selSet);
    next.has(k) ? next.delete(k) : next.add(k);
    onSelectionChange([...next]);
  };

  const cls = [
    'sx-table',
    density !== 'default' ? `sx-table--${density}` : '',
    zebra ? 'sx-table--zebra' : '',
    hover ? 'sx-table--hover' : '',
    stickyHeader ? 'sx-table--sticky' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={['sx-table-wrap sx-scroll', className].filter(Boolean).join(' ')} {...rest}>
      <table className={cls}>
        <thead>
          <tr>
            {selectable && (
              <th className="sx-th--check">
                <span className={`sx-tcheck${allOn ? ' sx-tcheck--on' : ''}`} onClick={toggleAll} role="checkbox" aria-checked={allOn} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAll(); } }}>
                  {allOn && <Tick />}
                </span>
              </th>
            )}
            {columns.map((col) => {
              const active = sKey === col.key;
              return (
                <th
                  key={col.key}
                  className={[
                    col.align === 'right' ? 'sx-th--right' : '',
                    col.sortable ? 'sx-th--sortable' : '',
                    active ? 'sx-th--active' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ width: userWidths[col.key] ?? col.width, position: resizable ? 'relative' : undefined }}
                  onClick={() => handleSort(col)}
                  tabIndex={col.sortable ? 0 : undefined}
                  aria-sort={col.sortable ? (active ? (sDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  onKeyDown={col.sortable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col); } } : undefined}
                >
                  <span className="sx-th__inner">
                    {col.header}
                    {col.sortable && <span className="sx-th__sort"><SortIcon dir={active ? sDir : null} /></span>}
                  </span>
                  {resizable && (
                    <span
                      style={resizeHandleStyle}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        const th = e.currentTarget.parentElement;
                        startResize(col.key, th ? th.getBoundingClientRect().width : Number(col.width) || 120)(e);
                      }}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const k = rowKey(row, i);
            const selected = selSet && selSet.has(k);
            return (
              <tr
                key={k}
                className={[selected ? 'sx-tr--selected' : '', onRowClick ? 'sx-tr--clickable' : ''].filter(Boolean).join(' ')}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row, i); } } : undefined}
              >
                {selectable && (
                  <td className="sx-td--check" onClick={(e) => { e.stopPropagation(); toggleRow(k); }}>
                    <span className={`sx-tcheck${selected ? ' sx-tcheck--on' : ''}`} role="checkbox" aria-checked={!!selected} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleRow(k); } }}>
                      {selected && <Tick />}
                    </span>
                  </td>
                )}
                {columns.map((col) => {
                  const tdCls = [
                    col.align === 'right' ? 'sx-td--right' : col.align === 'center' ? 'sx-td--center' : '',
                    col.mono ? 'sx-td--mono' : '',
                    col.num ? 'sx-td--num' : '',
                    col.strong ? 'sx-td--strong' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <td key={col.key} className={tdCls}>
                      {col.render ? col.render(row, i) : row[col.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
