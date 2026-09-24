'use client';

import React from 'react';

interface TimelineEvent {
  id: string;
  tag: string;
  actor: string;
  comment: string;
  date: string;
  amount?: string;
}

const TAG_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  '[SUBMITTED]':            { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  icon: '↗' },
  '[APPROVED]':             { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: '✓' },
  '[REJECTED]':             { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: '✕' },
  '[PAYMENT]':              { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: '₹' },
  '[TAX_INVOICE]':          { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)',  icon: '⬆' },
  '[RESUBMITTED]':          { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  icon: '↻' },
  '[RECALLED]':             { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '↩' },
  '[AMENDED]':              { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', icon: '✎' },
  '[ACCOUNTS_QUERY]':       { color: '#f472b6', bg: 'rgba(244,114,182,0.12)', icon: '?' },
  '[QUERY_ACCEPTED]':       { color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: '✓' },
  '[QUERY_DISAGREED]':      { color: '#fb7185', bg: 'rgba(251,113,133,0.12)', icon: '✕' },
  '[BATCH PAYMENT]':        { color: '#c084fc', bg: 'rgba(192,132,252,0.12)', icon: '⊞' },
  '[PHYSICAL_COPY_SENT]':   { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  icon: '↑' },
  '[PHYSICAL_COPY_RECEIVED]': { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: '✓' },
};

function extractTag(comment: string): string {
  const match = comment.match(/\[([A-Z_\s]+)\]/);
  return match ? `[${match[1]}]` : '';
}

function formatTagLabel(tag: string): string {
  return tag.replace(/[[\]]/g, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-[var(--text-muted)]">No history yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[15px] top-3 bottom-3 w-px bg-white/[0.06]" />

      <div className="space-y-0">
        {events.map((event, i) => {
          const tag = extractTag(event.comment);
          const style = TAG_STYLES[tag] || { color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: '·' };
          const cleanComment = event.comment
            .replace(/\[[A-Z_\s]+\]\s*/, '')
            .replace(/\s*\|\s*/g, ' · ');

          return (
            <div key={event.id || i} className="relative flex gap-3 py-2.5 group">
              {/* Dot */}
              <div
                className="relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border border-white/[0.06]"
                style={{ background: style.bg, color: style.color }}
              >
                {style.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ background: style.bg, color: style.color }}
                  >
                    {formatTagLabel(tag || 'Event')}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">{event.date}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">{cleanComment}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">by {event.actor}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
