'use client';

import React, { useState } from 'react';

interface DocumentViewerProps {
  url: string;
  fileName?: string;
  title?: string;
  compact?: boolean;
}

function isImageUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/r2/')) return /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(url);
  if (url.startsWith('/api/files/')) {
    if (fileName) return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(fileName);
    return false;
  }
  if (url.includes('lh3.googleusercontent.com/d/')) return true;
  if (url.includes('drive.google.com/uc')) return true;
  if (/\.(jpg|jpeg|png|webp|gif|heic)(\?|$)/i.test(url)) return true;
  return false;
}

function isPdfUrl(url: string, fileName?: string): boolean {
  if (!url) return false;
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  if (/\.pdf(\?|$)/i.test(url)) return true;
  return false;
}

function getPreviewUrl(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('/api/files/') || url.startsWith('/api/r2/')) return url;
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)\//);
  if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
  return null;
}

export default function DocumentViewer({ url, fileName, title, compact }: DocumentViewerProps) {
  const [lightbox, setLightbox] = useState(false);

  if (!url) return null;

  const isImage = isImageUrl(url, fileName);
  const previewUrl = !isImage ? getPreviewUrl(url) : null;
  const displayName = fileName || title || 'Document';

  return (
    <>
      <div className="group relative rounded-xl overflow-hidden border border-[var(--border-glass)] bg-[var(--surface)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-glass)]">
          <div className="flex items-center gap-2 min-w-0">
            {isPdfUrl(url, fileName) ? (
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                <path d="M8 12h2v5H8zm3 0h2v5h-2zm3 0h2v5h-2z"/>
              </svg>
            ) : isImage ? (
              <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            )}
            <span className="text-xs font-medium text-[var(--text-secondary)] truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-1">
            {isImage && (
              <button
                onClick={() => setLightbox(true)}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                title="View full size"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              title="Open in new tab"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-4.5-6H18m0 0v4.5m0-4.5-7.5 7.5" />
              </svg>
            </a>
          </div>
        </div>

        {/* Preview area */}
        <div className="bg-[var(--background-subtle)] overflow-hidden">
          {isImage ? (
            <img
              src={url}
              alt={displayName}
              className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
              style={{ maxHeight: compact ? '200px' : '500px' }}
              onClick={() => setLightbox(true)}
            />
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full border-0"
              style={{ height: compact ? '200px' : '500px' }}
              title={`${displayName} preview`}
              allow="autoplay"
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 rounded-xl bg-[var(--surface-muted)] border border-[var(--border-glass)] flex items-center justify-center">
                {isPdfUrl(url, fileName) ? (
                  <svg className="w-7 h-7 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                )}
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary-hover)] transition-colors"
              >
                Open {isPdfUrl(url, fileName) ? 'PDF' : 'Document'}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-4.5-6H18m0 0v4.5m0-4.5-7.5 7.5" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightbox(false)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={url}
              alt={displayName}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent rounded-b-lg">
              <p className="text-sm text-white/80 text-center">{displayName}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DocumentBadge({ url, fileName, label }: { url: string; fileName?: string; label: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-muted)] border border-[var(--border-glass)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
      </svg>
      {label}
    </a>
  );
}
