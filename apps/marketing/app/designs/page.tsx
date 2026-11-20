import { Header, Footer, RecipeGallery } from "@/components/site";
export const metadata = {
  title: "Five design directions",
  alternates: { canonical: "/designs" },
};
export default function Page() {
  return (
    <div className="container">
      <Header />
      <main id="main" className="section marketing-gallery">
        <div className="section-head">
          <h1>Design recipe gallery</h1>
          <p className="muted">
            Open a CompanyNerve design recipe to compare its type, color and
            layout.
          </p>
        </div>
        <RecipeGallery />
        <section className="section">
          <h2>Our current starting point</h2>
          <p>
            Cobalt workshop is the selected CompanyNerve design. The other four
            remain available, and every recipe can be customized for a separate
            product.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
