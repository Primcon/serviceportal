import Link from "next/link";
import { UserRole } from "@prisma/client";
import { Search, SlidersHorizontal, UserCheck, UsersRound } from "lucide-react";
import UserDirectory from "@/components/user-directory";
import { prisma } from "@/lib/prisma";
import { listInternalUsers } from "@/features/work-orders/internal-queries";
import { requireWorkspaceUser } from "@/services/page-access";
import { managerRoles } from "@/features/navigation/workspace-items";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const roleLabels = { PORTAL_ADMINISTRATOR: "Portal administrator", VACTECH_MANAGER: "VacTech manager", VACTECH_SERVICE_USER: "VacTech service user", CUSTOMER_USER: "Customer user" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireWorkspaceUser(managerRoles);
  const params = await searchParams;
  const search = firstParam(params.search)?.trim() ?? "";
  const status = firstParam(params.status) ?? "";
  const role = firstParam(params.role) ?? "";
  const [users, allUsers, companies] = await Promise.all([
    listInternalUsers({ search, status, role }),
    listInternalUsers(),
    prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, locations: { orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
  ]);
  const filtersApplied = Boolean(search || status || role);
  const activeCount = allUsers.filter((user) => user.isActive).length;
  const internalCount = allUsers.filter((user) => user.internalRole).length;
  const customerCount = allUsers.filter((user) => user.access.length > 0).length;
  const filterKey = `${search}:${status}:${role}`;

  return <main className="min-h-screen bg-surface text-ink"><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-7"><div><div className="flex items-center gap-2 text-sm font-bold tracking-[0.1em] text-brand"><UserCheck size={17} /> USER ADMINISTRATION</div><h1 className="mt-2 text-3xl font-bold">Users and access</h1><p className="mt-2 max-w-2xl text-muted">Search accounts, review access at a glance, and open an individual record to manage roles or customer grants.</p></div><p className="text-sm font-bold text-muted">{users.length} result{users.length === 1 ? "" : "s"}</p></div><section aria-label="User directory summary" className="mt-6 grid gap-3 sm:grid-cols-3"><div className="border-l-4 border-brand bg-white p-5"><UsersRound className="text-brand" size={20} /><p className="mt-4 text-3xl font-bold">{allUsers.length}</p><p className="mt-1 text-sm text-muted">All users</p></div><div className="border-l-4 border-line bg-white p-5"><UserCheck className="text-ink" size={20} /><p className="mt-4 text-3xl font-bold">{activeCount}</p><p className="mt-1 text-sm text-muted">Active accounts</p></div><div className="border-l-4 border-line bg-white p-5"><UsersRound className="text-ink" size={20} /><p className="mt-4 text-3xl font-bold">{internalCount} / {customerCount}</p><p className="mt-1 text-sm text-muted">Internal / customer access</p></div></section><section aria-label="User filters" className="mt-8 border border-line bg-white p-5"><div className="flex items-center gap-2 text-sm font-bold text-body"><SlidersHorizontal className="text-brand" size={17} /> Find a user</div><form key={filterKey} method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="sr-only" htmlFor="user-search">Search users</label><div className="relative"><Search className="absolute left-3 top-3 text-muted" size={17} /><input className="w-full border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand" defaultValue={search} id="user-search" name="search" placeholder="Name or email" /></div><label className="sr-only" htmlFor="user-status">Account status</label><select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={status} id="user-status" name="status"><option value="">All account states</option><option value="active">Active</option><option value="disabled">Disabled</option></select><label className="sr-only" htmlFor="user-role">Role or access</label><select className="border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" defaultValue={role} id="user-role" name="role"><option value="">All roles and access</option>{Object.values(UserRole).map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select><div className="flex gap-2"><button className="flex-1 bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">Apply filters</button>{filtersApplied && <Link className="border border-brand px-3 py-2.5 text-sm font-bold text-brand" href="/workspace/users">Reset</Link>}</div></form></section><section className="mt-6"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4"><div><h2 className="text-xl font-bold">User directory</h2><p className="mt-1 text-sm text-muted">Open a user to manage account state, internal role, or customer authorization.</p></div><p className="text-sm font-bold text-muted">{filtersApplied ? "Filtered users" : "All provisioned users"}</p></div><div className="mt-5">{users.length ? <UserDirectory companies={companies} users={users} /> : <div className="border border-dashed border-line bg-white px-5 py-14 text-center"><UsersRound className="mx-auto text-muted" size={26} /><p className="mt-4 font-bold">{filtersApplied ? "No users match these filters." : "No users have been provisioned yet."}</p><p className="mt-1 text-sm text-muted">{filtersApplied ? "Change or clear the filters to broaden the user directory." : "Accounts appear after customer access approval or employee sign-in."}</p></div>}</div></section></div></main>;
}