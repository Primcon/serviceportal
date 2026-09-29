export default function WorkspaceLoading() {
  return (
    <main className="min-h-screen bg-[#f6f6f6]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="h-8 w-56 animate-pulse bg-[#d9d9d9]" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 animate-pulse bg-[#ffffff]" />
          <div className="h-28 animate-pulse bg-[#ffffff]" />
          <div className="h-28 animate-pulse bg-[#ffffff]" />
          <div className="h-28 animate-pulse bg-[#ffffff]" />
        </div>
      </div>
    </main>
  );
}
