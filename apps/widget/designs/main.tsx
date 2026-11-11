import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  Link,
  List,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Play,
  Plus,
  Search,
  Settings,
  Sun,
  ThumbsUp,
  X,
} from "lucide-react";
import "./style.css";

const items = [
  {
    title: "Let people try the useful part first",
    topic: "Onboarding",
    text: "Show the result before asking people to connect every part of their workflow. A useful first insight can make the next setup step easier to understand.",
    source: "Designing a useful first experience",
    time: "01:42 to 02:18",
    date: "Today",
    state: "For review",
  },
  {
    title: "Keep the evidence next to the idea",
    topic: "Knowledge systems",
    text: "A claim is easier to assess when its source and original context are close by. Let people inspect the evidence without losing their place.",
    source: "Building tools people trust",
    time: "03:12 to 03:44",
    date: "Yesterday",
    state: "Useful",
  },
  {
    title: "Give every insight a clear next step",
    topic: "Product design",
    text: "The next action should follow from the insight. Make reviewing the evidence, comparing an idea, or applying it to a project an explicit choice.",
    source: "From saved content to useful work",
    time: "02:05 to 02:39",
    date: "Yesterday",
    state: "Proposal drafted",
  },
  {
    title: "Make returning feel effortless",
    topic: "Interaction design",
    text: "Restore the reading position and current selection when someone returns to a saved source. Keep navigation stable while details load.",
    source: "Small details in everyday software",
    time: "04:12 to 04:51",
    date: "Monday",
    state: "For review",
  },
];
const options = {
  a: {
    name: "Library sidebar",
    explain: "Find an idea in the list. Its evidence stays open on the right.",
  },
  b: {
    name: "Chat cards",
    explain:
      "Ask in the conversation. Browse useful results as cards inside the answer.",
  },
  c: {
    name: "Review board",
    explain:
      "Move from new ideas to useful ideas and private proposals, with your project in view.",
  },
};
type Design = keyof typeof options;
const qs = new URLSearchParams(location.search);
function App() {
  const [design, setDesign] = useState<Design>(
    (qs.get("style") as Design) || "a",
  );
  const [screen, setScreen] = useState(qs.get("screen") || "Library");
  const [selected, select] = useState(0);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(qs.has("dark"));
  const [narrow, setNarrow] = useState(false);
  const [notice, setNotice] = useState("");
  const [useful, setUseful] = useState(false);
  const [saved, setSaved] = useState(false);
  const [url, setUrl] = useState("");
  const nav = ["Library", "Save", "Projects", "Setup", "Account"];
  const found = items
    .map((item, index) => ({ ...item, index }))
    .filter((item) =>
      `${item.title} ${item.topic}`.toLowerCase().includes(query.toLowerCase()),
    );
  const item = items[selected];
  const choose = async () => {
    const choice = {
      style: design,
      name: options[design].name,
      date: new Date().toISOString(),
    };
    try {
      await fetch("http://127.0.0.1:4317/choice", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(choice),
      });
    } catch {
      /* Selection can also be given in chat. */
    }
    setNotice(
      `Selected ${design.toUpperCase()}: ${options[design].name}. You can also tell me your choice in chat.`,
    );
  };
  const open = (index: number) => {
    select(index);
    setScreen("Insight");
  };
  const evidence = (
    <div className="evidence-block">
      <div className="eyeline">
        <Play size={14} /> {item.time}
      </div>
      <blockquote>
        “Show people the useful result at the moment they have enough context to
        understand it.”
      </blockquote>
      <div className="source-foot">
        <span>{item.source}</span>
        <ExternalLink size={13} />
      </div>
    </div>
  );
  const detail = (
    <>
      <div className="detail-meta">
        <span className="topic">{item.topic}</span>
        <button aria-label="More options">
          <MoreHorizontal size={18} />
        </button>
      </div>
      <h2>{item.title}</h2>
      <p className="body-copy">{item.text}</p>
      <div className="smallheading">Source evidence</div>
      {evidence}
      <div className="smallheading">Could this help your project?</div>
      <div className="project-link">
        <span className="iconbox">
          <Folder size={17} />
        </span>
        <div>
          <b>VibeScroll</b>
          <span>Review how this applies to onboarding</span>
        </div>
        <ChevronRight size={16} />
      </div>
      <div className="detail-actions">
        <button
          className={useful ? "positive" : "outline"}
          onClick={() => setUseful(!useful)}
        >
          <ThumbsUp size={15} />
          {useful ? "Marked useful" : "Useful"}
        </button>
        <button
          className="outline"
          onClick={() =>
            setNotice(
              "This preview would attach the selected insight and its citations to your conversation.",
            )
          }
        >
          <MessageSquare size={15} /> Discuss this
        </button>
      </div>
    </>
  );
  const regularLibrary = (
    <>
      <div className="titleline">
        <div>
          <h1>Your library</h1>
          <p>Saved ideas, ready when you need them.</p>
        </div>
        <button className="solid" onClick={() => setScreen("Save")}>
          <Plus size={16} /> Save a link
        </button>
      </div>
      <div className="library-tools">
        <label className="searchfield">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your library"
          />
          <kbd>⌘ K</kbd>
        </label>
        <button className="outline">
          <List size={16} /> Recently saved <ChevronDown size={14} />
        </button>
      </div>
      <div className="library-tabs">
        <button className="selected">Insights</button>
        <button
          onClick={() =>
            setNotice(
              "Sources view shows the original sources behind these insights.",
            )
          }
        >
          Sources
        </button>
        <button
          onClick={() =>
            setNotice(
              "Topics view groups insights without changing their access permissions.",
            )
          }
        >
          Topics
        </button>
        <span>4 sample insights</span>
      </div>
      <div className="library-layout">
        <div className="insight-list">
          {found.map((entry) => (
            <button
              key={entry.index}
              className={`insight-row ${selected === entry.index ? "selected" : ""}`}
              onClick={() => select(entry.index)}
            >
              <div className="row-top">
                <span className="topic">{entry.topic}</span>
                <span>{entry.date}</span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.text}</p>
              <div className="row-foot">
                <Play size={12} /> {entry.source}
                <ChevronRight size={15} />
              </div>
            </button>
          ))}
        </div>
        <aside className="detail-panel">{detail}</aside>
      </div>
    </>
  );
  const conversationLibrary = (
    <div className="conversation">
      <div className="user-message">
        What have I saved that could improve VibeScroll's onboarding?
      </div>
      <div className="assistant-name">
        <span className="brandmark">v</span>VibeScroll
      </div>
      <p className="assistant-copy">
        These three ideas from your library look useful. Each keeps its original
        source attached, so you can check the context before applying it.
      </p>
      <div className="chat-results">
        {items.slice(0, 3).map((entry, index) => (
          <article className="chat-result" key={entry.title}>
            <div className="row-top">
              <span className="topic">{entry.topic}</span>
              <BookOpen size={16} />
            </div>
            <h2>{entry.title}</h2>
            <p>{entry.text}</p>
            <div className="chat-citation">
              <Play size={13} /> {entry.source} <span>{entry.time}</span>
            </div>
            <div className="chat-result-actions">
              <button onClick={() => open(index)}>
                View evidence <ArrowRight size={14} />
              </button>
              <button
                onClick={() =>
                  setNotice("Marked useful in this illustrative preview.")
                }
                aria-label="Mark useful"
              >
                <ThumbsUp size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="reply-suggestions">
        <button
          onClick={() => {
            select(0);
            setScreen("Projects");
          }}
        >
          Apply these to VibeScroll
        </button>
        <button onClick={() => open(1)}>Compare the evidence</button>
      </div>
      <div className="host-composer">
        <Plus size={20} />
        <span>Ask about your saved insights</span>
        <button aria-label="Send">
          <ArrowUp size={17} />
        </button>
      </div>
    </div>
  );
  const reviewBoard = (
    <>
      <div className="project-title">
        <span className="large-icon">
          <Folder size={23} />
        </span>
        <div>
          <div className="row-top">
            <h1>VibeScroll</h1>
            <span className="status">Context confirmed</span>
          </div>
          <p>Turn saved knowledge into useful project improvements.</p>
        </div>
        <button className="outline" onClick={() => setScreen("Projects")}>
          Project context <ChevronRight size={15} />
        </button>
      </div>
      <div className="board-toolbar">
        <div className="board-tabs">
          <button className="selected">Idea review</button>
          <button onClick={() => setScreen("Projects")}>Proposals</button>
          <button onClick={() => setScreen("Projects")}>Plans & runs</button>
        </div>
        <button className="solid" onClick={() => setScreen("Save")}>
          <Plus size={15} /> Add a source
        </button>
      </div>
      <div className="review-columns">
        {["For review", "Useful", "Proposal drafted"].map((state, column) => (
          <section className="review-column" key={state}>
            <header>
              <span className={`stage-dot stage-${column}`} />
              <b>{state}</b>
              <span>{items.filter((i) => i.state === state).length}</span>
            </header>
            {items.map(
              (entry, index) =>
                entry.state === state && (
                  <button
                    className="review-card"
                    key={entry.title}
                    onClick={() => open(index)}
                  >
                    <span className="topic">{entry.topic}</span>
                    <h3>{entry.title}</h3>
                    <p>{entry.text}</p>
                    <div className="row-foot">
                      <Play size={12} />
                      {entry.source}
                    </div>
                    <div className="board-card-end">
                      {state === "Proposal drafted" ? (
                        <>
                          <FileText size={13} /> Private draft · Version 3
                        </>
                      ) : (
                        <>
                          <Link size={13} /> Source evidence available
                        </>
                      )}
                      <ChevronRight size={14} />
                    </div>
                  </button>
                ),
            )}
          </section>
        ))}
      </div>
      <div className="board-note">
        <CircleHelp size={16} />
        <span>
          Reviewing an idea or creating a private draft does not start coding or
          publish anything.
        </span>
      </div>
    </>
  );
  const saveScreen = (
    <div className="single-page">
      <h1>Save something useful</h1>
      <p className="subtitle">
        Send a source to your library. Your approved preferences handle the
        rest.
      </p>
      <label className="form-label" htmlFor="design-source-link">
        Source link
      </label>
      <div className="urlfield">
        <Link size={18} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          id="design-source-link"
          placeholder="Paste a video or supported source URL"
        />
        <button className="solid" onClick={() => setSaved(true)}>
          Save link <ArrowRight size={16} />
        </button>
      </div>
      <div className="preference-line">
        <Cloud size={17} />
        <span>Automatic insights with Work Cloud</span>
        <button onClick={() => setScreen("Account")}>Your preferences</button>
      </div>
      <div className="processing-card">
        <header>
          <span className="iconbox">
            <Play size={19} />
          </span>
          <div>
            <h2>
              {saved
                ? "Your source is saved"
                : "Designing a useful first experience"}
            </h2>
            <p>
              {saved
                ? "Illustrative save receipt"
                : "Example of how a saved source appears"}
            </p>
          </div>
          <span className="status">{saved ? "Saved" : "Analyzing"}</span>
        </header>
        {[
          "Link saved",
          "Source prepared",
          "Finding useful insights",
          "Available in your library",
        ].map((step, index) => (
          <div
            className={`processing-step ${index > 2 ? "waiting" : ""}`}
            key={step}
          >
            <span className={`step-circle ${index > 1 ? "unfilled" : ""}`}>
              {index < 2 ? <Check size={14} /> : index + 1}
            </span>
            <span>{step}</span>
            <small>
              {index < 2 ? "Complete" : index === 2 ? "In progress" : ""}
            </small>
          </div>
        ))}
        <footer>
          <span>You can leave and return later.</span>
          <button className="outline" onClick={() => open(0)}>
            View source <ArrowRight size={15} />
          </button>
        </footer>
      </div>
      <p className="sample-note">
        This is an interactive design preview. Saving here does not create a
        source or start analysis.
      </p>
    </div>
  );
  const projects = (
    <>
      <div className="titleline">
        <div>
          <h1>VibeScroll</h1>
          <p>Project ideas, reviewed against the context you confirmed.</p>
        </div>
        <span className="status">Private workspace</span>
      </div>
      <div className="library-tabs">
        <button>Context</button>
        <button className="selected">Ideas & proposals</button>
        <button>Plans</button>
        <button>Runs & PRs</button>
      </div>
      <div className="proposal-layout">
        <article className="proposal-editor">
          <span className="status">Private draft</span>
          <h2>Give new users a useful insight before more setup</h2>
          <p className="body-copy">
            Based on selected source evidence and the current VibeScroll project
            context.
          </p>
          <div className="form-label">Why this fits</div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="editable"
          >
            VibeScroll can help someone understand a saved video before they
            connect a repository. Keep the first useful result visible, then
            offer project setup when it becomes relevant.
          </div>
          <div className="form-label">Proposed change</div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="editable"
          >
            Show the first insight with its source evidence. Offer one clear
            action to explore the result and a secondary action to connect a
            project.
          </div>
          <div className="editor-footer">
            <span>
              <Link size={14} /> 2 cited insights · Version 3
            </span>
            <button
              className="solid"
              onClick={() =>
                setNotice(
                  "The working widget would open the exact protected proposal review.",
                )
              }
            >
              Review proposal <ArrowRight size={15} />
            </button>
          </div>
        </article>
        <aside className="review-trail">
          <h3>Review trail</h3>
          {[
            "Evidence selected",
            "Project fit reviewed",
            "Private proposal drafted",
            "Your review and approval",
          ].map((text, i) => (
            <div className="trail-step" key={text}>
              <span className={`step-circle ${i === 3 ? "unfilled" : ""}`}>
                {i < 3 ? <Check size={14} /> : "4"}
              </span>
              <div>
                <b>{text}</b>
                <p>
                  {
                    [
                      "2 current insights",
                      "Relevant to onboarding",
                      "Manual edits preserved",
                      "Required before published work",
                    ][i]
                  }
                </p>
              </div>
            </div>
          ))}
          <p className="sample-note">
            No code execution or publication has started.
          </p>
        </aside>
      </div>
    </>
  );
  const setup = (
    <div className="single-page setup-page">
      <h1>Welcome to your VibeScroll library</h1>
      <p className="subtitle">
        A few choices to keep your knowledge private and your workflow clear.
      </p>
      {[
        [
          "Your account is connected",
          "Signed in with your VibeScroll account.",
        ],
        [
          "Choose a workspace",
          "Only the library you approve is available here.",
        ],
        [
          "Automatically find insights",
          "Use Work Cloud when you send a supported link.",
        ],
        [
          "Projects can wait",
          "You can use your library before connecting a repository.",
        ],
      ].map(([title, text], i) => (
        <div className="setup-item" key={title}>
          <span className={`step-circle ${i ? "unfilled" : ""}`}>
            {i ? i + 1 : <Check size={14} />}
          </span>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
            {i === 1 && (
              <button className="select-field">
                Personal workspace <ChevronDown size={16} />
              </button>
            )}
            {i === 2 && (
              <div className="preference-line">
                <Cloud size={17} />
                <span>Work Cloud · Your own supported plan</span>
                <span className="toggle" />
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="setup-bottom">
        <span>You can review these preferences later.</span>
        <button className="solid" onClick={() => setScreen("Library")}>
          Open my library <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
  const account = (
    <div className="single-page">
      <h1>Your account</h1>
      <p className="subtitle">
        Your connection, preferences, and current usage.
      </p>
      {[
        [
          "Personal workspace",
          "Personal library · Access until revoked",
          "Review access",
        ],
        [
          "Automatic insight analysis",
          "Use Work Cloud when you save a supported link.",
          "On",
        ],
        [
          "Project evaluation",
          "Evaluate against a project when you request it.",
          "On request",
        ],
        [
          "Completion notifications",
          "Notify this conversation about approved completed work.",
          "Review setup",
        ],
        [
          "Appearance",
          "Follow the host's light or dark theme.",
          "Use host theme",
        ],
        [
          "Privacy and data",
          "Review your data and connected accounts.",
          "Account settings",
        ],
      ].map(([title, text, value]) => (
        <div className="setting-item" key={title}>
          <div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
          <button
            onClick={() =>
              setNotice(
                "This preview demonstrates the setting layout. No account setting was changed.",
              )
            }
          >
            {value}
            <ChevronRight size={15} />
          </button>
        </div>
      ))}
      <div className="usage-summary">
        <Cloud size={22} />
        <div>
          <h3>Usage stays with your account</h3>
          <p>
            Completed work, reservations, and unresolved usage are shown
            separately in the working widget.
          </p>
        </div>
      </div>
      <p className="sample-note">
        All content in these design previews is illustrative.
      </p>
    </div>
  );
  const content =
    screen === "Library" ? (
      design === "b" ? (
        conversationLibrary
      ) : design === "c" ? (
        reviewBoard
      ) : (
        regularLibrary
      )
    ) : screen === "Insight" ? (
      <div className="full-detail">
        <button className="back" onClick={() => setScreen("Library")}>
          ← Back to library
        </button>
        {detail}
      </div>
    ) : screen === "Save" ? (
      saveScreen
    ) : screen === "Projects" ? (
      projects
    ) : screen === "Setup" ? (
      setup
    ) : (
      account
    );
  return (
    <div
      className={`design-page ${dark ? "dark" : ""} ${narrow ? "narrow" : ""}`}
    >
      <div className="design-toolbar">
        <div className="design-intro">
          <b>Choose how VibeScroll works</b>
          <span>Real TypeScript previews · Illustrative data</span>
        </div>
        <div className="design-options">
          {Object.entries(options).map(([key, option]) => (
            <button
              className={key === design ? "active" : ""}
              key={key}
              onClick={() => {
                setDesign(key as Design);
                setScreen("Library");
              }}
            >
              <span>{key.toUpperCase()}</span>
              {option.name}
            </button>
          ))}
        </div>
        <button
          className="mode-button"
          onClick={() => setDark(!dark)}
          aria-label="Toggle light/dark"
        >
          <Sun size={18} />
        </button>
        <button className="mode-button" onClick={() => setNarrow(!narrow)}>
          {narrow ? "Desktop" : "Phone"}
        </button>
        <button className="solid" onClick={choose}>
          Choose {design.toUpperCase()}
        </button>
      </div>
      <div className="design-explainer">
        <b>{options[design].name}</b>
        <span>{options[design].explain}</span>
        <span className="explainer-hint">
          Try the navigation, select an insight, or open its evidence.
        </span>
      </div>
      <div className={`app-shell ${design}`}>
        {design !== "b" && (
          <aside className="sidebar">
            <div className="brand">
              <span className="brandmark">v</span>VibeScroll
              <button aria-label="Collapse sidebar">
                <PanelLeft size={17} />
              </button>
            </div>
            <button
              className="side-search"
              onClick={() => setScreen("Library")}
            >
              <Search size={17} /> Search library
            </button>
            <nav>
              {nav.map((name, i) => {
                const Icon = [BookOpen, Plus, Folder, GitBranch, Settings][i];
                return (
                  <button
                    className={
                      screen === name ||
                      (name === "Library" && screen === "Insight")
                        ? "active"
                        : ""
                    }
                    onClick={() => setScreen(name)}
                    key={name}
                  >
                    <Icon size={18} />
                    {name}
                  </button>
                );
              })}
            </nav>
            <div className="side-label">
              {design === "c" ? "YOUR PROJECTS" : "YOUR TOPICS"}
            </div>
            {(design === "c"
              ? ["VibeScroll", "Website redesign", "Personal knowledge"]
              : [
                  "Product design",
                  "Onboarding",
                  "Knowledge systems",
                  "Engineering",
                ]
            ).map((topic) => (
              <button
                className="side-topic"
                key={topic}
                onClick={() => {
                  setQuery(topic === "VibeScroll" ? "" : topic);
                  setScreen("Library");
                }}
              >
                {design === "c" ? (
                  <Folder size={15} />
                ) : (
                  <GitBranch size={15} />
                )}
                {topic}
              </button>
            ))}
            <div className="sidebar-bottom">
              <span className="avatar">S</span>
              <div>
                <b>Personal workspace</b>
                <span>Connected to VibeScroll</span>
              </div>
              <ChevronDown size={14} />
            </div>
          </aside>
        )}
        <div className="app-main">
          <header className="app-header">
            <div className="breadcrumb">
              {design === "b" ? (
                <>
                  <span className="brandmark">v</span>
                  <b>VibeScroll</b>
                </>
              ) : (
                <>
                  <span>Personal workspace</span>
                  <ChevronRight size={14} />
                  <b>{screen}</b>
                </>
              )}
            </div>
            {design === "b" && (
              <nav className="top-navigation">
                {nav.map((name) => (
                  <button
                    className={screen === name ? "active" : ""}
                    onClick={() => setScreen(name)}
                    key={name}
                  >
                    {name}
                  </button>
                ))}
              </nav>
            )}
            <div className="connected">
              <span />
              Connected<span className="avatar">S</span>
            </div>
          </header>
          <main className="main-content">{content}</main>
        </div>
      </div>
      {notice && (
        <output className="notice">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={16} />
          </button>
        </output>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
