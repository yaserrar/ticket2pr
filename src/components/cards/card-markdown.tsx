import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Trello descriptions are client-written markdown: rendered with GFM, no raw
 * HTML (react-markdown's default), links open in a new tab.
 */
export function CardMarkdown({ children }: { children: string }) {
  return (
    <div className="prose-card">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` must not reach the DOM
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
