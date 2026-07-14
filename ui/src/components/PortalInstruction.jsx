import React from "react";

function PortalTable({ headers, rows }) {
  if (!headers?.length) return null;
  return (
    <div className="artek-table-wrap">
      <table className="artek-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PortalBlock({ block }) {
  if (!block) return null;
  switch (block.type) {
    case "heading":
      if (block.level === 3) {
        return <h4 className="artek-instruction-h4">{block.text}</h4>;
      }
      return <h3 className="artek-instruction-h3">{block.text}</h3>;
    case "paragraph":
      return <p>{block.text}</p>;
    case "note":
      return <p className="artek-instruction-note">{block.text}</p>;
    case "list":
      return (
        <ul className="artek-instruction-list">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "olist":
      return (
        <ol className="artek-instruction-list">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return <PortalTable headers={block.headers} rows={block.rows} />;
    case "code":
      return <pre className="artek-instruction-code">{block.text}</pre>;
    default:
      return null;
  }
}

export default function PortalInstruction({ document }) {
  if (!document?.blocks?.length) {
    return <p className="artek-muted">Текст временно недоступен.</p>;
  }
  return (
    <div className="artek-instruction-text">
      {document.title ? <h3 className="artek-instruction-doc-title">{document.title}</h3> : null}
      {document.blocks.map((block, i) => (
        <PortalBlock key={i} block={block} />
      ))}
    </div>
  );
}
