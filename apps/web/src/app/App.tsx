import { useEffect, useRef, useState } from "react";
import type {
  Asset,
  Project,
  EngineStatus,
  Job,
} from "../../../../packages/contracts/src/index.js";
import { api } from "../lib/api.js";
import { Button, Panel, Status } from "../components/Controls.js";
type Page = "Create" | "Edit" | "Library";
interface Setup {
  requirements: { name: string; purpose: string; status: string }[];
  optional: { name: string; status: string }[];
  engine: EngineStatus;
  workflow: { ready: boolean; reason: string };
}
export function App() {
  const [page, setPage] = useState<Page>("Create");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [setup, setSetup] = useState<Setup>();
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState(
    () => localStorage.getItem("darkroom.brief") ?? "",
  );
  const [briefSaved, setBriefSaved] = useState(true);
  const [selected, setSelected] = useState<Asset>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const upload = useRef<HTMLInputElement>(null);
  async function refresh(id = project) {
    if (id) setAssets(await api<Asset[]>("/projects/" + id + "/assets"));
  }
  async function refreshSetup() {
    try {
      setSetup(await api<Setup>("/setup"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let mounted = true;
    void api<Project[]>("/projects")
      .then(async (list) => {
        if (!list.length)
          list = [
            await api<Project>("/projects", {
              method: "POST",
              body: JSON.stringify({ name: "Untitled project" }),
            }),
          ];
        if (mounted) {
          setProjects(list);
          setProject(list[0]!.id);
        }
      })
      .catch((e) => setError(e.message));
    void refreshSetup();
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (project) void refresh(project).catch((e) => setError(e.message));
  }, [project]);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.addEventListener("update", () => {
      void api<Job[]>("/jobs").then(setJobs);
      void refresh().catch(() => {});
    });
    void api<Job[]>("/jobs")
      .then(setJobs)
      .catch(() => {});
    return () => events.close();
  }, [project]);
  async function importFiles(files: File[]) {
    if (!project || !files.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const asset = await api<Asset>("/assets?projectId=" + project, {
          method: "POST",
          body: form,
        });
        setSelected(asset);
      }
      await refresh();
      setNotice(
        `${files.length === 1 ? "Image" : "Images"} saved locally. Original files preserved.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        event.preventDefault();
        void importFiles(files);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [project]);
  async function createMaster() {
    if (!selected) return;
    setBusy(true);
    try {
      const doc = await api<{ id: string }>(
        "/projects/" + project + "/documents",
        { method: "POST", body: JSON.stringify({ assetId: selected.id }) },
      );
      setNotice(
        "Editable master saved locally. Canvas tools arrive in the next editing phase.",
      );
      localStorage.setItem("darkroom.lastDocument", doc.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function newProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    try {
      const p = await api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setProjects((v) => [p, ...v]);
      setProject(p.id);
      setSelected(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const activeJobs = jobs.filter(
    (j) =>
      !["succeeded", "failed", "cancelled", "interrupted"].includes(j.state),
  );
  const cards = (list: Asset[]) =>
    list.length ? (
      <div className="asset-grid">
        {list.map((a) => (
          <button
            className="asset-card"
            key={a.id}
            onClick={() => {
              setSelected(a);
              setPage("Edit");
            }}
          >
            <img src={"/api/assets/" + a.id} alt={a.name} loading="lazy" />
            <div>
              <strong>{a.name}</strong>
              <small>
                {a.width} × {a.height}{" "}
                <span>
                  {a.origin === "generated" ? "AI result" : "Original"}
                </span>
              </small>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <div className="empty">
        <span className="empty-symbol" aria-hidden="true">
          ▧
        </span>
        <p>No images here yet.</p>
        <small>Import an image to start your local workspace.</small>
      </div>
    );
  return (
    <>
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Create");
          }}
        >
          <img src="/mark.svg" alt="" />
          <span>
            DARKROOM<small>STUDIO 2027</small>
          </span>
        </a>
        <nav aria-label="Workspace">
          {(["Create", "Edit", "Library"] as const).map((p) => (
            <button
              key={p}
              aria-current={page === p ? "page" : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="project-header">
          <span>
            {projects.find((p) => p.id === project)?.name ??
              "Opening workspace…"}
          </span>
          <span className="save-state">
            {busy ? "Saving…" : "Local workspace"}
          </span>
        </div>
        <Button
          onClick={() => {
            setShowSetup((v) => !v);
            void refreshSetup();
          }}
        >
          Local setup <span aria-hidden="true">↗</span>
        </Button>
      </header>
      <div
        className="workspace"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          void importFiles([...e.dataTransfer.files]);
        }}
      >
        <aside className="left-panel">
          <div>
            <div className="eyebrow">WORKSPACE</div>
            <label className="field-label" htmlFor="project">
              Project
            </label>
            <select
              id="project"
              value={project}
              onChange={(e) => {
                setSelected(undefined);
                setProject(e.target.value);
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button className="wide quiet" onClick={() => void newProject()}>
              ＋ New project
            </Button>
          </div>
          <div className="sidebar-note">
            <span className="mini-mark">D / 27</span>
            <h3>
              Your ideas.
              <br />
              Your machine.
            </h3>
            <p>A quieter space for making something remarkable.</p>
            <Status ok={!!setup?.engine.verified}>
              {setup?.engine.verified
                ? "Local engine connected"
                : "Engine not connected"}
            </Status>
          </div>
          <small className="foundation-label">FOUNDATION PREVIEW · 0.1</small>
        </aside>
        <main id="workspace" tabIndex={-1}>
          {error && (
            <div role="alert" className="message error">
              {error}
              <Button onClick={() => setError("")}>Dismiss</Button>
            </div>
          )}
          {notice && (
            <div className="message" role="status">
              {notice}
              <Button onClick={() => setNotice("")}>Dismiss</Button>
            </div>
          )}
          {page === "Create" && (
            <>
              <div className="hero">
                <div className="eyebrow">
                  LOCAL AI. A NEW CREATIVE PERSPECTIVE.
                </div>
                <h1>
                  What do you want
                  <br />
                  to <span>create?</span>
                </h1>
                <p>Begin with an idea. Bring something worth exploring.</p>
                <svg
                  className="exposure"
                  viewBox="0 0 600 240"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="light">
                      <stop stopColor="var(--deep-crimson)" stopOpacity="0" />
                      <stop offset=".6" stopColor="var(--crimson)" />
                      <stop
                        offset="1"
                        stopColor="var(--deep-crimson)"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path d="M-20 225 C140 250 130 70 290 100 S440 230 630 30" />
                  <path d="M-20 235 C145 255 150 90 300 115 S460 210 640 48" />
                </svg>
              </div>
              <Panel className="composer">
                <label htmlFor="brief" className="field-label">
                  YOUR CREATIVE BRIEF
                </label>
                <textarea
                  id="brief"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setBriefSaved(false);
                  }}
                  placeholder="A sculptural bottle on dark stone. Soft edge lighting. A little unexpected…"
                />
                <div className="composer-actions">
                  <Button
                    onClick={() => upload.current?.click()}
                    disabled={busy || !project}
                  >
                    ＋ Import an image
                  </Button>
                  <span>or drop / paste an image</span>
                  <Button
                    primary
                    onClick={() => {
                      try {
                        localStorage.setItem("darkroom.brief", prompt);
                        setBriefSaved(true);
                        setNotice("Brief saved on this browser.");
                      } catch {
                        setError(
                          "Browser storage is full; copy your brief before closing.",
                        );
                      }
                    }}
                  >
                    {briefSaved ? "Save brief" : "Save brief · unsaved"}
                  </Button>
                </div>
              </Panel>
              <div className="phase-note">
                <span>01 / FOUNDATION</span>
                <p>
                  Your local workspace is taking shape. Save a brief or import
                  an image.
                  <br />
                  Image creation and result review are the next phase.
                </p>
              </div>
              <div className="section-heading">
                <h2>Recent work</h2>
                <Button className="quiet" onClick={() => setPage("Library")}>
                  Open library ↗
                </Button>
              </div>
              {cards(assets.slice(0, 4))}
            </>
          )}
          {page === "Edit" && (
            <>
              <div className="page-heading">
                <div className="eyebrow">ONE IMAGE. NEW POSSIBILITIES.</div>
                <h1>Your workspace.</h1>
                <p>Keep the original. Make room for what comes next.</p>
              </div>
              <div className="canvas-area">
                {selected ? (
                  <img src={"/api/assets/" + selected.id} alt={selected.name} />
                ) : (
                  <div className="empty">
                    <span className="empty-symbol">▧</span>
                    <h2>Start with an image</h2>
                    <p>Drop, paste or open a file.</p>
                    <Button primary onClick={() => upload.current?.click()}>
                      Open an image ↗
                    </Button>
                  </div>
                )}
              </div>
              {selected && (
                <div className="image-bar">
                  <div>
                    <strong>{selected.name}</strong>
                    <small>
                      {selected.width} × {selected.height} ·{" "}
                      {selected.alpha ? "With transparency" : "Opaque image"} ·
                      Original preserved
                    </small>
                  </div>
                  <Button onClick={() => void createMaster()} disabled={busy}>
                    Save initial master
                  </Button>
                  <a
                    className="button"
                    href={"/api/assets/" + selected.id}
                    download={selected.name}
                  >
                    Download source ↗
                  </a>
                </div>
              )}
              <p className="muted">
                Image preview and initial master storage are available. Canvas
                editing tools belong to the next editing phase.
              </p>
            </>
          )}
          {page === "Library" && (
            <>
              <div className="page-heading">
                <div className="eyebrow">A RECORD OF YOUR IMAGINATION</div>
                <h1>Your work, close by.</h1>
                <p>Originals and results. Saved on this device.</p>
              </div>
              <div className="section-heading">
                <label className="search">
                  <span className="sr-only">Search images</span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search images in this project…"
                  />
                </label>
                <Button onClick={() => upload.current?.click()} disabled={busy}>
                  ＋ Import image
                </Button>
              </div>
              {cards(
                assets.filter((a) =>
                  a.name.toLowerCase().includes(search.toLowerCase()),
                ),
              )}
            </>
          )}
          <footer>
            <span>CREATE. EDIT. FINISH.</span>
            <span>LOCAL BY DESIGN</span>
          </footer>
        </main>
        {showSetup && (
          <aside className="right-panel" aria-label="Local setup">
            <div className="section-heading">
              <h2>Local setup</h2>
              <Button
                onClick={() => setShowSetup(false)}
                aria-label="Close local setup"
              >
                ×
              </Button>
            </div>
            <Status ok={!!setup?.engine.verified}>
              {setup?.engine.verified
                ? "Desktop verified"
                : "Connection required"}
            </Status>
            <p>
              {setup?.engine.reason ??
                "Your creative engine stays on your machine."}
            </p>
            <dl>
              <dt>Engine</dt>
              <dd>{setup?.engine.version ?? "Not connected"}</dd>
              <dt>Device</dt>
              <dd>{setup?.engine.device ?? "Not detected"}</dd>
              <dt>Workflow</dt>
              <dd>{setup?.workflow.reason ?? "Checking…"}</dd>
            </dl>
            <Button onClick={() => void refreshSetup()}>
              Check connection
            </Button>
            <h3>Required for image creation</h3>
            {setup?.requirements?.map((model) => (
              <div key={model.name}>
                <strong className="muted">{model.purpose}</strong>
                <p className="model-name">{model.name}</p>
                <p>{model.status}</p>
              </div>
            ))}
            {setup?.optional?.map((model) => (
              <p key={model.name}>
                {model.name}
                <br />
                {model.status}
              </p>
            ))}
            <details>
              <summary>Installed image models</summary>
              {Object.entries(setup?.engine.models ?? {}).map(
                ([kind, names]) => (
                  <div key={kind}>
                    <h3>{kind}</h3>
                    {names.map((n) => (
                      <p className="model-name" key={n}>
                        {n}
                      </p>
                    ))}
                  </div>
                ),
              )}
            </details>
            <p className="muted">
              No models are downloaded or changed by this workspace.
            </p>
          </aside>
        )}
      </div>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void importFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {activeJobs.length > 0 && (
        <div className="job-status" role="status">
          Local task · {activeJobs[0]?.state}
        </div>
      )}
    </>
  );
}
