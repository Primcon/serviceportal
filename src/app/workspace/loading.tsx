export default function WorkspaceLoading() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="h-8 w-56 animate-pulse bg-line" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 animate-pulse bg-paper" />
          <div className="h-28 animate-pulse bg-paper" />
          <div className="h-28 animate-pulse bg-paper" />
          <div className="h-28 animate-pulse bg-paper" />
        </div>
      </div>
    </main>
  );
}
