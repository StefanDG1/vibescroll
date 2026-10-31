import { authenticationSignInPath } from "../../../packages/policy/reauthentication";
export class SignInRedirect extends Error {
  constructor() {
    super("Redirecting to sign-in...");
    this.name = "SignInRedirect";
  }
}
type AuthenticationLocation = {
  pathname: string;
  search: string;
  assign: (url: string) => void;
};
export function redirectForAuthentication(
  fresh = true,
  location: AuthenticationLocation = window.location,
): never {
  location.assign(
    authenticationSignInPath(location.pathname + location.search, fresh),
  );
  throw new SignInRedirect();
}
