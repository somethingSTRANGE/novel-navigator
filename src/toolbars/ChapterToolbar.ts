// src/toolbars/ChapterToolbar.ts
import {App, TFile} from "obsidian";
import {BaseToolbar} from "./BaseToolbar";

import {ChapterEntry, ChapterNavigationTargets, StageEntry,} from "../types";


interface ChapterToolbarIcons {
    book: string;
    chapter: string;
    draft: string;
    final: string;
    next: string;
    outline: string;
    previous: string;
}

export class ChapterToolbar extends BaseToolbar {
    constructor(
        app: App,
        private container: HTMLElement,
        private icons: ChapterToolbarIcons
    ) {
        super(app);
    }

    public update(stageEntry: StageEntry, nav: ChapterNavigationTargets, file: TFile) {
        this.container.innerHTML = "";
        const {chapter, stage} = stageEntry;

        // 1. Build the Info Button internally
        const infoButton = this.createInfoButton(stage, nav);

        // 2. Controls Section
        const controls = document.createElement("div");
        controls.className = "nn-controls";
        controls.append(infoButton);

        if (stage) {
            const stageControls = document.createElement("div");
            stageControls.className = "nn-controls__stage";

            const navItems = [
                {svg: this.icons.outline, label: "Open Outline", target: nav.outline},
                {svg: this.icons.draft, label: "Open Draft", target: nav.draft},
                {svg: this.icons.final, label: "Open Final", target: nav.final},
            ];

            navItems.forEach(item => {
                const svg = this.svgFromString(item.svg);
                const disabled = item.target.kind === "disabled";
                const active = item.target.kind === "file" && file === item.target.file;

                stageControls.append(this.createIconNavButton(svg, item.label, () => {
                    if (item.target.kind === "file") {
                        void this.app.workspace.openLinkText(item.target.file.path, "", false);
                    }
                }, disabled, active));
            });
            controls.append(stageControls);
        }

        const chapterControls = document.createElement("div");
        chapterControls.className = "nn-controls__chapter";

        chapterControls.append(
            this.createIconNavButton(
                this.svgFromString(this.icons.previous),
                "Previous Chapter",
                () => {
                    if (nav.previous.kind === "file") {
                        void this.app.workspace.openLinkText(nav.previous.file.path, "", false);
                    }
                },
                nav.previous.kind === "disabled"),
            this.createIconNavButton(
                this.svgFromString(this.icons.next),
                "Next Chapter",
                () => {
                    if (nav.next.kind === "file") {
                        void this.app.workspace.openLinkText(nav.next.file.path, "", false);
                    }
                },
                nav.next.kind === "disabled")
        );

        controls.append(chapterControls);

        // Metadata
        this.container.append(controls, this.createMetadata(chapter));
    }

    private createInfoButton(currentStage: string, nav: any): HTMLButtonElement {
        const isCurrentlyOnInfo = currentStage === "info";

        const icon = isCurrentlyOnInfo ? this.icons.book : this.icons.chapter;
        const label = isCurrentlyOnInfo ? "Open Book Info" : "Open Chapter Info";
        const target = isCurrentlyOnInfo ? nav.bookInfo : nav.chapterInfo;

        return this.createIconNavButton(
            this.svgFromString(icon),
            label,
            () => {
                if (target.kind === "file") {
                    void this.app.workspace.openLinkText(target.file.path, "", false);
                }
            },
            target.kind === "disabled"
        );
    }

    private createMetadata(chapter: ChapterEntry): HTMLDivElement {
        const metaNodes: HTMLElement[] = [];

        // metaNodes.push(this.makeSpan("nn-meta__segment nn-meta__segment--book", chapter.book.title));

        const label = chapter.chapterLabel || "Unknown Chapter";
        const chapterPill = this.createSpan("nn-meta__segment nn-meta__segment--chapter",
            this.createSpan("nn-meta__segment--chapter-label", label) // Inner span for CSS styling
        );
        metaNodes.push(chapterPill);

        if (this.hasValue(chapter.datetime)) {
            metaNodes.push(this.createSpan("nn-meta__segment nn-meta__segment--datetime", chapter.datetime));
        }

        if (this.hasValue(chapter.location)) {
            metaNodes.push(this.createSpan("nn-meta__segment nn-meta__segment--location", chapter.location));
        }

        // Atomic update
        let metaContainer = document.createElement("div");
        metaContainer.className = "nn-meta";
        metaContainer.replaceChildren(...metaNodes);
        return metaContainer;
    }

    private createSpan(className: string, content: string | Node): HTMLElement {
        const el = document.createElement("span");
        el.className = className;

        if (typeof content === "string") {
            el.textContent = content;
        } else {
            el.appendChild(content);
        }
        return el;
    }

    private hasValue(v: unknown): v is string {
        return typeof v === "string" && v.trim().length > 0;
    }
}