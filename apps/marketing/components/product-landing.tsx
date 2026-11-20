import { company } from "@companynerve/company-config";
import { Button } from "@companynerve/ui";
import { ArrowUpRight, Bookmark, FolderGit2, Lightbulb } from "lucide-react";
import { Header, Footer } from "./site";

const app = company.website.appUrl;

const stages = [
  {
    title: "Saved post",
    copy: "Help someone see an example before they set up a project.",
    Icon: Bookmark,
  },
  {
    title: "Insight",
    copy: "Show one editable result before asking a new user to connect anything.",
    Icon: Lightbulb,
  },
  {
    title: "Project review",
    copy: "Review how an example could fit your current onboarding experience.",
    Icon: FolderGit2,
  },
];

export function ProductLanding() {
  return (
    <div className="container product-marketing">
      <Header />
      <main id="main">
        <section className="hero">
          <div>
            <h1>Put your saved posts to work.</h1>
            <p>
              Save useful posts, check the evidence behind their ideas, and
              decide what fits a project.
            </p>
            <div className="actions">
              <Button asChild>
                <a href={app + "/app"}>
                  Open VibeScroll <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={app + "/example"}>See an example</a>
              </Button>
            </div>
          </div>
          <figure className="marketing-result">
            <figcaption>Synthetic example</figcaption>
            <ol>
              {stages.map(({ title, copy, Icon }) => (
                <li key={title}>
                  <span>
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </figure>
        </section>
        <section className="section" id="included">
          <h2>Read the source before you start work</h2>
          <p>
            Keep the insight beside the post that inspired it. Connect a GitHub
            project when you want to check whether the idea fits.
          </p>
          <div className="actions">
            <a href={app + "/how-it-works"}>How it works</a>
            <a href={app + "/pricing"}>Pro plans</a>
            <a href={app + "/help"}>Help</a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
