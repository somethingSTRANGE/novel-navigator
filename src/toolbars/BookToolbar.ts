// src/toolbars/BookToolbar.ts
import {App, Menu} from "obsidian";
import {BaseToolbar} from "./BaseToolbar";
import {BookEntry, ChapterEntry} from "../types";

export interface BookToolbarIcons {
    ellipsis: string;
}

export class BookToolbar extends BaseToolbar {
    private btnWidths: number[] = [];
    private totalNaturalWidth = 0;
    private ovrWidth = 0;
    private lastRange = {start: -1, end: -1};
    private buttons: HTMLButtonElement[] = [];
    private overflowBtn!: HTMLButtonElement;
    private controls!: HTMLElement;
    private observer!: ResizeObserver;

    constructor(
        app: App,
        private container: HTMLElement,
        private icons: BookToolbarIcons
    ) {
        super(app);

        this.observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width <= 0) return;
            void this.runLayout(rect.width);
        })
    }

    public update(book: BookEntry) {
        this.container.innerHTML = "";
        this.container.dataset.nnType = "book-info";

        this.buttons = [];
        this.btnWidths = [];
        this.lastRange = {start: -1, end: -1};

        this.controls = this.container.createDiv({cls: "nn-controls"});

        // 1. Create all buttons
        let chapterCounter = 0;
        book.chapters.forEach((ch, idx) => {
            const label = ch.kind === "chapter" ? String(++chapterCounter) : ch.chapterLabel;
            const btn = this.createChapterButton(ch, label);
            this.controls.appendChild(btn);
            this.buttons.push(btn);
        });

        // 2. Create overflow button
        const ellipsisSvg = this.svgFromString(this.icons.ellipsis);
        this.overflowBtn = this.createOverflowButton(ellipsisSvg, "Hidden Chapters Menu");
        this.overflowBtn.classList.add("nn-overflow-btn");
        this.controls.appendChild(this.overflowBtn);

        this.setupMenu();
        // this.setupObserver();

        // 3. Start observing the new controls element
        window.requestAnimationFrame(() => this.observer.observe(this.controls));
    }

    public destroy() {
        this.observer.disconnect();
    }

    private createChapterButton(chapter: ChapterEntry, label: string): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.classList.add("clickable-icon");
        btn.setAttribute("aria-label", chapter.chapterLabel);
        btn.textContent = label;
        btn.addEventListener("click", () => {
            if (chapter.file) {
                void this.app.workspace.openLinkText(chapter.file.path, "/", false);
            }
        });
        return btn;
    }

    private createOverflowButton(iconSvg: SVGElement, ariaLabel: string): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-label", ariaLabel);
        btn.appendChild(iconSvg);
        return btn;
    }

    private setupMenu() {
        this.overflowBtn.addEventListener("click", (e) => {
            const menu = new Menu();
            const hidden = this.buttons.filter(btn => btn.classList.contains("is-hidden"));

            hidden.forEach(btn => {
                menu.addItem(item => {
                    item.setTitle(btn.getAttribute("aria-label") || btn.textContent || "")
                        .onClick(() => btn.click());
                });
            });
            menu.showAtMouseEvent(e);
        });
    }

    private setupObserver() {
        this.observer = new ResizeObserver((entries) => {
            const rect = entries[0].contentRect;
            if (rect.width <= 0) return;
            void this.runLayout(rect.width);
        });
        window.requestAnimationFrame(() => this.observer.observe(this.controls));
    }

    private async runLayout(containerWidth: number) {
        // Wait for CSS if widths are not cached or seem incorrect

        // 1. MEASUREMENT CHECK
        // We remeasure if:
        // a) We haven't measured yet (length === 0)
        // b) We find ANY button < 25px (Your CSS min is 28px, so < 25px 
        //    means the browser is measuring raw text before styles apply).
        const needsMeasurement = this.btnWidths.length === 0 ||
            this.btnWidths.some(w => w < 25);

        if (needsMeasurement) {
            await new Promise(resolve => window.requestAnimationFrame(resolve));
            this.btnWidths = this.buttons.map(b => {
                const w = b.getBoundingClientRect().width;
                b.setAttribute("data-width", Math.round(w).toString());
                return w;
            });
            this.totalNaturalWidth = this.btnWidths.reduce((a, b) => a + b, 0);
            this.ovrWidth = this.overflowBtn.getBoundingClientRect().width || 34;

            console.log("Book Toolbar measured: ", this.btnWidths)
        }

        let hStart = -1;
        let hEnd = -1;

        // We use a 2px "safety buffer" to prevent flickering at edge cases
        if (this.totalNaturalWidth > containerWidth - 2) {
            let currentWidth = this.totalNaturalWidth + this.ovrWidth;
            hStart = Math.floor(this.buttons.length / 2);
            hEnd = hStart;

            while (currentWidth > containerWidth && (hStart >= 0 || hEnd < this.buttons.length)) {
                currentWidth -= this.btnWidths[hStart] || 0;
                if (hStart !== hEnd) {
                    currentWidth -= this.btnWidths[hEnd] || 0;
                }
                if (currentWidth <= containerWidth) break;
                if (hStart > 0) hStart--;
                if (hEnd < this.buttons.length - 1) hEnd++;
            }
        }

        if (hStart !== this.lastRange.start || hEnd !== this.lastRange.end) {
            this.lastRange = {start: hStart, end: hEnd};
            this.buttons.forEach((btn, idx) => {
                const hide = idx >= hStart && idx <= hEnd;
                btn.classList.toggle("is-hidden", hide);
            });

            if (hStart !== -1) {
                this.overflowBtn.style.display = "flex";
                this.controls.insertBefore(this.overflowBtn, this.buttons[hStart]);
            } else {
                this.overflowBtn.style.display = "none";
            }
        }
    }
}