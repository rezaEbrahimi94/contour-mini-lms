import {
  cancelResponse,
  changeResponse,
  readBookingVersion,
  readChange,
} from "@/features/consultations/server/consultation-http";
import { studentRequest } from "@/features/consultations/server/student-request";

type Context = RouteContext<"/api/consultations/[id]">;

export function PATCH(request: Request, context: Context) {
  return studentRequest(request, async ({ consultations }) => {
    const booking = readBookingVersion(request, (await context.params).id);
    const change = await readChange(request);
    return changeResponse(await consultations.change(booking, change));
  });
}

export function DELETE(request: Request, context: Context) {
  return studentRequest(request, async ({ consultations }) => {
    const booking = readBookingVersion(request, (await context.params).id);
    return cancelResponse(await consultations.cancel(booking));
  });
}
