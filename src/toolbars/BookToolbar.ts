// src/toolbars/BookToolbar.ts
import {App, Menu} from "obsidian";
import {BaseToolbar} from "./BaseToolbar";
import {BookEntry, ChapterEntry} from "../types";

export interface BookToolbarIcons {
    ellipsis: string;
}

export class BookToolbar extends BaseToolbar {
    private static labelCache = new Map<string, number>();

    private overflowBtn!: HTMLButtonElement;
    private controls!: HTMLElement;
    private observer!: ResizeObserver;

    private buttonElements: {
        element: HTMLElement,
        width: number,
        index: number
    }[] = [];

    private currentBook: BookEntry | null = null;
    private lastSignature: string = "";

    constructor(
        app: App,
        private container: HTMLElement,
        private icons: BookToolbarIcons
    ) {
        super(app);

        this.observer = new ResizeObserver((entries) => {
            if (entries[0].contentRect.width <= 0) {
                return;
            }

            if (this.currentBook) {
                this.refresh(this.currentBook);
            }
        });

        this.observer.observe(this.container);
    }

    public destroy() {
        this.observer.disconnect();
    }

    public refresh(book: BookEntry) {
        // logger.info(`Refreshing Book Toolbar for book: "${book.title}"`);

        this.currentBook = book;

        if (!this.isCssReady(this.container)) {
            window.requestAnimationFrame(() => this.refresh(book));
            // logger.warn("Book Toolbar CSS not ready yet. Waiting...");
            return;
        }

        const usableWidth = this.getUsableWidth(this.container);
        if (usableWidth <= 0) {
            window.requestAnimationFrame(() => this.refresh(book));
            // logger.warn("Book Toolbar usable width <= 0. Waiting...");
            return;
        }

        const signature = this.getBookSignature(book);
        if (signature !== this.lastSignature) {
            this.lastSignature = signature;
            this.build(book);
        }

        this.applyLayout(usableWidth);
    }

    private build(book: BookEntry) {
        // logger.info(`Building Book Toolbar for book: "${book.title}"`);

        this.container.className = "nn-toolbar";
        this.container.innerHTML = ""; // kills old controls and their listeners
        this.container.dataset.nnType = "book-info";

        const labels = this.getRequiredLabels(book);
        this.measureMissingLabels(labels);

        // logger.info("Current Label Cache: ", Object.fromEntries(BookToolbar.labelCache));

        this.buttonElements = [];

        // Find the pixel-based center to place the overflow button
        const totalWidth = labels.reduce((acc, l) => acc + this.getCachedWidth(l), 0);
        const targetMid = totalWidth / 2;
        let currentWidth = 0;
        let splitIndex = labels.length;

        for (let i = 0; i < labels.length; i++) {
            currentWidth += this.getCachedWidth(labels[i]);
            if (currentWidth >= targetMid) {
                splitIndex = i;
                break;
            }
        }

        this.controls = this.container.createDiv({cls: "nn-controls"});
        this.controls.innerHTML = "";
        this.controls.addEventListener("click", this.handleControlsClick.bind(this));

        // Create the buttons in order
        labels.forEach((label, i) => {
            // If we've reached the split point, insert the Overflow button first
            if (i === splitIndex) {
                this.overflowBtn = this.createOverflowButton();
                this.controls.appendChild(this.overflowBtn);
                this.setupMenu(this.overflowBtn);
            }

            const btn = this.createChapterButton(book.chapters[i], label);
            this.buttonElements.push({
                element: btn,
                width: this.getCachedWidth(label),
                index: i
            });
            this.controls.appendChild(btn);
        });

        // If the split happened at the very end, add it now
        if (splitIndex === labels.length) {
            this.overflowBtn = this.createOverflowButton();
            this.controls.appendChild(this.overflowBtn);
        }
    }

    private applyLayout(usableWidth: number) {
        // logger.info("Applying Book Toolbar Layout...");

        const labels = this.buttonElements.map(button => button.element.textContent || "");
        const squeeze = this.calculateSqueeze(labels, usableWidth);

        this.buttonElements.forEach((btn, i) => {
            const isHidden = squeeze.showOverflow
                && squeeze.hideStart !== null
                && squeeze.hideEnd !== null
                && i >= squeeze.hideStart
                && i <= squeeze.hideEnd;
            btn.element.classList.toggle("is-hidden", isHidden);
        });

        if (this.overflowBtn) {
            this.overflowBtn.classList.toggle("is-hidden", !squeeze.showOverflow);
        }
    }

