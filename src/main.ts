import {MarkdownView, Plugin, TFile, WorkspaceLeaf} from "obsidian";

import outlineIcon from "./icons/outline/list-tree.solid.svg";
import draftIcon from "./icons/draft/pen-line.solid.svg";
import finalIcon from "./icons/final/scroll.solid.svg";
import previousIcon from "./icons/previous/backward-step.solid.svg";
import nextIcon from "./icons/next/forward-step.solid.svg";
import chapterIcon from "./icons/chapter-info/section.solid.svg";
import bookIcon from "./icons/book-info/book-section.solid.svg";
import ellipsisIcon from "./icons/ellipsis/ellipsis.solid.svg";

import {BookToolbar} from "./toolbars/BookToolbar";
import {ChapterToolbar} from "./toolbars/ChapterToolbar";

import {
    BookEntry,
    ChapterEntry,
    ChapterNavigationTargets,
    ChapterStage,
    NavigationTarget,
    NovelIndex,
    PendingBook,
    StageEntry,
    ToolbarMode,
} from "./types";

export default class NovelNavigatorPlugin extends Plugin {

    // ─────────────────────────────────────────────
    // Book / Chapter Index
    // ─────────────────────────────────────────────

    private novelIndex: NovelIndex | null = null;

    private handlers = new Map<WorkspaceLeaf, BookToolbar | ChapterToolbar>();
    private toolbars = new Map<WorkspaceLeaf, HTMLElement>();

    // scanning + caching logic


    // ─────────────────────────────────────────────
    // Plugin lifecycle
    // ─────────────────────────────────────────────

    async onload() {
        console.log("Novel Navigator loaded");

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
        const pendingBooks: PendingBook[] = [];
        const cache = this.app.metadataCache;
        const files = this.app.vault.getMarkdownFiles();

        // 1. Discover book info files
        for (const file of files) {
            const fm = cache.getFileCache(file)?.frontmatter;
            if (!fm?.book_title || !Array.isArray(fm.chapters)) {
                continue;
            }

            const chapterFiles = fm.chapters.map((link: string) => this.resolveWikiLink(link, file)).filter((f): f is TFile => !!f);
            const prologueFile = this.resolveWikiLink(fm.prologue, file);
            const epilogueFile = this.resolveWikiLink(fm.epilogue, file);

            pendingBooks.push({
                bookFile: file,
                title: fm.book_title,
                prologueFile: prologueFile,
                epilogueFile: epilogueFile,
                chapterFiles: chapterFiles
            });
        }

        // 2. Build chapter entries
        const books = new Map<string, BookEntry>();
        const chapters = new Map<string, ChapterEntry>();
        const stages = new Map<string, StageEntry>();

        for (const pending of pendingBooks) {
            const book: BookEntry = {
                file: pending.bookFile,
                title: pending.title,
                prologue: undefined,
                epilogue: undefined,
                chapters: [],
            };

            books.set(book.file.path, book);

            // Combine prologue, chapter files, epilogue
            const allChapterFiles = [pending.prologueFile, ...pending.chapterFiles, pending.epilogueFile].filter(Boolean) as TFile[];

            allChapterFiles.forEach((chapterFile, index) => {
                const fm = cache.getFileCache(chapterFile)?.frontmatter ?? {};

                const chapter: ChapterEntry = {
                    book,
                    file: chapterFile,
                    index,
                    kind: chapterFile === pending.prologueFile ? "prologue" : chapterFile === pending.epilogueFile ? "epilogue" : "chapter",
                    chapterNumber: null,
                    chapterLabel: "",
                    datetime: fm.chapter_datetime,
                    location: fm.chapter_location,
                    info: chapterFile,
                    outline: this.resolveWikiLink(fm.chapter_outline, chapterFile),
                    draft: this.resolveWikiLink(fm.chapter_draft, chapterFile),
                    final: this.resolveWikiLink(fm.chapter_final, chapterFile),
                };

                book.chapters.push(chapter);

                if (chapter.kind === "prologue") {
                    book.prologue = chapter;
                }
                if (chapter.kind === "epilogue") {
                    book.epilogue = chapter;
                }

                chapters.set(chapterFile.path, chapter);
            });

            // Assign chapter numbers and labels
            let chapterCounter = 0;

            for (const chapter of book.chapters) {
                switch (chapter.kind) {
                    case "prologue":
                        chapter.chapterNumber = null;
                        chapter.chapterLabel = "Prologue";
                        break;

                    case "chapter":
                        chapterCounter++;
                        chapter.chapterNumber = chapterCounter;
                        chapter.chapterLabel = `Chapter ${chapterCounter}`;
                        break;

                    case "epilogue":
                        chapter.chapterNumber = null;
                        chapter.chapterLabel = "Epilogue";
                        break;
                }
            }
        }

        // 3. Build stage entries
        for (const chapter of chapters.values()) {
            ([
                ["outline", chapter.outline],
                ["draft", chapter.draft],
                ["final", chapter.final],
            ] as const).forEach(([stage, file]) => {
                if (!file) return;

                stages.set(file.path, {
                    file,
                    chapter,
                    stage,
                });
            });
        }

        // 4. Assign and log
        this.novelIndex = {books, chapters, stages};

        console.log("Novel index rebuilt", {
            books: books.size,
            chapters: chapters.size,
            stages: stages.size,
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

    private getAdjacentChapterTarget(
        chapter: ChapterEntry,
        stage: ChapterStage,
        direction: "previous" | "next"
    ): NavigationTarget {
        const chapters = chapter.book.chapters;
        const delta = direction === "next" ? 1 : -1;
        const targetIndex = chapter.index + delta;

        if (targetIndex < 0 || targetIndex >= chapters.length) {
            return {kind: "disabled"};
        }

        const targetChapter = chapters[targetIndex];
        const file = targetChapter[stage];

        // If the target chapter doesn’t have that stage, disable
        return file
            ? {kind: "file", file}
            : {kind: "disabled"};
    }

    private getBookInfoTarget(bookEntry: BookEntry): NavigationTarget {
        const file = bookEntry.file;
        return file
            ? {kind: "file", file}
            : {kind: "disabled"};
    }

    private getNavigationTargets(stage: StageEntry): ChapterNavigationTargets {
        const {chapter} = stage;

        return {
            // Stage navigation
            outline: this.getStageTarget(chapter, "outline"),
            draft: this.getStageTarget(chapter, "draft"),
            final: this.getStageTarget(chapter, "final"),

            // Chapter navigation
            previous: this.getAdjacentChapterTarget(chapter, stage.stage, "previous"),
            next: this.getAdjacentChapterTarget(chapter, stage.stage, "next"),

            // Info navigation
            bookInfo: this.getBookInfoTarget(chapter.book),
            chapterInfo: this.getStageTarget(chapter, "info"),
        };
    }

    private getStageTarget(
        chapter: ChapterEntry,
        stage: ChapterStage
    ): NavigationTarget {
        const file = chapter[stage];
        return file ? {kind: "file", file} : {kind: "disabled"};
    }

    private resolveWikiLink(
        link: string | undefined,
        sourceFile: TFile
    ): TFile | undefined {
        if (!link) return undefined;

        const dest = this.app.metadataCache.getFirstLinkpathDest(
            link.replace(/^\[\[|]]$/g, ""),
            sourceFile.path
        );

        return dest ?? undefined;
    }

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
                handler.update(stageEntry, this.getNavigationTargets(stageEntry), file);
                return;
            }
        }
    }
}
