"use client";

import { useEffect, useRef } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { type EditorState, type LexicalEditor as LexicalEditorType, $getRoot, $createParagraphNode, $createTextNode } from "lexical";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * LexicalEditor — a plain-text Lexical wrapper for the chapter editor.
 *
 * STORAGE CONTRACT (do not violate):
 *   This component loads from a plain string (the `value` prop) and
 *   writes back a plain string (via `onChange`). The stored chapter
 *   format never changes — Lexical is a view/interaction layer only.
 *
 * INTERFACE:
 *   - value: string         → the chapter content (plain text)
 *   - onChange: (text) => void → fires on every edit with the new plain text
 *   - placeholder?: string → shown when empty
 *   - className?: string   → styling (font, size, padding, etc.)
 *   - editorRef?: Ref      → gives parent access to the editor instance
 *                           (used for AI Insert, @mention cleanup, etc.)
 *
 *   Actually uses onEditorReady callback instead of a ref — avoids the
 *   React 19 ref immutability lint rule.
 *
 * SYNC STRATEGY (prevents infinite loops):
 *   1. On mount: initialize editor with `value`.
 *   2. On user type: OnChangePlugin fires → we call onChange(plainText).
 *      The parent calls setText(newText) → `value` prop changes.
 *      But the editor already has this text, so the sync effect is a no-op.
 *   3. On external change (AI Insert, @mention cleanup, glossary cleanup):
 *      Parent calls setText(cleaned) → `value` prop changes.
 *      The sync effect detects value !== currentEditorText → updates editor.
 *
 *   The key is step 3: the editor only re-initializes when the external
 *   value differs from what it already has. This is tracked via a ref
 *   that captures the last text we know the editor has.
 * ------------------------------------------------------------------ */

/**
 * Set the editor's content from a plain string.
 * Creates paragraph nodes for each line (split by \n), which is how
 * Lexical PlainText mode represents text.
 *
 * This replaces the non-existent root.setTextContent() call —
 * Lexical's RootNode doesn't have that method, so the old code was
 * silently failing and the editor stayed empty.
 */
function setEditorText(text: string) {
  const root = $getRoot();
  root.clear();
  if (!text) return;
  const lines = text.split("\n");
  for (const line of lines) {
    const paragraph = $createParagraphNode();
    if (line) {
      paragraph.append($createTextNode(line));
    }
    root.append(paragraph);
  }
}
function ExternalSyncPlugin({
  value,
  lastEditorTextRef,
}: {
  value: string;
  lastEditorTextRef: React.MutableRefObject<string | undefined>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Only sync if the external value differs from what the editor
    // currently has. This prevents infinite loops:
    //   user types → onChange → parent setText → value changes →
    //   but lastEditorTextRef already has the new text, so we skip.
    if (value === lastEditorTextRef.current) return;

    // Read the editor's actual current text (not just the ref) — this
    // catches the case where the editor was initialized empty (value
    // was "" on mount because chapter data hadn't arrived yet) and now
    // real content has arrived.
    const editorText = editor.getEditorState().read(() => $getRoot().getTextContent());
    if (value === editorText) {
      // Editor already has this text — just update the ref so we don't
      // keep checking.
      lastEditorTextRef.current = value;
      return;
    }

    editor.update(() => {
      setEditorText(value);
      lastEditorTextRef.current = value;
    }, { tag: "external-sync" });
  }, [value, editor, lastEditorTextRef]);

  return null;
}

/**
 * The main LexicalEditor wrapper component.
 */
