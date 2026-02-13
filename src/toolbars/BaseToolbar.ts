// src/toolbars/BaseToolbar.ts
import {App} from "obsidian";

export abstract class BaseToolbar {
    protected constructor(protected app: App) {
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

    protected getUsableWidth(el: HTMLElement): number {
        const style = window.getComputedStyle(el);

        // Use parseFloat to handle the subpixel accuracy (906.5px) 
        // that getBoundingClientRect provides.
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;

        const rect = el.getBoundingClientRect();

        // We use Math.max to ensure we never return a negative number
        // if padding somehow exceeds the container size.
        return Math.max(0, rect.width - paddingLeft - paddingRight);
    }
    
    /**
     * Checks the CSS sentinel to ensure that the stylesheet has been injected and parsed.
     * @param container
     * @protected
     */
    protected isCssReady(container: HTMLElement): boolean {
        const style = window.getComputedStyle(container);
        const val = style.getPropertyValue('--nn-css-ready').trim();
        return val === "1";
    }

    protected svgFromString(svgText: string): SVGElement {
        const template = document.createElement("template");
        template.innerHTML = svgText.trim();
        return template.content.firstElementChild as SVGElement;
    }
}