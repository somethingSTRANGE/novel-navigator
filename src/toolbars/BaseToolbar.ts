// src/toolbars/BaseToolbar.ts
import { App, TFile } from "obsidian";

export abstract class BaseToolbar {
    constructor(protected app: App) {}

    protected svgFromString(svgText: string): SVGElement {
        const template = document.createElement("template");
        template.innerHTML = svgText.trim();
        return template.content.firstElementChild as SVGElement;
    }

    protected createIconNavButton(
        iconSvg: SVGElement,
        ariaLabel: string,
        onClick: () => void,
        disabled = false,
        isActive = false
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-label", ariaLabel);

        if (isActive) {
            btn.setAttribute("aria-disabled", "true");
            btn.dataset.active = "";
        } else if (disabled) {
            btn.setAttribute("aria-disabled", "true");
            btn.disabled = true;
        } else {
            btn.onclick = onClick;
        }

        btn.appendChild(iconSvg);
        return btn;
    }
}