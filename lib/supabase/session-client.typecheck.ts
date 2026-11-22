import type { AuthRepository } from "../../features/auth/server/auth-repository";
import type { ConsultationRepository } from "../../features/consultations/server/consultation-repository";
import type { operatorClient } from "../../tests/support/operator";
import type { SessionClient } from "./session-client";

// Compiled by tsc. Either constructor accepting a raw operator client breaks the build.
type Operator = ReturnType<typeof operatorClient>;
type Accepts<Argument, Input> = Input extends Argument ? true : false;
type AuthInput = ConstructorParameters<typeof AuthRepository>[0];
type ConsultationInput = ConstructorParameters<
  typeof ConsultationRepository
>[0];
type MustBeTrue<T extends true> = T;
type MustBeFalse<T extends false> = T;
export type SessionBoundary = [
  MustBeTrue<Accepts<AuthInput, SessionClient>>,
  MustBeTrue<Accepts<ConsultationInput, SessionClient>>,
  MustBeFalse<Accepts<AuthInput, Operator>>,
  MustBeFalse<Accepts<ConsultationInput, Operator>>,
];
