'use client';

import { useState, useEffect, useCallback } from 'react';

interface PhotoVersion {
  version: number;
  photos: { key: string; url: string; name: string }[];
}

interface PhotoViewerProps {
  invoiceId: string;
  /** Quick photo URLs from the invoice's workPhotos field (latest version) */
  quickPhotoUrls?: string[];
  /** Show version history toggle. Default true. */
  showVersionHistory?: boolean;
}

/**
 * Displays invoice work photos with version history support.
 *
 * - Shows the latest version's photos immediately from `quickPhotoUrls`
 * - Optionally loads full version history from /api/photos
 * - Built-in lightbox for viewing photos full-screen
 */
export default function PhotoViewer({
  invoiceId,
  quickPhotoUrls = [],
  showVersionHistory = true,
}: PhotoViewerProps) {
  const [versions, setVersions] = useState<PhotoVersion[] | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadVersions = useCallback(async () => {
    if (versions) return; // already loaded
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/photos?invoiceId=${encodeURIComponent(invoiceId)}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        if (data.versions?.length > 0) {
          setActiveVersion(data.versions[0].version); // newest
        }
      }
    } catch {
      console.error('Failed to load photo versions');
    }
    setLoadingVersions(false);
  }, [invoiceId, versions]);

  // Preload versions if showing history
  useEffect(() => {
    if (showHistory) loadVersions();
  }, [showHistory, loadVersions]);

  // Determine what photos to show
  const displayPhotos: string[] = (() => {
    if (showHistory && versions && activeVersion !== null) {
      const ver = versions.find((v) => v.version === activeVersion);
      return ver ? ver.photos.map((p) => p.url) : [];
    }
    return quickPhotoUrls;
  })();

  const hasMultipleVersions = versions && versions.length > 1;

  if (quickPhotoUrls.length === 0 && !showHistory) {
    return null;
  }

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">
          Work Photos ({displayPhotos.length})
          {showHistory && activeVersion !== null && versions && versions.length > 0 && (
            <span className="ml-1 text-gray-400">
              — Version {activeVersion} of {versions[0].version}
            </span>
          )}
        </p>
        {showVersionHistory && (
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory) loadVersions();
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {showHistory ? 'Hide Versions' : 'Version History'}
          </button>
        )}
      </div>

      {/* Version tabs */}
      {showHistory && versions && versions.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {versions.map(({ version }) => (
            <button
              key={version}
              onClick={() => setActiveVersion(version)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activeVersion === version
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              v{version}
              {version === versions[0].version && (
                <span className="ml-1 text-[10px] opacity-75">(latest)</span>
              )}
            </button>
          ))}
          {hasMultipleVersions && (
            <span className="text-[10px] text-gray-400 ml-1">
              All versions preserved for audit
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loadingVersions && (
        <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading photo versions...
        </div>
      )}

      {/* Photo grid */}
      {displayPhotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {displayPhotos.map((url, i) => (
            <img
              key={`${activeVersion || 'q'}-${i}`}
              src={url}
              alt={`Work photo ${i + 1}`}
              className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity border border-gray-200"
              onClick={() => setLightboxUrl(url)}
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {showHistory && !loadingVersions && displayPhotos.length === 0 && (
        <p className="text-sm text-gray-400 py-2">No photos in this version</p>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-label="Photo viewer"
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors z-10"
            aria-label="Close photo viewer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt="Full size work photo"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navigation: prev/next */}
          {displayPhotos.length > 1 && (() => {
            const currentIndex = displayPhotos.indexOf(lightboxUrl);
            return (
              <>
                {currentIndex > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(displayPhotos[currentIndex - 1]); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                    aria-label="Previous photo"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {currentIndex < displayPhotos.length - 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(displayPhotos[currentIndex + 1]); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                    aria-label="Next photo"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
