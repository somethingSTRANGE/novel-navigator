import {MarkdownView, Plugin, WorkspaceLeaf} from "obsidian";

export default class NovelNavigatorPlugin extends Plugin {
    private toolbars = new Map<WorkspaceLeaf, HTMLElement>();

    async onload() {
        console.log("Novel Navigator loaded");

        // Initial scan of existing leaves
        this.app.workspace.iterateAllLeaves((leaf) => {
            this.ensureToolbar(leaf);
        });

        // Active leaf changes
        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
            if (leaf) {
                this.ensureToolbar(leaf);
            }
        }));

        // View history / DOM replacement
        this.registerEvent(this.app.workspace.on("layout-change", () => {
            this.app.workspace.iterateAllLeaves((leaf) => {
                this.ensureToolbar(leaf);
            })
        }));
    }

    onunload() {
        console.log("Novel Navigator unloaded");

        // Remove all injected toolbars
        this.toolbars.forEach((toolbar) => {
            toolbar.remove();
        });

        this.toolbars = new Map();
    }

    private ensureToolbar(leaf: WorkspaceLeaf) {
        if (!(leaf.view instanceof MarkdownView)) {
            return;
        }

        const container = leaf.view.containerEl;

        // If DOM was replaced, our toolbar is gone
        const existing = this.toolbars.get(leaf);
        if (existing && container.contains(existing)) {
            return; // still valid
        }

        // Otherwise (first time or DOM replaced), inject
        this.injectToolbar(leaf);
    }

    private injectToolbar(leaf: WorkspaceLeaf) {
        const view = leaf.view;
        const leafContent = view.containerEl;
        const viewHeader = leafContent.querySelector(".view-header");
        const viewContent = leafContent.querySelector(".view-content");

        if (!viewHeader || !viewContent) {
            return;
        }

        // Create toolbar
        const toolbar = document.createElement("div");
        toolbar.className = "novel-navigator-toolbar";
        toolbar.textContent = "Novel Navigator Toolbar (stub)";


        // Inject between header and content
        leafContent.insertBefore(toolbar, viewContent);

        // Track it
        this.toolbars.set(leaf, toolbar);
    }

}

