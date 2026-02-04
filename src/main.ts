import {MarkdownView, Plugin, TFile, WorkspaceLeaf} from "obsidian";

import outlineIcon from "./icons/outline/list-tree.solid.svg";
import draftIcon from "./icons/draft/pen-line.solid.svg";
import finalIcon from "./icons/final/scroll.solid.svg";
import previousIcon from "./icons/previous/chevron-left.solid.svg";
import nextIcon from "./icons/next/chevron-right.solid.svg";
import chapterIcon from "./icons/chapter-info/section.solid.svg";
import bookIcon from "./icons/book-info/book-section.solid.svg";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface BookEntry {
    file: TFile;
    title: string;

    prologue?: ChapterEntry;
    epilogue?: ChapterEntry;
    chapters: ChapterEntry[];
}

interface PendingBook {
    bookFile: TFile;
    title: string;

    prologueFile?: TFile;
    epilogueFile?: TFile;
    chapterFiles: TFile[];
}


interface ChapterContext {
    bookFile: TFile;
    chapterFile: TFile;
    stageFile: TFile;

    bookTitle: string;
    chapterIndex: number; // 0-based index within book.chapters
    chapterKind: "prologue" | "chapter" | "epilogue";
    chapterLabel: string;
    chapterNumber: number | null;

    stage: ChapterStage;
}

interface ChapterEntry {
    book: BookEntry;
    file: TFile;
    index: number;
    kind: "prologue" | "chapter" | "epilogue";

    chapterNumber: number | null;
    chapterLabel: string;

    datetime?: string;
    location?: string;

    info?: TFile;
    outline?: TFile;
    draft?: TFile;
    final?: TFile;
}

interface StageEntry {
    file: TFile;
    chapter: ChapterEntry;
    stage: ChapterStage;
}

interface ChapterNavigationTargets {
    // Stage navigation
    outline: NavigationTarget;
    draft: NavigationTarget;
    final: NavigationTarget;

    // Chapter navigation
    previous: NavigationTarget;
    next: NavigationTarget;

    // Info navigation
    bookInfo: NavigationTarget;
    chapterInfo: NavigationTarget;
}

interface NovelIndex {
    books: Map<string, BookEntry>;
    chapters: Map<string, ChapterEntry>;
    stages: Map<string, StageEntry>;
}

type ChapterStage = "info" | "outline" | "draft" | "final";

type NavigationTarget =
    | { kind: "file"; file: TFile }
    | { kind: "disabled" };

type ToolbarMode =
    | { kind: "none" }
    | { kind: "book-info"; book: BookEntry }
    | { kind: "chapter-info"; chapter: ChapterEntry }
    | { kind: "chapter-stage"; stage: StageEntry };

export default class NovelNavigatorPlugin extends Plugin {

    // ─────────────────────────────────────────────
    // Book / Chapter Index
    // ─────────────────────────────────────────────

    private novelIndex: NovelIndex | null = null;

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

