import { PublicPage } from "./site";

export function PublicLoading({ reader = false }: { reader?: boolean }) {
  return (
    <PublicPage layout={reader ? "reader" : "standard"}>
      <section className="public-loading" aria-busy="true">
        <output className="sr-only">Loading public knowledge</output>
        <div aria-hidden="true">
          <span />
          <span />
          <div className="public-card-grid">
            {(reader ? ["evidence"] : ["first", "second", "third"]).map(
              (key) => (
                <div key={key} className="public-list-card">
                  <span />
                  <span />
                  <span />
                </div>
              ),
            )}
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
