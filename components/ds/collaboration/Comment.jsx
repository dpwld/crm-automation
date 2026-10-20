'use client';
import React from 'react';



const CSS = `
.sx-comment { display: flex; gap: 11px; padding: 14px 0; font-family: var(--font-sans); }
.sx-comment__avatar { flex-shrink: 0; }
.sx-comment__main { flex: 1; min-width: 0; }
.sx-comment__head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; flex-wrap: wrap; }
.sx-comment__author { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-strong); }
.sx-comment__time { font-size: var(--text-xs); color: var(--text-subtle); font-variant-numeric: tabular-nums; }
.sx-comment__badge { font-size: var(--text-2xs); font-weight: var(--weight-semibold); color: var(--text-muted); background: var(--surface-sunken); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); padding: 1px 7px; }
.sx-comment__body { font-size: var(--text-md); color: var(--text-default); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.sx-comment--system .sx-comment__body { color: var(--text-muted); }
.sx-comment__actions { display: flex; align-items: center; gap: 16px; margin-top: 7px; }
.sx-comment__act {
  display: inline-flex; align-items: center; gap: 5px;
  border: none; background: none; padding: 0; cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-semibold);
  color: var(--text-muted); transition: color var(--dur-fast) var(--ease-out);
}
.sx-comment__act:hover { color: var(--text-default); }
.sx-comment__act svg { width: 14px; height: 14px; }
.sx-comment__act--on { color: var(--color-primary); }
.sx-comment__act--on:hover { color: var(--color-primary-hover); }
.sx-comment__count { font-variant-numeric: tabular-nums; }
.sx-comment__toggle { color: var(--color-primary); }
.sx-comment__toggle:hover { color: var(--color-primary-hover); }
.sx-comment__toggle svg { transition: transform var(--dur-fast) var(--ease-out); }
.sx-comment__toggle--open svg { transform: rotate(180deg); }
.sx-comment__replies { margin-top: 4px; padding-left: 14px; border-left: 2px solid var(--border-subtle); }
.sx-comment__replies .sx-comment { padding: 10px 0; }


.sx-composer { display: flex; gap: 11px; align-items: flex-start; font-family: var(--font-sans); }
.sx-composer__box {
  flex: 1; min-width: 0;
  border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-card);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.sx-composer__box--focus { border-color: var(--color-primary); box-shadow: var(--ring-focus); }
.sx-composer__input {
  width: 100%; border: none; outline: none; background: transparent; resize: none;
  font-family: var(--font-sans); font-size: var(--text-md); color: var(--text-strong);
  line-height: 1.5; padding: 10px 12px; display: block;
}
.sx-composer__input::placeholder { color: var(--text-subtle); }
.sx-composer__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px 8px; }
.sx-composer__hint { font-size: var(--text-2xs); color: var(--text-subtle); }
`;

let _injected = false;
function inject() {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const s = document.createElement('style');
  s.setAttribute('data-sx', 'comment');
  s.textContent = CSS;
  document.head.appendChild(s);
}

const ThumbUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
);
const Reply = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
);
const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
);

export function Comment({
  author,
  time = null,
  avatar = null,
  badge = null,
  system = false,
  likes = 0,
  liked = false,
  onLike = null,
  showLike = true,
  onReply = null,
  replyCount = null,
  defaultOpen = true,
  replies = null,
  className = '',
  children,
  ...rest
}) {
  inject();
  const [open, setOpen] = React.useState(defaultOpen);
  const [likedState, setLikedState] = React.useState(liked);
  const [likeCount, setLikeCount] = React.useState(likes);
  const toggleLike = () => {
    if (onLike) { onLike(!likedState); }
    setLikedState((v) => { setLikeCount((c) => c + (v ? -1 : 1)); return !v; });
  };
  return (
    <div className={['sx-comment', system ? 'sx-comment--system' : '', className].filter(Boolean).join(' ')} {...rest}>
      <span className="sx-comment__avatar">{avatar}</span>
      <div className="sx-comment__main">
        <div className="sx-comment__head">
          <span className="sx-comment__author">{author}</span>
          {time && <span className="sx-comment__time">{time}</span>}
          {badge && <span className="sx-comment__badge">{badge}</span>}
        </div>
        <div className="sx-comment__body">{children}</div>
        <div className="sx-comment__actions">
          {showLike && (
            <button className={`sx-comment__act${likedState ? ' sx-comment__act--on' : ''}`} onClick={toggleLike}>
              <ThumbUp /> Like{likeCount > 0 && <span className="sx-comment__count"> {likeCount}</span>}
            </button>
          )}
          {onReply && (
            <button className="sx-comment__act" onClick={onReply}><Reply /> Reply</button>
          )}
          {replies && replyCount != null && (
            <button className={`sx-comment__act sx-comment__toggle${open ? ' sx-comment__toggle--open' : ''}`} onClick={() => setOpen((v) => !v)}>
              <Chevron /> {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
        {replies && open && <div className="sx-comment__replies">{replies}</div>}
      </div>
    </div>
  );
}

export function CommentComposer({
  avatar = null,
  placeholder = 'Shift + Enter for a line break, Enter to post',
  onSubmit = null,
  rows = 1,
  className = '',
  ...rest
}) {
  inject();
  const [focused, setFocused] = React.useState(false);
  const [value, setValue] = React.useState('');
  const submit = () => { if (value.trim() && onSubmit) onSubmit(value.trim()); setValue(''); };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };
  return (
    <div className={['sx-composer', className].filter(Boolean).join(' ')} {...rest}>
      {avatar && <span className="sx-comment__avatar">{avatar}</span>}
      <div className={`sx-composer__box${focused ? ' sx-composer__box--focus' : ''}`}>
        <textarea
          className="sx-composer__input"
          rows={focused || value ? Math.max(rows, 2) : rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {(focused || value) && (
          <div className="sx-composer__bar">
            <span className="sx-composer__hint">Enter to post · Shift + Enter for a new line</span>
          </div>
        )}
      </div>
    </div>
  );
}
