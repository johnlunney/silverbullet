// Third party web dependencies
import {
  CompletionContext,
  CompletionResult,
  EditorView,
  gitIgnoreCompiler,
  SyntaxNode,
  syntaxTree,
} from "../common/deps.ts";
import { fileMetaToPageMeta, Space } from "./space.ts";
import { FilterOption } from "./types.ts";
import { parseYamlSettings } from "../common/util.ts";
import { EventHook } from "../plugos/hooks/event.ts";
import { AppCommand } from "./hooks/command.ts";
import { PathPageNavigator } from "./navigator.ts";

import { AppViewState, BuiltinSettings } from "./types.ts";

import type { AppEvent, CompleteEvent } from "../plug-api/app_event.ts";
import { throttle } from "$sb/lib/async.ts";
import { PlugSpacePrimitives } from "../common/spaces/plug_space_primitives.ts";
import { EventedSpacePrimitives } from "../common/spaces/evented_space_primitives.ts";
import {
  ISyncService,
  NoSyncSyncService,
  pageSyncInterval,
  SyncService,
} from "./sync_service.ts";
import { simpleHash } from "../common/crypto.ts";
import { SyncStatus } from "../common/spaces/sync.ts";
import { HttpSpacePrimitives } from "../common/spaces/http_space_primitives.ts";
import { FallbackSpacePrimitives } from "../common/spaces/fallback_space_primitives.ts";
import { FilteredSpacePrimitives } from "../common/spaces/filtered_space_primitives.ts";
import { validatePageName } from "$sb/lib/page.ts";
import { ClientSystem } from "./client_system.ts";
import { createEditorState } from "./editor_state.ts";
import { OpenPages } from "./open_pages.ts";
import { MainUI } from "./editor_ui.tsx";
import { cleanPageRef } from "$sb/lib/resolve.ts";
import { expandPropertyNames } from "$sb/lib/json.ts";
import { SpacePrimitives } from "../common/spaces/space_primitives.ts";
import { FileMeta, PageMeta } from "$sb/types.ts";
import { DataStore } from "../plugos/lib/datastore.ts";
import { IndexedDBKvPrimitives } from "../plugos/lib/indexeddb_kv_primitives.ts";
import { DataStoreMQ } from "../plugos/lib/mq.datastore.ts";
import { DataStoreSpacePrimitives } from "../common/spaces/datastore_space_primitives.ts";
const frontMatterRegex = /^---\n(([^\n]|\n)*?)---\n/;

const autoSaveInterval = 1000;

declare global {
  interface Window {
    // Injected via index.html
    silverBulletConfig: {
      spaceFolderPath: string;
      syncOnly: boolean;
    };
    client: Client;
  }
}

// TODO: Oh my god, need to refactor this
export class Client {
  system!: ClientSystem;
  editorView!: EditorView;
  private pageNavigator!: PathPageNavigator;

  private dbPrefix: string;

  plugSpaceRemotePrimitives!: PlugSpacePrimitives;
  // localSpacePrimitives!: FilteredSpacePrimitives;
  remoteSpacePrimitives!: HttpSpacePrimitives;
  space!: Space;

  saveTimeout?: number;
  debouncedUpdateEvent = throttle(() => {
    this.eventHook
      .dispatchEvent("editor:updated")
      .catch((e) => console.error("Error dispatching editor:updated event", e));
  }, 1000);

  debouncedPlugsUpdatedEvent = throttle(async () => {
    // To register new commands, update editor state based on new plugs
    this.rebuildEditorState();
    await this.dispatchAppEvent(
      "editor:pageLoaded",
      this.currentPage,
      undefined,
      true,
    );
  }, 1000);

  // Track if plugs have been updated since sync cycle
  fullSyncCompleted = false;

  syncService!: ISyncService;
  settings!: BuiltinSettings;

  // Event bus used to communicate between components
  eventHook!: EventHook;

  ui!: MainUI;
  openPages!: OpenPages;
  stateDataStore!: DataStore;
  spaceDataStore!: DataStore;
  mq!: DataStoreMQ;

