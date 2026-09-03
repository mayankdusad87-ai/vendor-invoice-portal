'use client';

interface LoadingSkeletonProps {
  /** Number of skeleton cards to show */
  count?: number;
  /** Skeleton variant */
  variant?: 'card' | 'list' | 'form';
}

function SkeletonCard() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading content">
      <div className="flex items-center justify-between mb-3">
        <div className="skeleton h-5 w-28 rounded" />
        <div className="skeleton h-6 w-20 rounded-full" />
      </div>
      <div className="skeleton h-4 w-3/4 rounded mb-2" />
      <div className="flex gap-3 mt-3">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
        <div className="skeleton h-4 w-20 rounded" />
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading content">
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <div className="skeleton h-4 w-32 rounded mb-2" />
          <div className="skeleton h-3 w-48 rounded" />
        </div>
        <div className="skeleton h-8 w-16 rounded" />
      </div>
    </div>
  );
}

function SkeletonForm() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading form">
      <div className="skeleton h-6 w-40 rounded mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div className="skeleton h-3 w-20 rounded mb-2" />
          <div className="skeleton h-11 w-full rounded" />
        </div>
        <div>
          <div className="skeleton h-3 w-24 rounded mb-2" />
          <div className="skeleton h-11 w-full rounded" />
        </div>
      </div>
      <div className="skeleton h-3 w-28 rounded mb-2" />
      <div className="skeleton h-20 w-full rounded mb-4" />
      <div className="skeleton h-11 w-32 rounded" />
    </div>
  );
}

export default function LoadingSkeleton({ count = 3, variant = 'card' }: LoadingSkeletonProps) {
  const Component = variant === 'list' ? SkeletonList : variant === 'form' ? SkeletonForm : SkeletonCard;
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
