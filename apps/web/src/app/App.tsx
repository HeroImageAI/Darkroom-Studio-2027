import { useEffect, useRef, useState } from "react";
import type {
  Asset,
  Project,
  EngineStatus,
  Job,
} from "../../../../packages/contracts/src/index.js";
import { EditWorkspace } from "../screens/EditWorkspace.js";
import { CreateWorkspace } from "../screens/CreateWorkspace.js";
import "../styles/create.css";
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
  const [references, setReferences] = useState<string[]>([]);
  const [selected, setSelected] = useState<Asset>();
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
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
    setReferences([]);
    let live = true;
    if (project)
      void api<Asset[]>("/projects/" + project + "/assets")
        .then((list) => {
          if (!live) return;
          setAssets(list);
          try {
            const saved = JSON.parse(
              localStorage.getItem("darkroom.references." + project) ?? "[]",
            );
            if (Array.isArray(saved))
              setReferences(
                saved
                  .filter(
                    (id: unknown) =>
                      typeof id === "string" && list.some((a) => a.id === id),
                  )
                  .slice(0, 3),
              );
          } catch {
            /* Ignore an invalid browser draft, never send it to the engine. */
          }
        })
        .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
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
    const imported: Asset[] = [];
    if (!project || !files.length) return;
    if (page === "Create" && references.length + files.length > 3) {
      setError(
        "Create supports up to three references. Remove a reference or import fewer images.",
      );
      return;
    }
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
        setSelectedDocument(null);
        imported.push(asset);
      }
      await refresh();
      if (page === "Create")
        setReferences((ids) => {
          const next = [
            ...new Set([...ids, ...imported.map((a) => a.id)]),
          ].slice(0, 3);
          localStorage.setItem(
            "darkroom.references." + project,
            JSON.stringify(next),
          );
          return next;
        });
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
  }, [project, page, references]);
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
      setSelectedDocument(null);
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
            onClick={async () => {
              try {
                const docs = await api<
                  { id: string; originalAssetId: string }[]
                >("/projects/" + project + "/documents");
                const existing = docs
                  .filter((d) => d.originalAssetId === a.id)
                  .at(-1);
                setSelected(a);
                setSelectedDocument(existing?.id ?? null);
                if (existing)
                  localStorage.setItem(
                    "darkroom.lastDocument." + project,
                    existing.id,
                  );
                setPage("Edit");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <img src={"/api/assets/" + a.id} alt={a.name} loading="lazy" />
            <div>
              <strong>{a.name}</strong>
              <small>
                {a.width} × {a.height}{" "}
                <span>
                  {a.origin === "generated" ? "Created image" : "Original"}
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
              onClick={() => {
                if (p === "Edit" && !selected && !selectedDocument)
                  setSelectedDocument(
                    localStorage.getItem("darkroom.lastDocument." + project),
                  );
                setPage(p);
              }}
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
                setSelectedDocument(null);
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
          <small className="foundation-label">COMPOSITE PREVIEW · 0.6</small>
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
              <CreateWorkspace
                key={project}
                projectId={project}
                assets={assets}
                references={references}
                onReferences={(ids) => {
                  setReferences(ids);
                  try {
                    localStorage.setItem(
                      "darkroom.references." + project,
                      JSON.stringify(ids),
                    );
                  } catch {
                    setError(
                      "Reference draft could not be saved in this browser.",
                    );
                  }
                }}
                prompt={prompt}
                onPrompt={setPrompt}
                onImport={() => upload.current?.click()}
                onSetup={() => {
                  setShowSetup(true);
                  void refreshSetup();
                }}
                onEdit={async (assetId, documentId) => {
                  const list = await api<Asset[]>(
                    "/projects/" + project + "/assets",
                  );
                  setAssets(list);
                  setSelected(list.find((a) => a.id === assetId));
                  localStorage.setItem(
                    "darkroom.lastDocument." + project,
                    documentId,
                  );
                  setSelectedDocument(documentId);
                  setPage("Edit");
                  setNotice("Generated version saved and opened in Edit.");
                }}
              />
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
            <EditWorkspace
              key={project + (selectedDocument ?? selected?.id ?? "")}
              projectId={project}
              asset={selected}
              documentId={selectedDocument}
              onRefresh={() => refresh()}
              assets={assets}
              onDocument={(id) => {
                localStorage.setItem("darkroom.lastDocument." + project, id);
                setSelectedDocument(id);
              }}
              onImport={() => upload.current?.click()}
            />
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
