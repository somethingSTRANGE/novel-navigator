# Novel Navigator

*A strange [Obsidian](https://obsidian.md/) plugin for navigating novels, chapters, and their many moving parts.*

---

## Features

* **Chapter-Aware Toolbar**

    * Detects the current chapter via a `chapter_refer` frontmatter property, which points to a **shared anchor file containing canonical chapter information**.
    * Provides **Previous** and **Next** chapter navigation buttons.
    * Highlights missing chapters or stages for quick awareness.

* **Stage-Specific Navigation**

    * Supports multiple stages per chapter (**Outline**, **Draft**, **Final**), each stored in a **separate document**.
    * Detects the current stage via the `chapter_stage` frontmatter property.
    * Opens the correct document for the current stage.
    * Highlights the current stage for easy context recognition.

* **Dynamic Context & File Linking**

    * Infers links and navigation based on **consistent file naming conventions** (e.g., `A03.2` → Book A, Chapter 3, Draft).
    * Supports multiple books with unique identifiers.
    * Optional display of chapter metadata: `chapter_kind`, `chapter_datetime`, `chapter_location`.

* **Lightweight UI Integration**

    * Toolbar displayed at the top of the note (below the formatting bar).
    * Compatible with Source, Preview, and Reading modes.
    * No redundant code embedded in every chapter file.

* **Extensible Design**

    * Easily extendable for additional stages, book-level navigation, or other chapter-aware tools.

---

## Usage

1. **Install the plugin**

    * Copy the compiled plugin files (`main.js`, `manifest.json`, `styles.css`) into your Obsidian vault’s `plugins/novel-navigator/` folder.
    * Enable the plugin in Obsidian Settings → Community Plugins.

2. **Prepare your chapters**

    * Each chapter file should have a `chapter` frontmatter property and `chapter_stage` (e.g., Outline, Draft, Final).
    * Use consistent naming conventions to allow the plugin to infer navigation.

3. **Use the toolbar**

    * Open a chapter file; the **Novel Navigator toolbar** will appear below the formatting bar.
    * Buttons allow you to navigate to:

        * **Previous / Next chapters**
        * **Outline / Draft / Final** versions of the current chapter
    * Missing chapters or stages are highlighted or disabled.

4. **View chapter metadata** (optional)

    * Chapter details like `chapter_kind`, `chapter_datetime`, and `chapter_location` can be displayed in the toolbar as badges or text for quick reference.

---

## License

Copyright 2026 Michael Ryan

This project is licensed under the [Apache License 2.0](LICENSE). See the LICENSE file for details.
