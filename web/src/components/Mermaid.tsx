import { useEffect, useRef, useState } from 'react';

// Renders a mermaid diagram. Dynamically imports mermaid so it is only
// loaded when actually needed. Falls back to showing the raw code on error.
export default function Mermaid({ chart, className }: { chart: string; className?: string }) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = chart.replace(/\n$/, '').trim();
    if (!raw) return;

    // Strip invalid characters that break the mermaid parser: control
    // characters (except newline / carriage-return) and stray NUL bytes.
    const stripInvalidChars = (code: string): string =>
      code.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    // Fix common syntax errors that slip past the server-side sanitizer.
    const fixSyntax = (code: string): string => {
      let out = code;
      // Malformed arrow tokens: "-->|label>" missing closing "|"
      out = out.replace(/-->+\|>([^|]*)/g, (m, label) => `-->|${label}|`);
      // Bare broken arrow fragments
      out = out.replace(/---\|>/g, '-->');
      out = out.replace(/-->\|/g, '-->');
      // Unescaped ampersands inside node labels
      out = out.replace(/&(?![a-zA-Z#])/g, '&amp;');
      // Collapse runs of non-newline whitespace
      out = out.replace(/[^\S\n]{2,}/g, ' ');
      // Trim trailing whitespace on each line
      return out.replace(/[^\S\n]+$/gm, '').trim();
    };

    // Remove comment and blank lines while preserving code structure.
    const sanitize = (code: string): string => {
      const lines = code.split('\n');
      const out: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%%')) continue;
        out.push(line);
      }
      return out.join('\n').trim();
    };

    const code = sanitize(fixSyntax(stripInvalidChars(raw)));
    if (!code) return;

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          suppressErrorRendering: true,
        });
        const id = 'mmd-' + Math.random().toString(36).slice(2, 10);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) {
          setError(null);
          setSvg(svg);
        }
      } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (msg.includes('version') || msg.includes('Syntax error')) {
          if (!cancelled) {
            setError(null);
            setSvg('<pre style="color:#b45309;font-size:12px;padding:8px;">Diagram preview unavailable</pre>');
          }
        } else if (!cancelled) {
          setError('Diagram preview unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre className={`text-xs text-red-500 bg-ink-50 border border-ink-200 p-3 rounded-lg overflow-auto ${className || ''}`}>
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className={`mermaid my-3 flex justify-center ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
