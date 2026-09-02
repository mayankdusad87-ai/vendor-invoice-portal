'use client';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
}

export default function StatCard({ title, value, icon, bgColor, textColor }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center`}>
          <div className={textColor}>{icon}</div>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
