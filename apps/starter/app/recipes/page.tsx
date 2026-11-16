import { RecipePicker } from "@/components/header";
import { PublicIntro, PublicPage } from "@/components/site";
import { recipes } from "@companynerve/design-recipes";
import { Card, Input, Label, Button, Badge } from "@companynerve/ui";
export default function Page() {
  return (
    <PublicPage>
      <PublicIntro title="Design recipes">
        <p>Compare palettes and form states in the browser.</p>
      </PublicIntro>
      <RecipePicker />
      <div className="recipe-grid public-recipe-grid">
        {recipes.map((r) => (
          <Card
            key={r.id}
            style={{ background: r.bg, color: r.color, padding: 20 }}
          >
            <h3>{r.name}</h3>
            <p style={{ fontSize: ".8rem" }}>{r.description}</p>
          </Card>
        ))}
      </div>
      <section className="section split public-recipe-samples">
        <Card>
          <h2>Form and feedback</h2>
          <Label htmlFor="sample-name">Project name</Label>
          <Input id="sample-name" placeholder="Research workspace" />
          <div className="actions">
            <Button type="button" disabled>
              Preview button
            </Button>
            <Badge>Example</Badge>
          </div>
          <p className="error" style={{ marginTop: 25 }}>
            Example error: enter a project name.
          </p>
          <p className="success">Example success: project saved.</p>
        </Card>
        <Card>
          <h2>An empty workspace.</h2>
          <p className="muted">
            When the app has no projects, it explains the next useful action.
          </p>
          <p className="muted">
            These are visual examples. They do not save data or simulate a
            signed-in user.
          </p>
        </Card>
      </section>
    </PublicPage>
  );
}
