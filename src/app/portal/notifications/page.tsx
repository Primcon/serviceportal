import CustomerNotificationPanel from "@/features/customer/notification-panel";

export const dynamic = "force-dynamic";

export default function CustomerNotificationsPage() {
  return (
    <main className="min-h-screen bg-[#ffffff] px-5 py-6 text-[#000000] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <section className="py-10"><p className="text-sm font-bold tracking-[0.1em] text-[#b42318]">CUSTOMER ACCOUNT</p><h1 className="mt-2 text-4xl font-bold">Notifications</h1><p className="mt-3 text-[#5a5a5a]">Review service activity and manage how VacTech keeps you informed.</p></section>
        <CustomerNotificationPanel />
      </div>
    </main>
  );
}
