import { CopyButton } from "./copy-button";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showCopy?: boolean;
}

export function CodeBlock({ code, title, showCopy = true }: CodeBlockProps) {
  return (
    <div className="rounded-lg border bg-muted/30" data-testid="code-block">
      {title && (
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-medium">{title}</span>
          {showCopy && <CopyButton text={code} />}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4">
          <code className="text-sm">{code}</code>
        </pre>
        {!title && showCopy && (
          <div className="absolute right-2 top-2">
            <CopyButton text={code} />
          </div>
        )}
      </div>
    </div>
  );
}