    private calculateSqueeze(labels: string[], containerWidth: number): {
        hideStart: number | null,
        hideEnd: number | null,
        showOverflow: boolean
    } {
        const buffer = 10; // 10px safety buffer
        const ovrWidth = this.getCachedWidth("__overflow__");

        let leftIndices = labels.map((_, i) => i);
        let rightIndices: number[] = [];

        const totalNatural = labels.reduce((acc, l) => acc + this.getCachedWidth(l), 0);

        // Full fit check
        if (totalNatural + buffer <= containerWidth) {
            return {hideStart: null, hideEnd: null, showOverflow: false};
        }

        // Initial split
        let currentRightWidth = 0;
        while (currentRightWidth < totalNatural / 2 && leftIndices.length > 1) {
            const idx = leftIndices.pop()!;
            rightIndices.unshift(idx);
            currentRightWidth += this.getCachedWidth(labels[idx]);
        }

        // Squeeze loop
        const getWidth = (indices: number[]) => indices.reduce((acc, i) => acc + this.getCachedWidth(labels[i]), 0);
        while (getWidth(leftIndices) + getWidth(rightIndices) + ovrWidth + buffer > containerWidth) {
            if (leftIndices.length === 0 && rightIndices.length === 0) {
                break;
            }

            let pullFromLeft = false;
            if (leftIndices.length > 0 && rightIndices.length === 0) {
                pullFromLeft = true;
            } else if (leftIndices.length === 0 && rightIndices.length > 0) {
                pullFromLeft = false;
            } else {
                pullFromLeft = getWidth(leftIndices) >= getWidth(rightIndices);
            }

            if (pullFromLeft) {
                leftIndices.pop();
            } else {
                rightIndices.shift();
            }
        }

        // Determine the hidden range
        // The hidden range is everything between the last left and the first right
        const hideStart = leftIndices.length > 0 ? leftIndices[leftIndices.length - 1] + 1 : 0;
        const hideEnd = rightIndices.length > 0 ? rightIndices[0] - 1 : labels.length - 1;

        return {
            hideStart: hideStart <= hideEnd ? hideStart : null,
            hideEnd: hideStart <= hideEnd ? hideEnd : null,
            showOverflow: true
        };
    }

    private createChapterButton(chapter: ChapterEntry, label: string): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.classList.add("clickable-icon", "nn-button-chapter");
        btn.setAttribute("aria-label", chapter.chapterLabel);
        btn.textContent = label;
        btn.setAttribute("data-path", chapter.file.path);
        return btn;
    }

    private createOverflowButton(): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.classList.add("clickable-icon", "nn-button-overflow");
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-label", "Hidden Chapters Menu");
        btn.appendChild(this.svgFromString(this.icons.ellipsis));
        return btn;
    }

    private getBookSignature(book: BookEntry): string {
        return [
            book.file.path,
            book.chapters.length,
            ...book.chapters.map(c => c.file.path)
        ].join('|');
    }

    private getCachedWidth(label: string): number {
        const width = BookToolbar.labelCache.get(label);
        if (width === undefined) {
            // This should never happen if ensureLabelsMeasured works
            throw new Error(`[Novel Navigator] Label "${label}" requested but not found in cache.`);
        }
        return width;
    }

    private getRequiredLabels(book: BookEntry): string[] {
        const labels: string[] = [];
        let chapterCounter = 0;

        book.chapters.forEach(chapter => {
            if (chapter.kind === "chapter") {
                labels.push(String(++chapterCounter));
            } else {
                labels.push(chapter.chapterLabel);
            }
        });

        return labels;
    }

    private handleControlsClick(e: MouseEvent) {
        // 1. Find the clicked element (or its parent button)
        const target = (e.target as HTMLElement).closest(".nn-button-chapter, .nn-overflow-button");

        if (!target) return;

        // 2. If it's the overflow button, we let its specific listener handle the menu
        if (target.classList.contains("nn-button-overflow")) {
            return;
        }

        // 3. Otherwise, it's a chapter button
        const path = target.getAttribute("data-path");
        if (path) {
            void this.app.workspace.openLinkText(path, "", false);
        }
    }

    private measureMissingLabels(labels: string[]) {
        const missing = labels.filter(label => !BookToolbar.labelCache.has(label));
        const missingOverflow = !BookToolbar.labelCache.has("__overflow__");

        if (missing.length === 0 && !missingOverflow) {
            return;
        }

        // Create the sandbox and attach it to the DOM to get real computed styles
        const sandbox = document.createElement("div");
        sandbox.setAttribute("data-nn-type", "book-info");
        sandbox.className = "nn-toolbar";

        sandbox.style.display = "flex";
        sandbox.style.position = "absolute";
        sandbox.style.top = "-9999px";
        sandbox.style.visibility = "hidden";
        sandbox.style.zIndex = "-9999";
        sandbox.style.pointerEvents = "none";

        const controls = sandbox.createDiv({cls: "nn-controls"});
        const messenger = document.createElement("button");
        messenger.className = "clickable-icon";
        controls.appendChild(messenger);

        document.body.appendChild(sandbox);

        try {
            // Measure missing text labels
            for (const label of missing) {
                messenger.textContent = label;
                BookToolbar.labelCache.set(label, messenger.getBoundingClientRect().width);
            }

            // Measure the overflow icon button if needed
            if (!BookToolbar.labelCache.has("__overflow__")) {
                messenger.textContent = "";
                const icon = this.svgFromString(this.icons.ellipsis);
                messenger.appendChild(icon);
                BookToolbar.labelCache.set("__overflow__", messenger.getBoundingClientRect().width);
            }
        } finally {
            // Cleanup
            sandbox.remove();
        }
    }

    private setupMenu(button: HTMLButtonElement) {
        button.addEventListener("click", (e) => {
            const menu = new Menu();

            const hiddenElements = this.buttonElements
                .map(b => b.element)
                .filter(el => el.classList.contains("is-hidden"));

            if (hiddenElements.length === 0) {
                return;
            }

            hiddenElements.forEach(btn => {
                menu.addItem(item => {
                    item.setTitle(btn.getAttribute("aria-label") || btn.textContent || "")
                        .onClick(() => {
                            btn.click();
                        });
                });
            });
            menu.showAtMouseEvent(e);
        });
    }
}