// src/types.ts
import {TFile} from "obsidian";

export interface BookEntry {
    file: TFile;
    title: string;

    prologue?: ChapterEntry;
    epilogue?: ChapterEntry;
    chapters: ChapterEntry[];
}

export interface ChapterContext {
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

export interface ChapterEntry {
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

export interface ChapterNavigationTargets {
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

export interface NovelIndex {
    books: Map<string, BookEntry>;
    chapters: Map<string, ChapterEntry>;
    stages: Map<string, StageEntry>;
}

export interface PendingBook {
    bookFile: TFile;
    title: string;

    prologueFile?: TFile;
    epilogueFile?: TFile;
    chapterFiles: TFile[];
}

export interface StageEntry {
    file: TFile;
    chapter: ChapterEntry;
    stage: ChapterStage;
}

export type BookToolbarMode = "truncate-end" | "truncate-middle" | "dynamic-scrubber";

export type ChapterStage = "info" | "outline" | "draft" | "final";

export type NavigationTarget =
    | { kind: "file"; file: TFile }
    | { kind: "disabled" };

export type ToolbarMode =
    | { kind: "none" }
    | { kind: "book-info"; book: BookEntry }
    | { kind: "chapter-info"; chapter: ChapterEntry }
    | { kind: "chapter-stage"; stage: StageEntry };

