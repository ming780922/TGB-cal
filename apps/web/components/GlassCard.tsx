interface GlassCardProps {
  className?: string;
  children: React.ReactNode;
}

export function GlassCard({ className = '', children }: GlassCardProps) {
  return (
    <div
      className={`bg-[rgba(255,255,255,0.65)] border border-[rgba(255,255,255,0.9)] rounded-2xl backdrop-blur-xl shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
