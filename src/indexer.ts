// src/indexer.ts
import {App, TFile} from "obsidian";
import {logger} from './logger';
import {
    BookEntry,
    ChapterEntry,
    ChapterNavigationTargets,
    ChapterStage,
    NavigationTarget,
    NovelIndex,
    PendingBook,
    StageEntry,
    ToolbarMode
} from "./types";

export class NovelIndexer {
    private lastIndex: NovelIndex | null = null;

    constructor(private app: App) {
    }

    public async buildIndex(): Promise<NovelIndex> {
        const pendingBooks: PendingBook[] = [];
        const cache = this.app.metadataCache;
        const files = this.app.vault.getMarkdownFiles();

        // 1. Discover book info files
        for (const file of files) {
            const fm = cache.getFileCache(file)?.frontmatter;
            if (!fm?.book_title || !Array.isArray(fm.chapters)) {
                continue;
            }

            const chapterFiles = fm.chapters
                .map((link: string) => this.resolveWikiLink(link, file))
                .filter((f): f is TFile => !!f);

            const prologueFile = this.resolveWikiLink(fm.prologue, file);
            const epilogueFile = this.resolveWikiLink(fm.epilogue, file);

            pendingBooks.push({
                bookFile: file,
                title: fm.book_title,
                prologueFile,
                epilogueFile,
                chapterFiles
            });
        }

        const books = new Map<string, BookEntry>();
        const chapters = new Map<string, ChapterEntry>();
        const stages = new Map<string, StageEntry>();

        // 2. Build chapter entries
        for (const pending of pendingBooks) {
            const book: BookEntry = {
                file: pending.bookFile,
                title: pending.title,
                chapters: [],
            };

            books.set(book.file.path, book);

            const allChapterFiles = [
                pending.prologueFile,
                ...pending.chapterFiles,
                pending.epilogueFile
            ].filter((f): f is TFile => !!f);

            allChapterFiles.forEach((chapterFile, index) => {
                const fm = cache.getFileCache(chapterFile)?.frontmatter ?? {};

                const chapter: ChapterEntry = {
                    book,
                    file: chapterFile,
                    index,
                    kind: this.getChapterKind(chapterFile, pending),
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
                if (chapter.kind === "prologue") book.prologue = chapter;
                if (chapter.kind === "epilogue") book.epilogue = chapter;

                chapters.set(chapterFile.path, chapter);
            });

            this.assignLabelsAndNumbers(book);
        }

        // 3. Build stage entries
        for (const chapter of chapters.values()) {
            const potentialStages = [
                {name: "outline", file: chapter.outline},
                {name: "draft", file: chapter.draft},
                {name: "final", file: chapter.final},
            ] as const;

            for (const s of potentialStages) {
                if (s.file) {
                    stages.set(s.file.path, {
                        file: s.file,
                        chapter,
                        stage: s.name as any,
                    });
                }
            }
        }

        const index = {books, chapters, stages};
        this.lastIndex = index; // Cache it for navigation lookups.
        return index;
    }

    public resolveToolbarModeForFile(file: TFile): ToolbarMode {
        if (!this.lastIndex) return {kind: "none"};

        const {books, chapters, stages} = this.lastIndex;

        const stage = stages.get(file.path);
        if (stage) return {kind: "chapter-stage", stage};

        const chapter = chapters.get(file.path);
        if (chapter) {
            return {
                kind: "chapter-stage",
                stage: {chapter, stage: "info", file: chapter.info!},
            };
        }

        const book = books.get(file.path);
        if (book) return {kind: "book-info", book};

        return {kind: "none"};
    }

    public resolveWikiLink(link: string | undefined, sourceFile: TFile): TFile | undefined {
        if (!link) return undefined;
        const dest = this.app.metadataCache.getFirstLinkpathDest(
            link.replace(/^\[\[|]]$/g, ""),
            sourceFile.path
        );
        return dest ?? undefined;
    }

    public getNavigationTargets(stage: StageEntry): ChapterNavigationTargets {
        if (!this.lastIndex) {
            logger.warn("Navigation requested before index was built.");
        }

        const {chapter} = stage;

        return {
            bookInfo: this.getBookInfoTarget(chapter.book),

            chapterInfo: this.getStageTarget(chapter, "info"),
            outline: this.getStageTarget(chapter, "outline"),
            draft: this.getStageTarget(chapter, "draft"),
            final: this.getStageTarget(chapter, "final"),

            previous: this.getAdjacentChapterTarget(chapter, stage.stage, "previous"),
            next: this.getAdjacentChapterTarget(chapter, stage.stage, "next"),
        };
    }

    private assignLabelsAndNumbers(book: BookEntry) {
        let chapterCounter = 0;
        for (const chapter of book.chapters) {
            if (chapter.kind === "prologue") {
                chapter.chapterLabel = "Prologue";
            } else if (chapter.kind === "epilogue") {
                chapter.chapterLabel = "Epilogue";
            } else {
                chapterCounter++;
                chapter.chapterNumber = chapterCounter;
                chapter.chapterLabel = `Chapter ${chapterCounter}`;
            }
        }
    }

    private getChapterKind(file: TFile, pending: PendingBook): "prologue" | "epilogue" | "chapter" {
        if (file === pending.prologueFile) return "prologue";
        if (file === pending.epilogueFile) return "epilogue";
        return "chapter";
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

    private getStageTarget(
        chapter: ChapterEntry,
        stage: ChapterStage
    ): NavigationTarget {
        const file = chapter[stage];
        return file ? {kind: "file", file} : {kind: "disabled"};
    }

}