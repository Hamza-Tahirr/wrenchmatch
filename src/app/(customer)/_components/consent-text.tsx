import { Fragment } from "react";

// Consent statements are stored word for word in snapshots, so the UI shows the exact text
// and only turns the named documents into links (opening in a new tab, so the form keeps
// what the person typed).

const DOCUMENT_LINKS: Readonly<Record<string, string>> = {
  "Terms of Service": "/help#terms",
  "Privacy Notice": "/help#privacy",
};

const PATTERN = new RegExp(`(${Object.keys(DOCUMENT_LINKS).join("|")})`);

export function ConsentText({ text }: { text: string }) {
  return (
    <>
      {text.split(PATTERN).map((part, index) => {
        const href = DOCUMENT_LINKS[part];
        if (!href) return <Fragment key={index}>{part}</Fragment>;
        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            {part}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
      })}
    </>
  );
}
