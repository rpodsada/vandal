import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { events, type Settings } from "../shared/ipc";
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
  // Opened at a page (`settings.html#about`, e.g. from an update notification).
  const [activeId, setActiveId] = useState(() => pageFromHash() ?? sections[0].id);
  const [query, setQuery] = useState("");
  const loaded = settings !== null;
  const mainRef = useRef<HTMLElement>(null);
  /** The group scrolled to, for the sidebar's highlight. */
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);
  /** A group picked in the sidebar, scrolled to once its section is showing. */
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  /** The group just picked stays highlighted until its scroll ends. */
  const pickedRef = useRef<string | null>(null);

  // Which group the page is at: the last one whose heading has reached the
  // top, or the last one when scrolled to the bottom.
  const trackGroup = useCallback(() => {
    const main = mainRef.current;
    if (!main || pickedRef.current) return;
    const groups = [...main.querySelectorAll<HTMLElement>("section[id]")];
    const top = main.getBoundingClientRect().top + GROUP_REACHED;
    const atBottom = main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
    const reached = groups.filter((g) => g.getBoundingClientRect().top <= top);
    const current =
      atBottom && main.scrollTop > 0 ? groups[groups.length - 1] : reached[reached.length - 1];
    setCurrentGroup(current?.id ?? groups[0]?.id ?? null);
  }, []);

  // A new section starts at its top.
  useLayoutEffect(() => {
    pickedRef.current = null;
    if (mainRef.current) mainRef.current.scrollTop = 0;
    trackGroup();
    // `loaded`: the page (and its groups) first appears then.
  }, [activeId, loaded, trackGroup]);

  // A group picked in the sidebar scrolls into view.
  useLayoutEffect(() => {
    const main = mainRef.current;
    const target = pendingGroup && document.getElementById(pendingGroup);
    if (!main || !target) return;
    pickedRef.current = pendingGroup;
    setCurrentGroup(pendingGroup);
    main.addEventListener("scrollend", () => (pickedRef.current = null), { once: true });
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingGroup(null);
  }, [pendingGroup]);

  useEffect(() => {
    void useSettingsStore.getState().init();
  }, []);

  // Already open and asked for a page (PLAN 3P.4).
  useEffect(() => {
    const unlisten = events.settingsShowPage.listen(({ payload }) => {
      if (!sections.some((s) => s.id === payload)) return;
      setQuery("");
      setActiveId(payload);
    });
    return () => void unlisten.then((f) => f());
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
          {sections.map((section) => {
            const open = !q && section.id === active.id;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  className={styles.navItem}
                  aria-current={open ? "page" : undefined}
                  onClick={() => {
                    setActiveId(section.id);
                    setQuery("");
                    if (open) mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <section.icon />
                  {section.title}
                </button>
                {/* The open section's groups, as links to scroll to (PLAN 3D.9). */}
                {open && (
                  <ul className={styles.subList}>
                    {shownGroups(section, settings).map((group) => {
                      const id = groupId(section, group);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className={styles.subItem}
                            aria-current={id === currentGroup ? "location" : undefined}
                            onClick={() => setPendingGroup(id)}
                          >
                            {group.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <main ref={mainRef} className={styles.main} onScroll={trackGroup}>
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
        <GroupCard
          key={group.title ?? i}
          id={group.title ? groupId(section, group) : undefined}
          group={group}
          settings={settings}
        />
      ))}
    </>
  );
}

/** Px below the top of the page at which a group's heading counts as reached. */
const GROUP_REACHED = 40;

/** A group's element id, for the sidebar's links. */
function groupId(section: Section, group: Group): string {
  const slug = (group.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `group-${section.id}-${slug}`;
}

/** The groups the sidebar lists: titled, with something showing. */
function shownGroups(section: Section, settings: Settings): Group[] {
  return section.groups.filter(
    (g) => g.title && g.items.some((item) => item.visible?.(settings) ?? true),
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

function GroupCard({
  id,
  group,
  settings,
}: {
  /** For the sidebar's links to this group. */
  id?: string;
  group: Group;
  settings: Settings;
}) {
  const items = group.items.filter((item) => item.visible?.(settings) ?? true);
  if (items.length === 0) return null;
  return (
    <section id={id} className={styles.group}>
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
  // A control that is its own content (the About card): no label column.
  if (def.layout === "bare")
    return (
      <div className={styles.rowStacked}>
        <Control item={item} id={id} disabled={disabled} />
      </div>
    );
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

function pageFromHash(): string | undefined {
  const id = window.location.hash.slice(1);
  return sections.some((s) => s.id === id) ? id : undefined;
}
