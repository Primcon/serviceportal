import Link from "next/link";
import { UserRole } from "@prisma/client";
import { Search, SlidersHorizontal, UserCheck, UsersRound } from "lucide-react";
import UserDirectory from "@/components/user-directory";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { buttonStyles, fieldStyles } from "@/components/ui/styles";
import { managerRoles } from "@/features/navigation/workspace-items";
import { listInternalUsers, userDirectorySummary } from "@/features/work-orders/internal-queries";
import { firstParam, pageFromParams, type SearchParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceUser } from "@/services/page-access";

export const dynamic = "force-dynamic";

const roleLabels: Record<UserRole, string> = { PORTAL_ADMINISTRATOR: "Portal administrator", VACTECH_MANAGER: "VacTech manager", VACTECH_SERVICE_USER: "VacTech service user", CUSTOMER_USER: "Customer user" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = firstParam(params.status) ?? "";
  const role = firstParam(params.role) ?? "";
  const [{ users, total, page, pageSize }, summary, companies] = await Promise.all([
    listInternalUsers({ search, status, role, page: pageFromParams(params) }),
    userDirectorySummary(),
    prisma.company.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, locations: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
  ]);
  const filtersApplied = Boolean(search || status || role);
  const tiles = [
    { label: "All users", value: summary.all, icon: <UsersRound className="text-brand" size={20} />, accent: true },
    { label: "Active accounts", value: summary.active, icon: <UserCheck className="text-ink" size={20} /> },
    { label: "Internal / customer access", value: `${summary.internal} / ${summary.customers}`, icon: <UsersRound className="text-ink" size={20} /> },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <PageHeader
        description="Search accounts, review access at a glance, and open an individual record to manage roles or customer access."
        eyebrow="USER ADMINISTRATION"
        icon={<UserCheck size={16} />}
        title="Users and access"
      />

      <section aria-label="User directory summary" className="mt-6 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div className={`border-l-4 bg-paper p-5 ${tile.accent ? "border-brand" : "border-line"}`} key={tile.label}>
            {tile.icon}
            <p className="mt-4 text-3xl font-bold tabular-nums">{tile.value}</p>
            <p className="mt-1 text-sm text-muted">{tile.label}</p>
          </div>
        ))}
      </section>

      <section aria-label="User filters" className="mt-8 border border-line bg-paper p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Find a user</div>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" key={`${search}:${status}:${role}`} method="get">
          <label className="sr-only" htmlFor="user-search">Search users</label>
          <div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className={`${fieldStyles} pl-10`} defaultValue={search} id="user-search" name="search" placeholder="Name or email" /></div>
          <label className="sr-only" htmlFor="user-status">Account status</label>
          <select className={fieldStyles} defaultValue={status} id="user-status" name="status"><option value="">All account states</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
          <label className="sr-only" htmlFor="user-role">Role or access</label>
          <select className={fieldStyles} defaultValue={role} id="user-role" name="role"><option value="">All roles and access</option>{Object.values(UserRole).map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select>
          <div className="flex gap-2">
            <button className={buttonStyles({ size: "sm", className: "flex-1" })}>Apply filters</button>
            {filtersApplied && <Link className={buttonStyles({ variant: "outline", size: "sm" })} href="/workspace/users">Reset</Link>}
          </div>
        </form>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
          <div><h2 className="text-xl font-bold">User directory</h2><p className="mt-1 text-sm text-muted">Open a user to manage account state, internal role, or customer access.</p></div>
          <p className="text-sm font-bold text-muted">{total} {filtersApplied ? "matching" : ""} user{total === 1 ? "" : "s"}</p>
        </div>
        <div className="mt-5">
          {users.length ? (
            <>
              <UserDirectory companies={companies} users={users} />
              <Pagination label="users" page={page} pageSize={pageSize} params={params} pathname="/workspace/users" total={total} />
            </>
          ) : (
            <EmptyState
              description={filtersApplied ? "Change or clear the filters to broaden the user directory." : "Accounts appear after customer access approval or employee sign-in."}
              icon={<UsersRound size={26} />}
              title={filtersApplied ? "No users match these filters." : "No users have been provisioned yet."}
            />
          )}
        </div>
      </section>
    </main>
  );
}