export function LexicalEditor({
  value,
  onChange,
  placeholder = "Start typing…",
  className,
  onEditorReady,
  ariaLabel,
}: {
  value: string;
  onChange: (plainText: string) => void;
  placeholder?: string;
  className?: string;
  onEditorReady?: (editor: LexicalEditorType) => void;
  ariaLabel?: string;
}) {
  // Tracks the last text we know the editor has. Used to detect
  // whether a `value` prop change came from the editor itself (skip)
  // or from an external source (apply).
  // Initialized to undefined (not value) so the first sync effect always
  // runs — this catches the case where the editor mounts before chapter
  // data arrives, then the data arrives and needs to be loaded in.
  const lastEditorTextRef = useRef<string | undefined>(undefined);

  const initialConfig = {
    namespace: "BookHubChapterEditor",
    theme: {
      // Minimal theme — plain text, no decorations yet.
      // In Phase 3, this is where grammar/spelling underline styles
      // will be added (e.g. paragraph: "editor-paragraph", text: {...}).
      paragraph: "editor-paragraph",
      text: {
        bold: () => null,    // plain-text mode: no bold
        italic: () => null,   // plain-text mode: no italic
        underline: () => null,
        strikethrough: () => null,
        code: () => null,
      },
    },
    onError(error: Error) {
      console.error("Lexical error:", error);
    },
    // Don't set initialEditorState here — we use PlainTextPlugin's
    // initialEditorState prop instead, which is the Lexical-recommended
    // way for plain text.
  };

  function handleChange(editorState: EditorState, editor: LexicalEditorType, tags: Set<string>) {
    // Read the plain text from the editor
    const text = editorState.read(() => $getRoot().getTextContent());
    lastEditorTextRef.current = text;
    onChange(text);
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("relative", className)}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="lexical-content-editable focus:outline-none"
              ariaLabel={ariaLabel ?? "Chapter editor"}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-6 top-6 font-serif text-[18px] leading-[1.8] text-[var(--text-3)]">
              {placeholder}
            </div>
          }
          initialEditorState={(editor) => {
            // Initialize the editor with the existing chapter content.
            // If value is empty (chapter data hasn't arrived yet — common
            // on first mount while the API is still loading), start empty
            // and let ExternalSyncPlugin fill it in when data arrives.
            if (value) {
              setEditorText(value);
              lastEditorTextRef.current = value;
            }
          }}
        />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <HistoryPlugin />
        <ExternalSyncPlugin value={value} lastEditorTextRef={lastEditorTextRef} />
        <EditorReadyPlugin onReady={onEditorReady} />
      </div>
    </LexicalComposer>
  );
}

/**
 * Passes the Lexical editor instance up to the parent via a callback.
 * This lets the parent call editor.update() directly for things like
 * AI Insert (append text at the end) or @mention cleanup (replace text).
 */
function EditorReadyPlugin({ onReady }: { onReady?: (editor: LexicalEditorType) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (onReady) onReady(editor);
  }, [editor, onReady]);
  return null;
}

/* ------------------------------------------------------------------ *
 * Helper utilities — exported so the parent can manipulate the editor
 * programmatically without importing Lexical directly.
 * ------------------------------------------------------------------ */

/**
 * Append text to the end of the editor, with a paragraph separator.
 * Used by the AI "Continue writing" → Insert button.
 */
export function appendTextToEditor(editor: LexicalEditorType, text: string) {
  editor.update(() => {
    const root = $getRoot();
    const current = root.getTextContent();
    const separator = current.endsWith("\n") ? "\n" : "\n\n";
    // Append the new text as paragraph nodes
    const lines = (separator + text).split("\n");
    for (const line of lines) {
      const paragraph = $createParagraphNode();
      if (line) {
        paragraph.append($createTextNode(line));
      }
      root.append(paragraph);
    }
  });
}

/**
 * Replace text in the editor (plain string replace).
 * Used by @mention cleanup ("@Name" → "Name") and glossary cleanup
 * ("!term!" → "term").
 */
export function replaceTextInEditor(editor: LexicalEditorType, search: string, replace: string) {
  editor.update(() => {
    const root = $getRoot();
    const current = root.getTextContent();
    if (current.includes(search)) {
      setEditorText(current.replace(search, replace));
    }
  });
}
