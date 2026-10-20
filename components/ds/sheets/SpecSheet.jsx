'use client';
import React from 'react';
import { valueColumns as schemaColumns } from '@/lib/crm/specSchema';
import { useColWidths, resizeHandleStyle } from '@/lib/hooks/useColWidths';



const CSS = `
.sx-sheet { width: 100%; overflow-x: auto; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); font-family: var(--font-sans); }
.sx-sheet table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.sx-sheet th, .sx-sheet td { border: 1px solid var(--border-subtle); padding: 0; }

.sx-sheet thead th {
  background: var(--color-primary); color: var(--on-primary);
  font-size: var(--text-xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-snug);
  text-align: left; padding: 9px 12px; white-space: nowrap;
  border-color: var(--color-primary-hover);
}
.sx-sheet thead th.sx-sheet__th-val { text-align: center; }
.sx-sheet thead th.sx-sheet__th-param { padding-left: 16px; }

.sx-sheet td.sx-sheet__section {
  background: var(--surface-sunken); vertical-align: middle; text-align: center;
  font-weight: var(--weight-bold); color: var(--text-strong);
  font-size: var(--text-md); padding: 10px 12px; width: 168px;
  letter-spacing: var(--tracking-snug);
}
.sx-sheet td.sx-sheet__param { padding: 8px 16px; color: var(--text-default); }
.sx-sheet td.sx-sheet__sym { padding: 8px 10px; text-align: center; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-strong); white-space: nowrap; }
.sx-sheet td.sx-sheet__unit { padding: 8px 10px; text-align: center; font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-muted); white-space: nowrap; }

.sx-sheet__cell {
  text-align: center; font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: var(--text-sm); color: var(--text-strong);
  padding: 8px 10px; min-width: 96px; outline: none;
  transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.sx-sheet__cell--edit { cursor: text; }
.sx-sheet__cell--edit:hover { background: var(--surface-hover); }
.sx-sheet__cell--edit:focus { background: var(--surface-card); box-shadow: inset 0 0 0 2px var(--color-primary); border-radius: 2px; }
.sx-sheet__cell--empty { color: var(--text-subtle); }
.sx-sheet__cell--merged { color: var(--text-strong); font-weight: var(--weight-medium); }
.sx-sheet__cell--text { font-family: var(--font-sans); }
.sx-sheet__cell--dirty { background: var(--status-info-bg); }
.sx-sheet__cell--dirty:hover { background: var(--blue-100); }

.sx-sheet__title { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--border-subtle); }
.sx-sheet__title-text { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-strong); }
.sx-sheet__title-note { font-size: var(--text-xs); color: var(--text-muted); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'specsheet');
  s.textContent = CSS;
  document.head.appendChild(s);
}

function EditableCell({ value, editable, isText, labelledBy, onCommit, suggestions = null }) {
  const cellRef = React.useRef(null);
  const composing = React.useRef(false);
  const [initialValue] = React.useState(value ?? '');
  const text = String(value ?? '');
  React.useLayoutEffect(() => {
    const cell = cellRef.current;
    if (!cell || composing.current || cell.textContent === text) return;
    cell.textContent = text;
    if (document.activeElement === cell) {
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [text, editable]);
  const empty = value === '' || value == null;
  const cls = [
    'sx-sheet__cell',
    editable ? 'sx-sheet__cell--edit' : '',
    empty ? 'sx-sheet__cell--empty' : '',
    isText ? 'sx-sheet__cell--text' : '',
    editable && text !== String(initialValue) ? 'sx-sheet__cell--dirty' : '',
  ].filter(Boolean).join(' ');
  if (!editable) return <div className={cls}>{empty ? 'N/A' : value}</div>;
  const cell = (
    <div
      ref={cellRef}
      className={cls}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      tabIndex={0}
      aria-labelledby={labelledBy}
      aria-multiline={false}
      data-spec-value
      data-placeholder="N/A"
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => { composing.current = false; onCommit(e.currentTarget.textContent); }}
      onInput={(e) => {
        if (!composing.current && !e.nativeEvent.isComposing) onCommit(e.currentTarget.textContent);
      }}
      onBlur={(e) => onCommit(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        const cells = Array.from(e.currentTarget.closest('.sx-sheet').querySelectorAll('[data-spec-value]'));
        const next = cells[cells.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)];
        if (next) next.focus();
        else e.currentTarget.blur();
      }}
    >
      {initialValue}
    </div>
  );
  if (!suggestions || suggestions.length === 0) return cell;
  return (
    <div>
      {cell}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '2px 6px 4px' }}>
        {suggestions.map((opt) => (
          <button key={opt} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onCommit(opt)}
            style={{
              fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              background: value === opt ? 'var(--color-primary-soft, #eef4ff)' : 'var(--surface-card)',
              color: value === opt ? 'var(--color-primary)' : 'var(--text-muted)',
            }}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SpecSheet({
  title = null,
  titleNote = null,
  titleActions = null,
  valueColumns = null,
  sections = [],
  editable = true,
  onCellChange = null,
  className = '',
  ...rest
}) {
  inject();
  const sheetId = React.useId();
  const cols = valueColumns || schemaColumns(sections.flatMap(s => s.rows));
  const { widths: colW, startResize } = useColWidths('spec-sheet');
  const rzHandle = (key) => (
    <span
      style={resizeHandleStyle}
      onMouseDown={(e) => {
        const el = e.currentTarget.parentElement;
        startResize(key, el ? el.getBoundingClientRect().width : 120)(e);
      }}
    />
  );
  // Standalone sheets own their edits; controlled sheets use the supplied values.
  const [edits, setEdits] = React.useState({});
  const valOf = (si, ri, key, original) => {
    const k = si + ':' + ri + ':' + key;
    return !onCellChange && k in edits ? edits[k] : original;
  };
  const commit = (si, ri, key, original, next) => {
    if (next === String(valOf(si, ri, key, original) ?? '')) return;
    if (onCellChange) onCellChange({ section: si, row: ri, column: key, value: next });
    else setEdits((e) => ({ ...e, [si + ':' + ri + ':' + key]: next }));
  };

  return (
    <div className={['sx-sheet sx-scroll', className].filter(Boolean).join(' ')} {...rest}>
      {(title || titleActions) && (
        <div className="sx-sheet__title">
          <div>
            <span className="sx-sheet__title-text">{title}</span>
            {titleNote && <span className="sx-sheet__title-note">  ·  {titleNote}</span>}
          </div>
          {titleActions}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th style={{ width: colW.table ?? 168, position: 'relative' }}>Table{rzHandle('table')}</th>
            <th className="sx-sheet__th-param" style={{ width: colW.param, position: 'relative' }}>Parameter{rzHandle('param')}</th>
            <th style={{ textAlign: 'center', width: colW.sym, position: 'relative' }}>Symbol{rzHandle('sym')}</th>
            <th style={{ textAlign: 'center', width: colW.unit, position: 'relative' }}>Units{rzHandle('unit')}</th>
            {cols.map((c) => (
              <th key={c.key} id={`${sheetId}-col-${c.key}`} className="sx-sheet__th-val" style={{ width: colW[c.key], position: 'relative' }}>
                {c.label}{rzHandle(c.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec, si) =>
            sec.rows.map((row, ri) => (
              <tr key={si + '-' + ri}>
                {ri === 0 && (
                  <td className="sx-sheet__section" rowSpan={sec.rows.length}>{sec.name}</td>
                )}
                <td id={`${sheetId}-param-${si}-${ri}`} className="sx-sheet__param">{row.param}</td>
                <td className="sx-sheet__sym">{row.symbol || ''}</td>
                <td className="sx-sheet__unit">{row.unit || ''}</td>
                {row.merged
                  ? (
                    <td colSpan={cols.length}>
                      <EditableCell
                        value={valOf(si, ri, '_merged', row.value)}
                        editable={editable && row.editable !== false}
                        labelledBy={`${sheetId}-param-${si}-${ri} ${cols.map((c) => `${sheetId}-col-${c.key}`).join(' ')}`}
                        isText={row.text}
                        suggestions={null}
                        onCommit={(v) => commit(si, ri, '_merged', row.value, v)}
                      />
                    </td>
                  )
                  : cols.map((c) => (
                    <td key={c.key}>
                      <EditableCell
                        value={valOf(si, ri, c.key, row[c.key])}
                        editable={editable && row.editable !== false}
                        labelledBy={`${sheetId}-param-${si}-${ri} ${sheetId}-col-${c.key}`}
                        isText={row.text}
                        suggestions={null}
                        onCommit={(v) => commit(si, ri, c.key, row[c.key], v)}
                      />
                    </td>
                  ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
