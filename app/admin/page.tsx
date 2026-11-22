import { Banner } from "@/components/banner";
import { PortalHeader } from "@/components/portal-header";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/features/auth/server/page-user";
import { ConsultationList } from "@/features/consultations/components/consultation-list";
import { pageNumber } from "@/features/consultations/list-query";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { user, auth, consultations } = await requirePageUser();
  // A student who guesses this address sees the same page as for any unknown
  // address. The database would return only their own rows in any case.
  if (!(await auth.isAdmin(user.id))) notFound();
  const page = pageNumber((await searchParams).page);
  const bookings = await consultations.findPage(page);
  return (
    <>
      <PortalHeader email={user.email} admin view="admin" />
      <main
        id="main-content"
        className="mx-auto grid w-[min(92%,76rem)] gap-6 pt-6 pb-16 sm:gap-8 sm:pt-8"
      >
        <Banner
          title="Admin view"
          description="Review consultations across all students. This schedule is read-only."
        />
        <ConsultationList {...bookings} page={page} view="admin" />
      </main>
    </>
  );
}
