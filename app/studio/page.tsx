import dynamic from "next/dynamic";

const PosterEditor = dynamic(() => import("@/components/editor/poster-editor"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="glass-card w-full max-w-4xl rounded-[32px] border border-white/70 p-10 shadow-panel">
        <div className="animate-fade-up space-y-4">
          <div className="h-6 w-56 rounded-full bg-slate-200" />
          <div className="h-4 w-96 rounded-full bg-slate-100" />
          <div className="editor-grid h-[520px] rounded-[28px] border border-slate-200 bg-white" />
        </div>
      </div>
    </main>
  )
});

export default function StudioPage() {
  return <PosterEditor />;
}
