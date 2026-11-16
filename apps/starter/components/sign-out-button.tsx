"use client";
import { Button } from "@companynerve/ui";
import { clearLibraryPlaces } from "@/lib/library-place";
import { useFormStatus } from "react-dom";
export function SignOutButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      variant="outline"
      type="submit"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        try {
          clearLibraryPlaces(localStorage);
        } catch {
          /* Signing out does not depend on storage. */
        }
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
