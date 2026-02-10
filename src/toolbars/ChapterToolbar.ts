// src/toolbars/ChapterToolbar.ts
import { App, TFile } from "obsidian";
import { BaseToolbar } from "./BaseToolbar";

export class ChapterToolbar extends BaseToolbar {
    constructor(
        app: App,
        private container: HTMLElement,
        private icons: { [key: string]: string }
    ) {
        super(app);
    }

    public render(chapter: any, stage: any, nav: any, file: TFile, infoButton: HTMLButtonElement) {
        this.container.innerHTML = "";

        const controls = document.createElement("div");
        controls.className = "nn-controls";
        controls.append(infoButton);

        if (stage) {
            const stageControls = document.createElement("div");
            stageControls.className = "nn-controls__stage";

            const navItems = [
                { svg: this.icons.outline, label: "Open Outline", target: nav.outline },
                { svg: this.icons.draft, label: "Open Draft", target: nav.draft },
                { svg: this.icons.final, label: "Open Final", target: nav.final },
            ];

            navItems.forEach(item => {
                const svg = this.svgFromString(item.svg);
                const disabled = item.target.kind === "disabled";
                const active = item.target.kind === "file" && file === item.target.file;

                stageControls.append(this.createIconNavButton(svg, item.label, () => {
                    this.app.workspace.openLinkText(item.target.file.path, "", false);
                }, disabled, active));
            });
            controls.append(stageControls);
        }

        const chapterControls = document.createElement("div");
        chapterControls.className = "nn-controls__chapter";

        // Prev/Next
        const prevSvg = this.svgFromString(this.icons.previous);
        const nextSvg = this.svgFromString(this.icons.next);

        chapterControls.append(
            this.createIconNavButton(prevSvg, "Previous Chapter", () => {
                this.app.workspace.openLinkText(nav.previous.file.path, "", false);
            }, nav.previous.kind === "disabled"),
            this.createIconNavButton(nextSvg, "Next Chapter", () => {
                this.app.workspace.openLinkText(nav.next.file.path, "", false);
            }, nav.next.kind === "disabled")
        );

        controls.append(chapterControls);

        // Metadata
        const meta = document.createElement("div");
        meta.className = "nn-meta";
        this.renderMetadata(meta, chapter);

        this.container.append(controls, meta);
    }

    private buildMetadata(el: HTMLElement, chapter: any) {
        const seg = (cls: string, txt: string) => {
            const s = el.createSpan({ cls: `nn-meta__segment ${cls}` });
            s.textContent = txt;
        };
        seg("nn-meta__segment--chapter", chapter.chapterLabel);
        if (chapter.datetime) seg("nn-meta__segment--datetime", chapter.datetime);
        if (chapter.location) seg("nn-meta__segment--location", chapter.location);
    }

    private renderMetadata(metaContainer: HTMLElement, chapter: any) {
        const metaNodes: HTMLElement[] = [];

        // Chapter label with inner span
        const inner = document.createElement("span");
        inner.textContent = chapter.chapterLabel;
        metaNodes.push(this.makeSpan("nn-meta__segment nn-meta__segment--chapter", inner));

        // Datetime with hasValue check
        if (this.hasValue(chapter.datetime)) {
            metaNodes.push(this.makeSpan("nn-meta__segment nn-meta__segment--datetime", chapter.datetime));
        }

        // Location with hasValue check
        if (this.hasValue(chapter.location)) {
            metaNodes.push(this.makeSpan("nn-meta__segment nn-meta__segment--location", chapter.location));
        }

        metaContainer.replaceChildren(...metaNodes);
    }
    
    private hasValue(v: unknown): v is string {
        return typeof v === "string" && v.trim().length > 0;
    }

    private makeSpan(className: string, content: string | Node): HTMLElement {
        const el = document.createElement("span");
        el.className = className;

        if (typeof content === "string") {
            el.textContent = content;
        } else {
            el.appendChild(content);
        }
        return el;
    }
}