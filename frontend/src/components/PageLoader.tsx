type Props = {
  text?: string;
  fullPage?: boolean;
};

export default function PageLoader({ text = "Loading…", fullPage = false }: Props) {
  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-slate-500">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-10">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
        <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