  constructor(
    private parent: Element,
    public syncMode = false,
  ) {
    if (!syncMode) {
      this.fullSyncCompleted = true;
    }
    // Generate a semi-unique prefix for the database so not to reuse databases for different space paths
    this.dbPrefix = "" + simpleHash(window.silverBulletConfig.spaceFolderPath);
  }

  /**
   * Initialize the client
   * This is a separated from the constructor to allow for async initialization
   */
  async init() {
    const stateKvPrimitives = new IndexedDBKvPrimitives(
      `${this.dbPrefix}_state`,
    );
    await stateKvPrimitives.init();
    this.stateDataStore = new DataStore(stateKvPrimitives);

    // Setup message queue
    this.mq = new DataStoreMQ(this.stateDataStore);

    setInterval(() => {
      // Timeout after 5s, retries 3 times, otherwise drops the message (no DLQ)
      this.mq.requeueTimeouts(5000, 3, true).catch(console.error);
    }, 20000); // Look to requeue every 20s

    // Event hook
    this.eventHook = new EventHook();

    // Instantiate a PlugOS system
    this.system = new ClientSystem(
      this,
      this.mq,
      this.stateDataStore,
      this.eventHook,
    );

    const localSpacePrimitives = await this.initSpace();

    this.syncService = this.syncMode
      ? new SyncService(
        localSpacePrimitives,
        this.plugSpaceRemotePrimitives,
        this.stateDataStore,
        this.eventHook,
        (path) => {
          // TODO: At some point we should remove the data.db exception here
          return path !== "data.db" &&
              // Exclude all plug space primitives paths
              !this.plugSpaceRemotePrimitives.isLikelyHandled(path) ||
            // Except federated ones
            path.startsWith("!");
        },
      )
      : new NoSyncSyncService(this.space);

    this.ui = new MainUI(this);
    this.ui.render(this.parent);

    this.editorView = new EditorView({
      state: createEditorState(this, "", "", false),
      parent: document.getElementById("sb-editor")!,
    });

    this.openPages = new OpenPages(this);

    this.focus();

    // This constructor will always be followed by an (async) invocatition of init()
    await this.system.init();

    // Load settings
    this.settings = await this.loadSettings();

    // Pinging a remote space to ensure we're authenticated properly, if not will result in a redirect to auth page
    try {
      await this.remoteSpacePrimitives.ping();
    } catch (e: any) {
      if (e.message === "Not authenticated") {
        console.warn("Not authenticated, redirecting to auth page");
        return;
      }
      console.warn(
        "Could not reach remote server, we're offline or the server is down",
        e,
      );
    }

    await this.loadPlugs();
    this.initNavigator();
    this.initSync();

    this.loadCustomStyles().catch(console.error);

    await this.dispatchAppEvent("editor:init");

    setInterval(() => {
      try {
        this.syncService.syncFile(`${this.currentPage!}.md`).catch((e: any) => {
          console.error("Interval sync error", e);
        });
      } catch (e: any) {
        console.error("Interval sync error", e);
      }
    }, pageSyncInterval);
  }

  private initSync() {
    this.syncService.start();

    this.eventHook.addLocalListener("sync:success", async (operations) => {
      // console.log("Operations", operations);
      if (operations > 0) {
        // Update the page list
        await this.space.updatePageList();
      }
      if (operations !== undefined) {
        // "sync:success" is called with a number of operations only from syncSpace(), not from syncing individual pages
        this.fullSyncCompleted = true;
      }
      // if (this.system.plugsUpdated) {
      if (operations) {
        // Likely initial sync so let's show visually that we're synced now
        this.showProgress(100);
      }
      // }

      this.ui.viewDispatch({ type: "sync-change", syncSuccess: true });
    });
    this.eventHook.addLocalListener("sync:error", (_name) => {
      this.ui.viewDispatch({ type: "sync-change", syncSuccess: false });
    });
    this.eventHook.addLocalListener("sync:conflict", (name) => {
      this.flashNotification(
        `Sync: conflict detected for ${name} - conflict copy created`,
        "error",
      );
    });
    this.eventHook.addLocalListener("sync:progress", (status: SyncStatus) => {
      this.showProgress(
        Math.round(status.filesProcessed / status.totalFiles * 100),
      );
    });
    this.eventHook.addLocalListener(
      "file:synced",
      (meta: FileMeta, direction: string) => {
        if (meta.name.endsWith(".md") && direction === "secondary->primary") {
          // We likely polled the currently open page which trigggered a local update, let's update the editor accordingly
          this.space.getPageMeta(meta.name.slice(0, -3));
        }
      },
    );
  }

