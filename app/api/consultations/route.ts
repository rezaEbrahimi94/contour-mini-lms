import { bookConsultation } from "@/features/consultations/server/book-consultation";
import {
  bookResponse,
  pageResponse,
  readBooking,
  readPageNumber,
} from "@/features/consultations/server/consultation-http";
import { studentRequest } from "@/features/consultations/server/student-request";

export function GET(request: Request) {
  return studentRequest(request, async ({ studentId, consultations }) => {
    const page = readPageNumber(request);
    return pageResponse(await consultations.findPage(page, { studentId }));
  });
}

export function POST(request: Request) {
  return studentRequest(request, async ({ studentId, consultations }) => {
    const booking = await readBooking(request);
    const outcome = await bookConsultation(consultations, studentId, booking);
    return bookResponse(outcome);
  });
}
