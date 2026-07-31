import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import Mermaid from '../components/Mermaid';

// A polished Markdown renderer that supports GFM, math (KaTeX), code
// highlighting, and Mermaid diagrams (for ```mermaid fences).
export default function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={`sf-markdown text-sm text-ink-800 leading-relaxed ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          code({ className: cls, children, ...props }: any) {
            const match = /language-(\w+)/.exec(cls || '');
            const lang = match?.[1];
            const text = String(children ?? '');
            if (lang === 'mermaid') {
              return <Mermaid chart={text.replace(/\n$/, '')} />;
            }
            return (
              <code className={[cls, 'sf-markdown-code', ...(lang ? [`language-${lang}`] : [])].filter(Boolean).join(' ')} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }: any) {
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline" {...props}>
                {children}
              </a>
            );
          },
          table({ children, ...props }: any) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full text-xs border border-ink-200 rounded-lg" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }: any) {
            return (
              <th className="border border-ink-200 bg-ink-50 px-2 py-1 text-left font-semibold" {...props}>
                {children}
              </th>
            );
          },
          td({ children, ...props }: any) {
            return (
              <td className="border border-ink-200 px-2 py-1" {...props}>
                {children}
              </td>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
