import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

type Props = {
  value: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
};

const TOOLBAR = [
  { label: "B",  cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBold().run(),        isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("bold"),               title: "Bold" },
  { label: "I",  cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleItalic().run(),      isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("italic"),             title: "Italic" },
  { label: "H1", cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 1 }).run(), isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("heading", { level: 1 }), title: "Heading 1" },
  { label: "H2", cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 2 }).run(), isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("heading", { level: 2 }), title: "Heading 2" },
  { label: "•—", cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBulletList().run(),  isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("bulletList"),          title: "Bullet list" },
  { label: "1—", cmd: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleOrderedList().run(), isActive: (e: ReturnType<typeof useEditor>) => !!e?.isActive("orderedList"),        title: "Ordered list" },
];

export default function RichEditor({ value, onChange, readOnly = false }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: readOnly }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  if (readOnly) {
    return (
      <div
        className="prose prose-sm max-w-none text-slate-700 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: value || "<p></p>" }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        {TOOLBAR.map(({ label, cmd, isActive, title }) => (
          <button
            key={label}
            type="button"
            title={title}
            onMouseDown={(e) => { e.preventDefault(); cmd(editor); }}
            className={`rounded px-2 py-1 text-xs font-bold transition ${
              isActive(editor)
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="min-h-[120px] px-3 py-2 text-sm text-slate-800
          [&_.ProseMirror]:outline-none
          [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-1
          [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-1
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
          [&_.ProseMirror_p]:mb-1
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-slate-400
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  );
}
