import { Link, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";

interface Props {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}

export default function StudentPageNav({ title, subtitle, backTo = "/student", backLabel = "Dashboard" }: Props) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(backTo)}
            className="shrink-0 grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label={backLabel}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
            {subtitle && <div className="truncate text-xs text-slate-400">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link
            to="/student"
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
