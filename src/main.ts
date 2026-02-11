import {MarkdownView, Plugin, TFile, WorkspaceLeaf} from "obsidian";

import outlineIcon from "./icons/outline/list-tree.solid.svg";
import draftIcon from "./icons/draft/pen-line.solid.svg";
import finalIcon from "./icons/final/scroll.solid.svg";
import previousIcon from "./icons/previous/backward-step.solid.svg";
import nextIcon from "./icons/next/forward-step.solid.svg";
import chapterIcon from "./icons/chapter-info/section.solid.svg";
import bookIcon from "./icons/book-info/book-section.solid.svg";
import ellipsisIcon from "./icons/ellipsis/ellipsis.solid.svg";

import {NovelIndexer} from "./indexer";

import {NovelIndex, StageEntry, ToolbarMode,} from "./types";

import {BookToolbar} from "./toolbars/BookToolbar";
import {ChapterToolbar} from "./toolbars/ChapterToolbar";

export default class NovelNavigatorPlugin extends Plugin {

    // ─────────────────────────────────────────────
    // Book / Chapter Index
    // ─────────────────────────────────────────────

    private novelIndex: NovelIndex | null = null;
    private indexer!: NovelIndexer;

    private handlers = new Map<WorkspaceLeaf, BookToolbar | ChapterToolbar>();
    private toolbars = new Map<WorkspaceLeaf, HTMLElement>();

    // scanning + caching logic


    // ─────────────────────────────────────────────
    // Plugin lifecycle
    // ─────────────────────────────────────────────

    async onload() {
        console.log("Novel Navigator loaded");

        this.indexer = new NovelIndexer(this.app);
        await this.rebuildNovelIndex();

        this.registerEvent(
            this.app.metadataCache.on("resolved", () => {
                this.rebuildNovelIndex();
                this.app.workspace.iterateAllLeaves((leaf) => {
                    this.updateToolbarForLeaf(leaf);
                });
            })
        );

        // ----

        // Initial scan of existing leaves
        this.app.workspace.iterateAllLeaves((leaf) => {
            this.ensureToolbar(leaf);
            this.updateToolbarForLeaf(leaf);
        });

        // Active leaf changes
        this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
            if (leaf) {
                this.ensureToolbar(leaf);
                this.updateToolbarForLeaf(leaf);
            }
        }));

        // View history / DOM replacement
        this.registerEvent(this.app.workspace.on("layout-change", () => {
            this.app.workspace.iterateAllLeaves((leaf) => {
                this.ensureToolbar(leaf);
                this.updateToolbarForLeaf(leaf);
            })
        }));

    }

    onunload() {
        console.log("Novel Navigator unloaded");

        // 1. Destroy all handlers (disconnects observers)
        this.handlers.forEach(handler => handler.destroy());
        this.handlers.clear();

        // 2. Remove the actual DOM elements
        this.toolbars.forEach(toolbar => toolbar.remove());
        this.toolbars.clear();
    }

    // ─────────────────────────────────────────────
    // Index Construction
    // ─────────────────────────────────────────────

    private async rebuildNovelIndex() {
        this.novelIndex = await this.indexer.buildIndex();

        console.log("Novel index rebuilt", {
            books: this.novelIndex.books.size,
            chapters: this.novelIndex.chapters.size,
            stages: this.novelIndex.stages.size,
        });
    }

    // ─────────────────────────────────────────────
    // Context Resolution
    // ─────────────────────────────────────────────
    private resolveToolbarModeForFile(file: TFile): ToolbarMode {
        if (!this.novelIndex) {
            return {kind: "none"};
        }

        const {books, chapters, stages} = this.novelIndex;

        // 1. Chapter stage files (the highest specificity)
        const stage = stages.get(file.path);
        if (stage) {
            return {
                kind: "chapter-stage",
                stage,
            };
        }

        // 2. Chapter info files
        const chapter = chapters.get(file.path);
        if (chapter) {
            // wrap chapter info as a StageEntry
            const stageEntry: StageEntry = {
                chapter,
                stage: "info",
                file: chapter.info!, // we just added this
            };
            return {
                kind: "chapter-stage",
                stage: stageEntry,
            };
        }

        // 3. Book info files
        const book = books.get(file.path);
        if (book) {
            return {
                kind: "book-info",
                book,
            };
        }

        // 4. Everything else
        return {kind: "none"};
    }


    // ─────────────────────────────────────────────
    // Toolbar Injection
    // ─────────────────────────────────────────────

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
        toolbar.className = "nn-toolbar";
        toolbar.textContent = "Novel Navigator Toolbar (stub)";


        // Inject between header and content
        leafContent.insertBefore(toolbar, viewContent);

        // Track it
        this.toolbars.set(leaf, toolbar);
    }

    // ─────────────────────────────────────────────
    // UI Helpers
    // ─────────────────────────────────────────────


    private updateToolbarForLeaf(leaf: WorkspaceLeaf) {
        const view = leaf.view;
        const file = view instanceof MarkdownView ? view.file : null;
        if (!file) return;

        const leafContent = view.containerEl;
        const toolbar = leafContent.querySelector<HTMLDivElement>(
            ".nn-toolbar"
        );
        if (!toolbar) return;

        toolbar.innerHTML = "";
        toolbar.className = "nn-toolbar";

        const mode = this.resolveToolbarModeForFile(file);

        let handler = this.handlers.get(leaf);

        switch (mode.kind) {
            case "none": {
                toolbar.textContent = "Not a Novel Navigator file";
                return;
            }

            case "book-info": {
                toolbar.setAttribute("data-nn-type", "book-info");
                toolbar.setAttribute("data-nn-mode", "truncate-middle");

                if (handler && !(handler instanceof BookToolbar)) {
                    handler.destroy();
                    handler = undefined;
                }

                if (!handler) {
                    handler = new BookToolbar(this.app, toolbar, {ellipsis: ellipsisIcon});
                    this.handlers.set(leaf, handler);
                }

                handler.update(mode.book);
                return;
            }

            case "chapter-stage": {
                toolbar.setAttribute("data-nn-type", "chapter-stage");
                toolbar.removeAttribute("data-nn-mode");

                if (handler && !(handler instanceof ChapterToolbar)) {
                    handler.destroy();
                    handler = undefined;
                }

                if (!handler) {
                    handler = new ChapterToolbar(this.app, toolbar, {
                        book: bookIcon,
                        chapter: chapterIcon,
                        draft: draftIcon,
                        final: finalIcon,
                        next: nextIcon,
                        outline: outlineIcon,
                        previous: previousIcon
                    });

                    this.handlers.set(leaf, handler);
                }

                const stageEntry = mode.stage;
                handler.update(stageEntry, this.indexer.getNavigationTargets(stageEntry), file);
                return;
            }
        }
    }
}
