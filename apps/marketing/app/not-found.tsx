import Link from "next/link";
import { Button } from "@companynerve/ui";
import { company } from "@companynerve/company-config";
export default function NotFound() {
  return (
    <main className="container marketing-status" id="main">
      <h1>Page not found</h1>
      <p className="muted">
        This link may have changed. Return to the website or find a guide in
        Help.
      </p>
      <div className="actions">
        <Button asChild>
          <Link href="/">Return home</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={company.website.appUrl + "/help"}>Open help</a>
        </Button>
      </div>
    </main>
  );
}
