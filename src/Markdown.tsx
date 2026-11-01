import React from 'react';
// Render a deliberately small Markdown subset using React text nodes, never raw HTML.
function inline(text: string): React.ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g)
    .map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('`') && part.endsWith('`'))
        return <code key={i}>{part.slice(1, -1)}</code>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link)
        return (
          <a key={i} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        );
      return part;
    });
}
export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      const key = i;
      while (++i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i]);
      nodes.push(
        <pre key={key}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      nodes.push(
        React.createElement(
          `h${Math.min(heading[1].length + 1, 6)}`,
          { key: i },
          inline(heading[2]),
        ),
      );
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      nodes.push(<hr key={i} />);
      continue;
    }
    const list = /^\s*(?:[-*+] |\d+\. )/.exec(line);
    if (list) {
      const items: React.ReactNode[] = [];
      const key = i;
      const ordered = /^\s*\d+\./.test(line);
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\. / : /^\s*[-*+] /).test(lines[i])
      ) {
        items.push(
          <li key={i}>
            {inline(lines[i].replace(/^\s*(?:[-*+] |\d+\. )/, ''))}
          </li>,
        );
        i++;
      }
      i--;
      nodes.push(
        ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      nodes.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
      continue;
    }
    nodes.push(<p key={i}>{inline(line)}</p>);
  }
  return <div className="markdown">{nodes}</div>;
}
