import Link from "next/link";
import { company } from "@companynerve/company-config";
import { BrandMark } from "@companynerve/ui";
export { RecipePicker } from "./recipe-picker";
export function Header() {
  return (
    <header className="topbar">
      <Link className="wordmark" href="/">
        <BrandMark />
        {company.product.name}
      </Link>
      <nav className="navlinks" aria-label="Main">
        <Link href="/app" prefetch={false}>
          Workspace
        </Link>
        <Link href="/help">Help</Link>
        <Link href="/account" prefetch={false}>
          Account
        </Link>
      </nav>
    </header>
  );
}
