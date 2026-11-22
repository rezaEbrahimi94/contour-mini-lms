import { ArrowDownRight } from "lucide-react";
import { Banner } from "@/components/banner";
import { Notice } from "@/components/notice";
import { PortalHeader } from "@/components/portal-header";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/features/auth/server/page-user";
import { BookingForm } from "@/features/consultations/components/booking-form";
import { ConsultationList } from "@/features/consultations/components/consultation-list";
import { pageNumber, period } from "@/features/consultations/list-query";

type Search = Promise<{
  error?: string | string[];
  page?: string | string[];
  view?: string | string[];
}>;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { user, auth, consultations } = await requirePageUser();
  const params = await searchParams;
  const page = pageNumber(params.page);
  const view = period(params.view);
  const [bookings, admin] = await Promise.all([
    consultations.findPage(page, { studentId: user.id, period: view }),
    auth.isAdmin(user.id),
  ]);
  return (
    <>
      <PortalHeader email={user.email} admin={admin} />
      <main
        id="main-content"
        className="mx-auto grid w-[min(92%,76rem)] gap-6 pt-6 pb-16 sm:gap-8 sm:pt-8"
      >
        <Banner
          title="Student dashboard"
          description="Book study time with your tutor and manage your consultations."
        >
          <Button asChild variant="secondary" size="lg" className="mt-5">
            <a href="#book">
              Book a consultation <ArrowDownRight aria-hidden="true" />
            </a>
          </Button>
        </Banner>
        {params.error === "logout" && (
          <Notice tone="error">Logout failed. Please try again.</Notice>
        )}
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <ConsultationList {...bookings} page={page} view={view} />
          <BookingForm showUpcomingLink={view === "history" || page > 1} />
        </div>
      </main>
    </>
  );
}
