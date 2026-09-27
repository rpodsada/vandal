import { useEffect, useState, type ComponentType } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Settings } from "../shared/ipc";
import { controls, type ControlProps } from "./controls";
import { SearchIcon } from "./icons";
import { matchesQuery, type Group, type Item, type Section } from "./schema";
import { sections } from "./sections";
import { useSettingsStore } from "./store";
import styles from "./SettingsApp.module.css";

export function SettingsApp() {
  const settings = useSettingsStore((s) => s.settings);
  const error = useSettingsStore((s) => s.error);
  const clearError = useSettingsStore((s) => s.clearError);
  const [activeId, setActiveId] = useState(sections[0].id);
  const [query, setQuery] = useState("");
  const loaded = settings !== null;

  useEffect(() => {
    void useSettingsStore.getState().init();
  }, []);

  // The window starts hidden; show it once there's something to show.
  useEffect(() => {
    if (!loaded) return;
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());
  }, [loaded]);

  if (!settings) return null;

  const q = query.trim();
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <div className={styles.app}>
      <nav className={styles.nav}>
        <label className={styles.search}>
          <SearchIcon />
          <input
            type="search"
            placeholder="Find a setting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
        </label>
        <ul className={styles.navList}>
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                className={styles.navItem}
                aria-current={!q && section.id === active.id ? "page" : undefined}
                onClick={() => {
                  setActiveId(section.id);
                  setQuery("");
                }}
              >
                <section.icon />
                {section.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className={styles.main}>
        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError}>
              Dismiss
            </button>
          </div>
        )}
        {q ? (
          <SearchResults query={q} settings={settings} />
        ) : (
          <SectionPage section={active} settings={settings} />
        )}
      </main>
    </div>
  );
}

function SectionPage({ section, settings }: { section: Section; settings: Settings }) {
  return (
    <>
      <h1 className={styles.title}>{section.title}</h1>
      {section.description && <p className={styles.sectionDescription}>{section.description}</p>}
      {section.groups.map((group, i) => (
        <GroupCard key={group.title ?? i} group={group} settings={settings} />
      ))}
    </>
  );
}

function SearchResults({ query, settings }: { query: string; settings: Settings }) {
  const results = sections
    .map((section) => ({
      section,
      items: section.groups.flatMap((g) => g.items).filter((i) => matchesQuery(i, section, query)),
    }))
    .filter((r) => r.items.length > 0);

  return (
    <>
      <h1 className={styles.title}>Search</h1>
      {results.length === 0 && <p className={styles.empty}>No settings match “{query}”.</p>}
      {results.map(({ section, items }) => (
        <GroupCard key={section.id} group={{ title: section.title, items }} settings={settings} />
      ))}
    </>
  );
}

function GroupCard({ group, settings }: { group: Group; settings: Settings }) {
  const items = group.items.filter((item) => item.visible?.(settings) ?? true);
  if (items.length === 0) return null;
  return (
    <section className={styles.group}>
      {group.title && <h2 className={styles.groupTitle}>{group.title}</h2>}
      {group.description && <p className={styles.groupDescription}>{group.description}</p>}
      <div className={styles.card}>
        {items.map((item) => (
          <Row key={item.id} item={item} settings={settings} />
        ))}
      </div>
    </section>
  );
}

function Row({ item, settings }: { item: Item; settings: Settings }) {
  const def = controls[item.kind];
  const Control = def.component as ComponentType<ControlProps<Item>>;
  const disabled = item.disabled?.(settings) ?? false;
  const id = `setting-${item.id}`;
  return (
    <div
      className={def.layout === "stacked" ? styles.rowStacked : styles.row}
      data-disabled={disabled || undefined}
    >
      <div className={styles.rowText}>
        <label htmlFor={id} className={styles.label}>
          {item.label}
        </label>
        {item.description && <p className={styles.description}>{item.description}</p>}
      </div>
      <div className={styles.control}>
        <Control item={item} id={id} disabled={disabled} />
      </div>
    </div>
  );
}
