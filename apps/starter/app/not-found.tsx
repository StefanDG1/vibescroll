import Link from "next/link";
import { PublicIntro, PublicPage } from "@/components/site";
export default function NotFound() {
  return (
    <PublicPage layout="form">
      <PublicIntro title="Page not found">
        <p>
          This link may have changed. Return to the website or find what you
          need in Help.
        </p>
      </PublicIntro>
      <div className="public-actions">
        <Link className="primary" href="/">
          Return home
        </Link>
        <Link className="secondary" href="/help">
          Help guides
        </Link>
      </div>
    </PublicPage>
  );
}