            // temp debugging
            const file = this.app.workspace.getActiveFile();
            if (file) {
                const context = this.getChapterContextForFile(file);
                console.log("ChapterContext:", context);
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

        // Remove all injected toolbars
        this.toolbars.forEach((toolbar) => {
            toolbar.remove();
        });

        this.toolbars = new Map();
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

    private getChapterContextForFile(file: TFile): ChapterContext | null {
        const stageEntry = this.findChapterStageForFile(file);
        if (!stageEntry) {
            return null;
        }

        const {chapter, stage} = stageEntry;

        return {
            bookFile: chapter.book.file,
            chapterFile: chapter.file,
            stageFile: stageEntry.file,

            bookTitle: chapter.book.title,
            chapterIndex: chapter.index,
            chapterKind: chapter.kind,
            chapterLabel: chapter.chapterLabel,
            chapterNumber: chapter.chapterNumber,
            stage,
        }
    }

    private findChapterStageForFile(file: TFile): StageEntry | null {
        if (!this.novelIndex) return null;

        return this.novelIndex.stages.get(file.path) ?? null;
    }

    private resolveToolbarModeForFile(file: TFile): ToolbarMode {
        if (!this.novelIndex) {
            return {kind: "none"};
        }

        const {books, chapters, stages} = this.novelIndex;

        // 1. Chapter stage files (highest specificity)
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

    private buildChapterToolbar(
        toolbar: HTMLElement,
        chapter: ChapterEntry,
        stage: StageEntry | null,
        nav: ChapterNavigationTargets,
        file: TFile | null,
        rightInfoButton: HTMLButtonElement
    ) {
        const outlineSvg = this.svgFromString(outlineIcon);
        const draftSvg = this.svgFromString(draftIcon);
        const finalSvg = this.svgFromString(finalIcon);
        const prevSvg = this.svgFromString(previousIcon);
        const nextSvg = this.svgFromString(nextIcon);
        
        const controls = document.createElement("div");
        controls.className = "nn-controls";

        // ---------- stage controls (optional) ----------
        if (stage) {
            const stageControls = document.createElement("div");
            stageControls.className = "nn-stage-controls";

            const navItems = [
                { svg: outlineSvg, label: "Open Outline", target: nav.outline, stage: "outline" as const },
                { svg: draftSvg,   label: "Open Draft",   target: nav.draft,   stage: "draft"   as const },
                { svg: finalSvg,   label: "Open Final",   target: nav.final,   stage: "final"   as const },
            ];

            navItems.forEach(({ svg, label, target, stage }) => {
                stageControls.append(
                    this.createIconNavButton(svg, label, target, file, stage)
                );
            });

            controls.append(stageControls);
        }

        // ---------- chapter navigation ----------
        const chapterControls = document.createElement("div");
        chapterControls.className = "nn-chapter-controls";

        chapterControls.append(
            this.createIconNavButton(prevSvg, "Previous Chapter", nav.previous, file),
            this.createIconNavButton(nextSvg, "Next Chapter", nav.next, file),
        );

        controls.append(chapterControls);

        // ---------- metadata ----------
        const info = document.createElement("div");
        info.className = "nn-meta-container";
        info.innerHTML = `
    <span class="nn-segment nn-book">${chapter.book.title}</span>
    <span class="nn-segment nn-chapter-label"><span>${chapter.chapterLabel}</span></span>
    <span class="nn-segment nn-datetime">${chapter.datetime}</span>
    <span class="nn-segment nn-location">${chapter.location}</span>
  `;

        // ---------- right controls ----------
        const rightControls = document.createElement("div");
        rightControls.className = "nn-controls";

        const infoControls = document.createElement("div");
        infoControls.className = "nn-chapter-controls";
        infoControls.append(rightInfoButton);

        rightControls.append(infoControls);

        toolbar.append(controls, info, rightControls);
    }
    
    private createIconNavButton(
        iconSvg: SVGElement,
        ariaLabel: string,
        target: NavigationTarget,
        activeFile: TFile | null,
        dataStage?: ChapterStage
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-label", ariaLabel);

        if (dataStage) {
            btn.dataset.stage = dataStage;
        }

        const isActive = target.kind === "file" && activeFile === target.file;

        if (isActive) {
            btn.setAttribute("aria-disabled", "true");
            btn.dataset.active = "";
            btn.onclick = null;
        } else if (target.kind === "disabled") {
            btn.setAttribute("aria-disabled", "true");
            btn.disabled = true;
        } else {
            btn.onclick = () => {
                this.app.workspace.openLinkText(target.file.path, "", false);
            };
        }

        btn.appendChild(iconSvg);

        return btn;
    }

    private createNavButton(
        label: string,
        target: NavigationTarget
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.textContent = label;

        if (target.kind === "disabled") {
            btn.disabled = true;
        } else {
            btn.onclick = () => {
                this.app.workspace.openLinkText(
                    target.file.path,
                    "",
                    false
                );
            };
        }

        return btn;
    }

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
            ? { kind: "file", file }
            : { kind: "disabled" };
    }

    private getChapterInfoTarget(chapter: ChapterEntry): NavigationTarget {
        const file = chapter.file;
        return file
            ? { kind: "file", file }
            : { kind: "disabled" };
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
            link.replace(/^\[\[|\]\]$/g, ""),
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

        const bookSvg = this.svgFromString(bookIcon);
        const chapterSvg = this.svgFromString(chapterIcon);

        switch (mode.kind) {
            case "none": {
                toolbar.textContent = "Not a Novel Navigator file";
                return;
            }

            case "book-info": {
                toolbar.classList.add("is-book-info");

                const info = document.createElement("div");
                info.innerHTML = `
                <strong>${mode.book.title}</strong><br>
                Chapters: ${mode.book.chapters.length}<br>
                Mode: ${mode.kind}
            `;
                toolbar.appendChild(info);
                return;
            }

            case "chapter-stage": {
                toolbar.classList.add("is-chapter-stage");
                toolbar.dataset.nnType = "chapter-stage";
                toolbar.dataset.nnStage = mode.stage.stage;

                const stage = mode.stage;
                const chapter = stage.chapter;
                const nav = this.getNavigationTargets(stage);

                this.buildChapterToolbar(
                    toolbar,
                    chapter,
                    stage,
                    nav,
                    file,
                    stage.stage === "info"
                        ? this.createIconNavButton(bookSvg, "Open Book Info", nav.bookInfo, file)
                        : this.createIconNavButton(chapterSvg, "Open Chapter Info", nav.chapterInfo, file)
                );
                return;
            }
        }
    }

    private svgFromString(svgText: string): SVGElement {
        const template = document.createElement("template");
        template.innerHTML = svgText.trim();
        return template.content.firstElementChild as SVGElement;
    }

}