  private initNavigator() {
    this.pageNavigator = new PathPageNavigator(
      cleanPageRef(this.settings.indexPage),
    );

    this.pageNavigator.subscribe(async (pageName, pos: number | string) => {
      console.log("Now navigating to", pageName);

      const stateRestored = await this.loadPage(pageName);
      if (pos) {
        if (typeof pos === "string") {
          console.log("Navigating to anchor", pos);

          // We're going to look up the anchor through a API invocation
          const matchingAnchor = await this.system.system.localSyscall(
            "index",
            "system.invokeFunction",
            ["getObjectByRef", pageName, "anchor", `${pageName}@${pos}`],
          );

          if (!matchingAnchor) {
            return this.flashNotification(
              `Could not find anchor $${pos}`,
              "error",
            );
          } else {
            pos = matchingAnchor.pos as number;
          }
        }
        setTimeout(() => {
          this.editorView.dispatch({
            selection: { anchor: pos as number },
            effects: EditorView.scrollIntoView(pos as number, { y: "start" }),
          });
        });
      } else if (!stateRestored) {
        // Somewhat ad-hoc way to determine if the document contains frontmatter and if so, putting the cursor _after it_.
        const pageText = this.editorView.state.sliceDoc();

        // Default the cursor to be at position 0
        let initialCursorPos = 0;
        const match = frontMatterRegex.exec(pageText);
        if (match) {
          // Frontmatter found, put cursor after it
          initialCursorPos = match[0].length;
        }
        // By default scroll to the top
        this.editorView.scrollDOM.scrollTop = 0;
        this.editorView.dispatch({
          selection: { anchor: initialCursorPos },
          // And then scroll down if required
          scrollIntoView: true,
        });
      }
      await this.stateDataStore.set(["client", "lastOpenedPage"], pageName);
    });

    if (location.hash === "#boot") {
      (async () => {
        // Cold start PWA load
        const lastPage = await this.stateDataStore.get([
          "client",
          "lastOpenedPage",
        ]);
        if (lastPage) {
          await this.navigate(lastPage);
        }
      })().catch(console.error);
    }
  }

  async initSpace(): Promise<SpacePrimitives> {
    this.remoteSpacePrimitives = new HttpSpacePrimitives(
      location.origin,
      window.silverBulletConfig.spaceFolderPath,
    );

    this.plugSpaceRemotePrimitives = new PlugSpacePrimitives(
      this.remoteSpacePrimitives,
      this.system.namespaceHook,
    );

    let fileFilterFn: (s: string) => boolean = () => true;

    let localSpacePrimitives: SpacePrimitives | undefined;

    if (this.syncMode) {
      // We'll store the space files in a separate data store
      const spaceKvPrimitives = new IndexedDBKvPrimitives(
        `${this.dbPrefix}_synced_space`,
      );
      await spaceKvPrimitives.init();

      localSpacePrimitives = new FilteredSpacePrimitives(
        new EventedSpacePrimitives(
          // Using fallback space primitives here to allow (by default) local reads to "fall through" to HTTP when files aren't synced yet
          new FallbackSpacePrimitives(
            new DataStoreSpacePrimitives(new DataStore(spaceKvPrimitives)),
            this.plugSpaceRemotePrimitives,
          ),
          this.eventHook,
        ),
        (meta) => fileFilterFn(meta.name),
        // Run when a list of files has been retrieved
        async () => {
          await this.loadSettings();
          if (typeof this.settings?.spaceIgnore === "string") {
            fileFilterFn = gitIgnoreCompiler(this.settings.spaceIgnore).accepts;
          } else {
            fileFilterFn = () => true;
          }
        },
      );
    } else {
      localSpacePrimitives = new EventedSpacePrimitives(
        this.plugSpaceRemotePrimitives,
        this.eventHook,
      );
    }

    this.space = new Space(
      localSpacePrimitives,
      this.stateDataStore,
      this.eventHook,
    );

    this.eventHook.addLocalListener("file:changed", (path: string) => {
      // Only reload when watching the current page (to avoid reloading when switching pages)
      if (
        this.space.watchInterval && `${this.currentPage}.md` === path
      ) {
        console.log("Page changed elsewhere, reloading");
        this.flashNotification("Page changed elsewhere, reloading");
        this.reloadPage();
      }
    });

    this.eventHook.addLocalListener("file:listed", (fileList: FileMeta[]) => {
      this.ui.viewDispatch({
        type: "pages-listed",
        pages: fileList.filter(this.space.isListedPage).map(
          fileMetaToPageMeta,
        ),
      });
    });

    this.space.watch();

    return localSpacePrimitives;
  }

