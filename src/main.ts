import {MarkdownView, Menu, Plugin, TFile, WorkspaceLeaf} from "obsidian";

import outlineIcon from "./icons/outline/list-tree.solid.svg";
import draftIcon from "./icons/draft/pen-line.solid.svg";
import finalIcon from "./icons/final/scroll.solid.svg";
import previousIcon from "./icons/previous/backward-step.solid.svg";
import nextIcon from "./icons/next/forward-step.solid.svg";
import chapterIcon from "./icons/chapter-info/section.solid.svg";
import bookIcon from "./icons/book-info/book-section.solid.svg";
import ellipsisIcon from "./icons/ellipsis/ellipsis.solid.svg";

import { ChapterToolbar } from "./toolbars/ChapterToolbar";

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

type BookToolbarMode = "truncate-end" | "truncate-middle" | "dynamic-scrubber";

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

    private buildBookToolbar(toolbar: HTMLElement, book: BookEntry, mode: BookToolbarMode = "truncate-middle") {
        switch (mode) {
            case "truncate-end":
                this.buildBookToolbarTruncateEnd(toolbar, book);
                break;
            case "truncate-middle":
                this.buildBookToolbarTruncateMiddle(toolbar, book);
                break;
            case "dynamic-scrubber":
                this.buildBookToolbarScrubber(toolbar, book);
                break;
        }
    }

    private createChapterButton = (chapter: ChapterEntry, label: string) => {
        const btn = document.createElement("button");
        btn.classList.add("clickable-icon");
        btn.setAttribute("aria-label", chapter.chapterLabel);
        btn.textContent = label;
        btn.addEventListener("click", () => {
            if (chapter.file) this.app.workspace.openLinkText(chapter.file.path, "/", false);
        });
        return btn;
    };

    private buildBookToolbarTruncateMiddle(toolbar: HTMLElement, book: BookEntry) {
        toolbar.innerHTML = "";

        const controls = toolbar.createDiv({cls: "nn-controls"});
        const buttons: HTMLButtonElement[] = [];

        // 1. Create all buttons in their natural order
        let chapterCounter = 0;
        book.chapters.forEach((ch, idx) => {
            const label = ch.kind === "chapter" ? String(++chapterCounter) : ch.chapterLabel;
            const btn = this.createChapterButton(ch, label);
            controls.appendChild(btn);
            buttons.push(btn);
        });

        // Create the overflow button and append it to the END
        const ellipsisSvg = this.svgFromString(ellipsisIcon);
        const overflowBtn = this.createOverflowButton(ellipsisSvg, "Hidden Chapters Menu");
        overflowBtn.classList.add("nn-overflow-btn");
        controls.appendChild(overflowBtn);

        // Measure once (The "Secret Sauce")
        // We get the widths while everything is visible
        // const btnWidths = buttons.map(btn => btn.offsetWidth);
        // const ovrWidth = 34; // overflowBtn.offsetWidth;
        // const totalNaturalWidth = btnWidths.reduce((a, b) => a + b, 0);
        let btnWidths : number[] = [];
        let totalNaturalWidth = 0;
        let ovrWidth = 0;
        
        // Track state to prevent layout thrashing
        let lastRange = { start: -1, end: -1 };

        // 2. The Logic Wrapper
        const runLayout = (containerWidth: number) => {
            // Initial Measurement (Only runs once when data is empty)
            if (btnWidths.length === 0) {
                btnWidths = buttons.map((b) => {
                    const w = b.getBoundingClientRect().width;
                    b.setAttribute("data-width", Math.round(w).toString());
                    return w;
                });

                totalNaturalWidth = btnWidths.reduce((a, b) => a + b, 0);
                ovrWidth = overflowBtn.getBoundingClientRect().width || 34;
            }

            let hStart = -1;
            let hEnd = -1;

            // We use a 2px "safety buffer" to prevent flickering at edge cases
            if (totalNaturalWidth > containerWidth - 2) {
                let currentWidth = totalNaturalWidth + ovrWidth;
                hStart = Math.floor(buttons.length / 2);
                hEnd = hStart;
                
                // Expand range outward
                while (currentWidth > containerWidth && (hStart >= 0 || hEnd < buttons.length)) {
                    currentWidth -= btnWidths[hStart] || 0;
                    if (hStart !== hEnd) {
                        currentWidth -= btnWidths[hEnd] || 0;
                    }
                    
                    if (currentWidth <= containerWidth) break;

                    // Move outward
                    if (hStart > 0) hStart--;
                    if (hEnd < buttons.length - 1) hEnd++;
                }
            }
            
            if (hStart !== lastRange.start || hEnd !== lastRange.end) {
                lastRange = { start: hStart, end: hEnd };
                
                buttons.forEach((btn, idx) => {
                    const hide = idx >= hStart && idx <= hEnd;
                    btn.classList.toggle("is-hidden", hide);
                });
                
                if (hStart !== -1) {
                    overflowBtn.style.display = "flex";
                    // Insert BEFORE the first hidden item to keep the visual center
                    controls.insertBefore(overflowBtn, buttons[hStart]);
                } else {
                    overflowBtn.style.display = "none";
                }
            }
        };
        
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width <= 0) return;
            runLayout(rect.width);
        });
        
        // Ensure DOM is ready before observing
        // this.app.workspace.onLayoutReady(() => observer.observe(controls));
        window.requestAnimationFrame(() => observer.observe(controls));
        
        
        // // 2. The Bilateral Squeeze Logic (ResizeObserver)
        // const observer = new ResizeObserver((entries) => {
        //     const containerWidth = entries[0].contentRect.width;
        //     if (containerWidth <= 0) return;
        //
        //     let hStart = -1;
        //     let hEnd = -1;
        //    
        //     if (totalNaturalWidth > containerWidth) {
        //         // Math Phase: Calculate indices to hide using cached widths
        //         let currentWidth = totalNaturalWidth + ovrWidth;
        //         hStart = Math.floor(buttons.length / 2);
        //         hEnd = hStart;
        //
        //         // Expand range outward until the remaining width fits
        //         while (currentWidth > containerWidth && hStart >= 0 && hEnd < buttons.length) {
        //             currentWidth -= btnWidths[hStart];
        //             if (hStart !== hEnd) currentWidth -= btnWidths[hEnd];
        //
        //             if (currentWidth <= containerWidth) break;
        //             hStart--;
        //             hEnd++;
        //         }
        //     }
        //    
        //     // DOM Phase: Only run if the calculation resulted in a new state
        //     if (hStart !== lastRange.start || hEnd !== lastRange.end) {
        //         lastRange = { start: hStart, end: hEnd };
        //        
        //         buttons.forEach((btn, idx) => {
        //             const hide = idx >= hStart && idx <= hEnd;
        //             btn.classList.toggle("is-hidden", hide);
        //         });
        //        
        //         if (hStart !== -1) {
        //             overflowBtn.style.display = "flex";
        //            
        //             // We physically move it to keep tab order and visual centering consistent
        //             controls.insertBefore(overflowBtn, buttons[hStart]);
        //         } else {
        //             overflowBtn.style.display = "none";
        //         }
        //     }
        // });
        //
        // observer.observe(controls);

        // 3. Simple Menu Logic
        overflowBtn.addEventListener("click", (e) => {
            const menu = new Menu();
            const hidden = buttons.filter(btn => btn.classList.contains("is-hidden"));

            hidden.forEach(btn => {
                menu.addItem(item => {
                    item.setTitle(btn.getAttribute("aria-label") || btn.textContent || "")
                        .onClick(() => btn.click());
                });
            });
            menu.showAtMouseEvent(e);
        });
    }

    private buildBookToolbarTruncateMiddle_old(toolbar: HTMLElement, book: BookEntry) {
        toolbar.innerHTML = "";

        const controls = document.createElement("div");
        controls.className = "nn-book-controls";

        const createChapterButton = (chapter: ChapterEntry, label: string) => {
            const btn = document.createElement("button");
            btn.classList.add("clickable-icon");
            btn.setAttribute("aria-label", chapter.chapterLabel);
            btn.textContent = label;
            btn.addEventListener("click", () => {
                if (chapter.file) this.app.workspace.openLinkText(chapter.file.path, "/", false);
            });
            return btn;
        };

        // 1. Create all buttons
        let chapterCounter = 0;
        const buttons = book.chapters.map(chapter => {
            let label = chapter.kind === "chapter" ? String(++chapterCounter) :
                chapter.kind.charAt(0).toUpperCase() + chapter.kind.slice(1);
            return createChapterButton(chapter, label);
        });

        // 2. Assign "V-shaped" flex order
        // Goal: Ends are 0, middle is highest.
        //
        // If total = 7 (indices 0-6):
        // Index 0 & 6 -> order 0
        // Index 1 & 5 -> order 1
        // Index 2 & 4 -> order 2
        // Index 3 (middle) -> order 3
        const total = buttons.length;
        const middleIndex = Math.floor(total / 2);
        buttons.forEach((btn, i) => {
            // Distance from the nearest edge (0 for ends, middleIndex for the center)
            const distanceFromEdge = Math.min(i, (total - 1) - i);
            // Reverse it so the center has the highest order
            btn.style.order = String(middleIndex - distanceFromEdge);
        });

        // 3. Create the Overflow (...) button
        const overflowBtn = document.createElement("button");
        overflowBtn.classList.add("clickable-icon", "nn-overflow-btn");
        overflowBtn.textContent = "...";
        overflowBtn.style.order = "998"; // Stays at the end of the row

        // 4. Track hidden items using IntersectionObserver
        const hiddenItems: HTMLButtonElement[] = [];
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const target = entry.target as HTMLButtonElement;
                // If it's not intersecting the root container, it's wrapped, so add to hidden items
                if (!entry.isIntersecting) {
                    // Add to the hidden list if not already there
                    if (!hiddenItems.includes(target)) {
                        hiddenItems.push(target);
                    }
                } else {
                    // Remove from hidden the list if it becomes visible again
                    const index = hiddenItems.indexOf(target);
                    if (index > -1) {
                        hiddenItems.splice(index, 1);
                    }
                }
            });

            // this.updateOverflowMenu(controls, overflowBtn);

            // Toggle the "..." button visibility based on overflow
            overflowBtn.style.display = hiddenItems.length > 0 ? "flex" : "none";
        }, {
            root: controls,
            threshold: 0.99 // Fully visible or not
        });

        // 5. Mount and Observe
        buttons.forEach(btn => {
            controls.appendChild(btn);
            observer.observe(btn);
        });
        controls.appendChild(overflowBtn);
        toolbar.appendChild(controls);

        // 6. Menu Logic
        overflowBtn.addEventListener("click", (e: MouseEvent) => {
            const menu = new Menu();

            // Sort hidden items by their original index for the menu
            const sortedHidden = [...hiddenItems].sort((a, b) => {
                return buttons.indexOf(a) - buttons.indexOf(b);
            });

            sortedHidden.forEach(btn => {
                menu.addItem(item => {
                    item.setTitle(btn.getAttribute("aria-label") || btn.textContent || "Chapter")
                        .onClick(() => btn.click());
                });
            });

            menu.showAtMouseEvent(e);
        });
    }

    private buildBookToolbarScrubber(toolbar: HTMLElement, book: BookEntry) {
    }

    private buildBookToolbarTruncateEnd(toolbar: HTMLElement, book: BookEntry) {
        toolbar.innerHTML = "";

        const controls = document.createElement("div");
        controls.className = "nn-book-controls";

        const createChapterButton = (chapter: ChapterEntry, label: string) => {
            const btn = document.createElement("button");
            btn.classList.add("clickable-icon");
            btn.setAttribute("aria-disabled", "false");
            btn.setAttribute("aria-label", chapter.chapterLabel);
            btn.textContent = label;

            // // Optional: tooltip with Act info
            // if (chapter.act) {
            //     btn.title = `Act ${chapter.act} · ${label}`;
            // }

            btn.addEventListener("click", () => {
                if (chapter.file) {
                    // Open in current leaf
                    this.app.workspace.openLinkText(chapter.file.path, "/", false);
                }
            });

            return btn;
        };

        let chapterCounter = 0;
        const buttons: HTMLElement[] = [];

        book.chapters.forEach(chapter => {
            let label: string;

            switch (chapter.kind) {
                case "prologue":
                    label = "Prologue";
                    break;
                case "epilogue":
                    label = "Epilogue";
                    break;
                case "chapter":
                    chapterCounter++;
                    label = String(chapterCounter);
                    break;
                default:
                    // Fallback: just show the kind
                    label = chapter.kind;
            }

            buttons.push(createChapterButton(chapter, label));
        });

        buttons.forEach(btn => controls.appendChild(btn));
        toolbar.appendChild(controls);
    }

    private buildChapterToolbar(
        toolbar: HTMLElement,
        chapter: ChapterEntry,
        stage: StageEntry | null,
        nav: ChapterNavigationTargets,
        file: TFile | null,
        infoButton: HTMLButtonElement
    ) {
        const outlineSvg = this.svgFromString(outlineIcon);
        const draftSvg = this.svgFromString(draftIcon);
        const finalSvg = this.svgFromString(finalIcon);
        const prevSvg = this.svgFromString(previousIcon);
        const nextSvg = this.svgFromString(nextIcon);

        const controls = document.createElement("div");
        controls.className = "nn-controls";

        controls.append(infoButton);


        // ---------- stage controls (optional) ----------
        if (stage) {
            const stageControls = document.createElement("div");
            stageControls.className = "nn-controls__stage";

            const navItems = [
                {svg: outlineSvg, label: "Open Outline", target: nav.outline, stage: "outline" as const},
                {svg: draftSvg, label: "Open Draft", target: nav.draft, stage: "draft" as const},
                {svg: finalSvg, label: "Open Final", target: nav.final, stage: "final" as const},
            ];

            navItems.forEach(({svg, label, target, stage}) => {
                stageControls.append(
                    this.createIconNavButton(svg, label, target, file, stage)
                );
            });

            controls.append(stageControls);
        }

        // ---------- chapter navigation ----------
        const chapterControls = document.createElement("div");
        chapterControls.className = "nn-controls__chapter";

        chapterControls.append(
            this.createIconNavButton(prevSvg, "Previous Chapter", nav.previous, file),
            this.createIconNavButton(nextSvg, "Next Chapter", nav.next, file),
        );

        controls.append(chapterControls);

        // ---------- metadata ----------
        const hasValue = (v: unknown): v is string =>
            typeof v === "string" && v.trim().length > 0;

        function makeSpan(className: string, content: string | Node): HTMLElement {
            const el = document.createElement("span");
            el.className = className;

            if (typeof content === "string") {
                el.textContent = content;
            } else {
                el.appendChild(content);
            }

            return el;
        }

        const metaNodes: HTMLElement[] = [];
        // metaNodes.push(makeSpan("nn-meta__segment nn-meta__segment--book", chapter.book.title));

        const inner = document.createElement("span");
        inner.textContent = chapter.chapterLabel;
        metaNodes.push(makeSpan("nn-meta__segment nn-meta__segment--chapter", inner));

        if (hasValue(chapter.datetime)) {
            metaNodes.push(makeSpan("nn-meta__segment nn-meta__segment--datetime", chapter.datetime));
        }

        if (hasValue(chapter.location)) {
            metaNodes.push(makeSpan("nn-meta__segment nn-meta__segment--location", chapter.location));
        }

        const meta = document.createElement("div");
        meta.className = "nn-meta";
        meta.replaceChildren(...metaNodes);

        toolbar.append(controls, meta);
    }

    private createOverflowButton(
        iconSvg: SVGElement,
        ariaLabel: string
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-label", ariaLabel);
        btn.appendChild(iconSvg);
        return btn;
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

    private createTextNavButton(
        text: string,
        ariaLabel: string,
        target: NavigationTarget
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-label", ariaLabel);

        if (target.kind === "disabled") {
            btn.setAttribute("aria-disabled", "true");
            btn.disabled = true;
        } else {
            btn.onclick = () => {
                this.app.workspace.openLinkText(target.file.path, "", false);
            };
        }

        btn.textContent = text;

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
            ? {kind: "file", file}
            : {kind: "disabled"};
    }

    private getChapterInfoTarget(chapter: ChapterEntry): NavigationTarget {
        const file = chapter.file;
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
                toolbar.setAttribute("data-nn-type", "book-info");
                toolbar.setAttribute("data-nn-mode", "truncate-middle");

                const book = mode.book;
                this.buildBookToolbar(toolbar, book);
                return;
            }

            case "chapter-stage": {
                // toolbar.setAttribute("data-nn-type", "chapter-stage");
                // toolbar.removeAttribute("data-nn-mode");
                //
                // const stage = mode.stage;
                // const chapter = stage.chapter;
                // const nav = this.getNavigationTargets(stage);
                //
                // this.buildChapterToolbar(
                //     toolbar,
                //     chapter,
                //     stage,
                //     nav,
                //     file,
                //     stage.stage === "info"
                //         ? this.createIconNavButton(bookSvg, "Open Book Info", nav.bookInfo, file)
                //         : this.createIconNavButton(chapterSvg, "Open Chapter Info", nav.chapterInfo, file)
                // );
                // return;

                toolbar.setAttribute("data-nn-type", "chapter-stage");
                toolbar.removeAttribute("data-nn-mode");

                const handler = new ChapterToolbar(this.app, toolbar, {
                    outline: outlineIcon,
                    draft: draftIcon,
                    final: finalIcon,
                    previous: previousIcon,
                    next: nextIcon
                });
                
                const stage = mode.stage;
                const chapter = stage.chapter;
                const nav = this.getNavigationTargets(stage);
                
                const infoButton = stage.stage === "info"
                    ? this.createIconNavButton(bookSvg, "Open Book Info", nav.bookInfo, file)
                    : this.createIconNavButton(chapterSvg, "Open Chapter Info", nav.chapterInfo, file)

                // const infoButton = stage.stage === "info"
                //     ? this.createIconNavButton(this.svgFromString(bookIcon), "Open Book Info", () => {
                //         this.app.workspace.openLinkText(nav.bookInfo.file.path, "", false);
                //     }, nav.bookInfo.kind === "disabled")
                //     : this.createIconNavButton(this.svgFromString(chapterIcon), "Open Chapter Info", () => {
                //         this.app.workspace.openLinkText(nav.chapterInfo.file.path, "", false);
                //     }, nav.chapterInfo.kind === "disabled");
                
                handler.render(stage.chapter, stage, nav, file, infoButton);
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


