// src/toolbars/BaseToolbar.ts
import {App} from "obsidian";

export abstract class BaseToolbar {
    protected constructor(protected app: App) {
    }

    protected svgFromString(svgText: string): SVGElement {
        const template = document.createElement("template");
        template.innerHTML = svgText.trim();
        return template.content.firstElementChild as SVGElement;
    }

    protected createIconNavButton(
        iconSvg: SVGElement,
        ariaLabel: string,
        onClick: () => void,
        isDisabled = false,
        isActive = false
    ): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.className = "clickable-icon";
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute("aria-label", ariaLabel);

        if (isActive) {
            btn.setAttribute("aria-disabled", "true");
            btn.dataset.active = "";
        } else if (isDisabled) {
            btn.setAttribute("aria-disabled", "true");
            btn.disabled = true;
        } else {
            btn.onclick = onClick;
        }

        btn.appendChild(iconSvg);
        return btn;
    }
}