  async loadSettings(): Promise<BuiltinSettings> {
    let settingsText: string | undefined;

    try {
      settingsText = (await this.space.readPage("SETTINGS")).text;
    } catch (e) {
      console.info("No SETTINGS page, falling back to default", e);
      settingsText = '```yaml\nindexPage: "[[index]]"\n```\n';
    }
    let settings = parseYamlSettings(settingsText!) as BuiltinSettings;

    settings = expandPropertyNames(settings);

    // console.log("Settings", settings);

    if (!settings.indexPage) {
      settings.indexPage = "[[index]]";
    }
    return settings;
  }

  get currentPage(): string | undefined {
    return this.ui.viewState.currentPage;
  }

  dispatchAppEvent(name: AppEvent, ...args: any[]): Promise<any[]> {
    return this.eventHook.dispatchEvent(name, ...args);
  }

  save(immediate = false): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(
        () => {
          if (this.currentPage) {
            if (
              !this.ui.viewState.unsavedChanges ||
              this.ui.viewState.uiOptions.forcedROMode
            ) {
              // No unsaved changes, or read-only mode, not gonna save
              return resolve();
            }
            console.log("Saving page", this.currentPage);
            this.space
              .writePage(
                this.currentPage,
                this.editorView.state.sliceDoc(0),
                true,
              )
              .then(async (meta) => {
                this.ui.viewDispatch({ type: "page-saved" });
                await this.dispatchAppEvent(
                  "editor:pageSaved",
                  this.currentPage,
                  meta,
                );
                resolve();
              })
              .catch((e) => {
                this.flashNotification(
                  "Could not save page, retrying again in 10 seconds",
                  "error",
                );
                this.saveTimeout = setTimeout(this.save.bind(this), 10000);
                reject(e);
              });
          } else {
            resolve();
          }
        },
        immediate ? 0 : autoSaveInterval,
      );
    });
  }

  flashNotification(message: string, type: "info" | "error" = "info") {
    const id = Math.floor(Math.random() * 1000000);
    this.ui.viewDispatch({
      type: "show-notification",
      notification: {
        id,
        type,
        message,
        date: new Date(),
      },
    });
    setTimeout(
      () => {
        this.ui.viewDispatch({
          type: "dismiss-notification",
          id: id,
        });
      },
      type === "info" ? 4000 : 5000,
    );
  }

  private progressTimeout?: number;
  showProgress(progressPerc: number) {
    this.ui.viewDispatch({
      type: "set-progress",
      progressPerc,
    });
    if (this.progressTimeout) {
      clearTimeout(this.progressTimeout);
    }
    this.progressTimeout = setTimeout(
      () => {
        this.ui.viewDispatch({
          type: "set-progress",
        });
      },
      10000,
    );
  }

  filterBox(
    label: string,
    options: FilterOption[],
    helpText = "",
    placeHolder = "",
  ): Promise<FilterOption | undefined> {
    return new Promise((resolve) => {
      this.ui.viewDispatch({
        type: "show-filterbox",
        label,
        options,
        placeHolder,
        helpText,
        onSelect: (option: any) => {
          this.ui.viewDispatch({ type: "hide-filterbox" });
          this.focus();
          resolve(option);
        },
      });
    });
  }

  prompt(
    message: string,
    defaultValue = "",
  ): Promise<string | undefined> {
    return new Promise((resolve) => {
      this.ui.viewDispatch({
        type: "show-prompt",
        message,
        defaultValue,
        callback: (value: string | undefined) => {
          this.ui.viewDispatch({ type: "hide-prompt" });
          this.focus();
          resolve(value);
        },
      });
    });
  }

  confirm(
    message: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.ui.viewDispatch({
        type: "show-confirm",
        message,
        callback: (value: boolean) => {
          this.ui.viewDispatch({ type: "hide-confirm" });
          this.focus();
          resolve(value);
        },
      });
    });
  }

  async loadPlugs() {
    await this.system.reloadPlugsFromSpace(this.space);
    this.rebuildEditorState();
    await this.eventHook.dispatchEvent("system:ready");
    await this.dispatchAppEvent("plugs:loaded");
  }

  rebuildEditorState() {
    const editorView = this.editorView;
    console.log("Rebuilding editor state");

    this.system.updateMarkdownParser();

    if (this.currentPage) {
      // And update the editor if a page is loaded
      this.openPages.saveState(this.currentPage);

      editorView.setState(
        createEditorState(
          this,
          this.currentPage,
          editorView.state.sliceDoc(),
          this.ui.viewState.currentPageMeta?.perm === "ro",
        ),
      );
      if (editorView.contentDOM) {
        this.tweakEditorDOM(
          editorView.contentDOM,
        );
      }

      this.openPages.restoreState(this.currentPage);
    }
  }

  // Code completion support
  private async completeWithEvent(
    context: CompletionContext,
    eventName: AppEvent,
  ): Promise<CompletionResult | null> {
    const editorState = context.state;
    const selection = editorState.selection.main;
    const line = editorState.doc.lineAt(selection.from);
    const linePrefix = line.text.slice(0, selection.from - line.from);

    const parentNodes: string[] = [];
    const sTree = syntaxTree(editorState);
    const currentNode = sTree.resolveInner(selection.from);
    if (currentNode) {
      let node: SyntaxNode | null = currentNode;
      do {
        if (node.name === "FencedCode") {
          const body = editorState.sliceDoc(node.from + 3, node.to - 3);
          parentNodes.push(`FencedCode:${body}`);
        } else {
          parentNodes.push(node.name);
        }
        node = node.parent;
      } while (node);
    }

    const results = await this.dispatchAppEvent(eventName, {
      pageName: this.currentPage!,
      linePrefix,
      pos: selection.from,
      parentNodes,
    } as CompleteEvent);
    let actualResult = null;
    for (const result of results) {
      if (result) {
        if (actualResult) {
          console.error(
            "Got completion results from multiple sources, cannot deal with that",
          );
          console.error("Previously had", actualResult, "now also got", result);
          return null;
        }
        actualResult = result;
      }
    }
    return actualResult;
  }

  editorComplete(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    return this.completeWithEvent(context, "editor:complete");
  }

  miniEditorComplete(
    context: CompletionContext,
  ): Promise<CompletionResult | null> {
    return this.completeWithEvent(context, "minieditor:complete");
  }

  async reloadPage() {
    console.log("Reloading page");
    clearTimeout(this.saveTimeout);
    await this.loadPage(this.currentPage!);
  }

  focus() {
    const viewState = this.ui.viewState;
    if (
      [
        viewState.showCommandPalette,
        viewState.showPageNavigator,
        viewState.showFilterBox,
        viewState.showConfirm,
        viewState.showPrompt,
      ].some(Boolean)
    ) {
      // Some other modal UI element is visible, don't focus editor now
      return;
    }
    this.editorView.focus();
  }

  async navigate(
    name: string,
    pos?: number | string,
    replaceState = false,
    newWindow = false,
  ) {
    if (!name) {
      name = cleanPageRef(this.settings.indexPage);
    }

    try {
      validatePageName(name);
    } catch (e: any) {
      return this.flashNotification(e.message, "error");
    }

    if (newWindow) {
      const win = window.open(`${location.origin}/${name}`, "_blank");
      if (win) {
        win.focus();
      }
      return;
    }
    await this.pageNavigator!.navigate(name, pos, replaceState);
  }

  async loadPage(pageName: string): Promise<boolean> {
    const loadingDifferentPage = pageName !== this.currentPage;
    const editorView = this.editorView;
    const previousPage = this.currentPage;

    // Persist current page state and nicely close page
    if (previousPage) {
      this.openPages.saveState(previousPage);
      this.space.unwatchPage(previousPage);
      if (previousPage !== pageName) {
        await this.save(true);
      }
    }

    this.ui.viewDispatch({
      type: "page-loading",
      name: pageName,
    });

    // Fetch next page to open
    let doc;
    try {
      doc = await this.space.readPage(pageName);
    } catch (e: any) {
      if (e.message.includes("Not found")) {
        // Not found, new page
        console.log("Page doesn't exist, creating new page:", pageName);
        doc = {
          text: "",
          meta: { name: pageName, lastModified: 0, perm: "rw" } as PageMeta,
        };
      } else {
        this.flashNotification(
          `Could not load page ${pageName}: ${e.message}`,
          "error",
        );
        if (previousPage) {
          this.ui.viewDispatch({
            type: "page-loading",
            name: previousPage,
          });
        }

        return false;
      }
    }

    const editorState = createEditorState(
      this,
      pageName,
      doc.text,
      doc.meta.perm === "ro",
    );
    editorView.setState(editorState);
    if (editorView.contentDOM) {
      this.tweakEditorDOM(editorView.contentDOM);
    }
    const stateRestored = this.openPages.restoreState(pageName);
    this.space.watchPage(pageName);

    this.ui.viewDispatch({
      type: "page-loaded",
      meta: doc.meta,
    });

    // Note: these events are dispatched asynchronously deliberately (not waiting for results)
    if (loadingDifferentPage) {
      this.eventHook.dispatchEvent("editor:pageLoaded", pageName, previousPage)
        .catch(
          console.error,
        );
    } else {
      this.eventHook.dispatchEvent("editor:pageReloaded", pageName).catch(
        console.error,
      );
    }

    return stateRestored;
  }

  tweakEditorDOM(contentDOM: HTMLElement) {
    contentDOM.spellcheck = true;
    contentDOM.setAttribute("autocorrect", "on");
    contentDOM.setAttribute("autocapitalize", "on");
  }

  async loadCustomStyles() {
    if (this.settings.customStyles) {
      const accumulatedCSS: string[] = [];
      let customStylePages = this.settings.customStyles;
      if (!Array.isArray(customStylePages)) {
        customStylePages = [customStylePages];
      }
      for (const customStylesPage of customStylePages) {
        try {
          const { text: stylesText } = await this.space.readPage(
            cleanPageRef(customStylesPage),
          );
          const cssBlockRegex = /```css([^`]+)```/;
          const match = cssBlockRegex.exec(stylesText);
          if (!match) {
            return;
          }
          accumulatedCSS.push(match[1]);
        } catch (e: any) {
          console.error("Failed to load custom styles", e);
        }
      }
      document.getElementById("custom-styles")!.innerHTML = accumulatedCSS.join(
        "\n\n",
      );
    }
  }

  async runCommandByName(name: string) {
    const cmd = this.ui.viewState.commands.get(name);
    if (cmd) {
      await cmd.run();
    } else {
      throw new Error(`Command ${name} not found`);
    }
  }

  getCommandsByContext(
    state: AppViewState,
  ): Map<string, AppCommand> {
    const commands = new Map(state.commands);
    for (const [k, v] of state.commands.entries()) {
      if (
        v.command.contexts &&
        (!state.showCommandPaletteContext ||
          !v.command.contexts.includes(state.showCommandPaletteContext))
      ) {
        commands.delete(k);
      }
    }

    return commands;
  }

  getContext(): string | undefined {
    const state = this.editorView.state;
    const selection = state.selection.main;
    if (selection.empty) {
      return syntaxTree(state).resolveInner(selection.from).type.name;
    }
    return;
  }
}
