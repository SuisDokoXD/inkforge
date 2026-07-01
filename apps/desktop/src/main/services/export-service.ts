import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  getProject,
  listChapters,
  readChapterFile,
  readCoverFile,
  getBookCover,
} from "@inkforge/storage";
import type { ChapterRecord, ProjectRecord } from "@inkforge/shared";
import { getAppContext } from "./app-state";
import { ZipWriter } from "./zip-writer";

// C6: 封面图片 MIME 类型映射
function coverMimeType(ext: string): string | null {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext.toLowerCase()] ?? null;
}

interface LoadedChapter {
  record: ChapterRecord;
  /** Stripped of leading H1 if matches title to avoid duplicate. */
  body: string;
  text: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripCodeFences(md: string): string {
  // Lightweight: strip leading H1 only if matches chapter title; preserve rest.
  return md;
}

function mdToPlainText(md: string): string {
  // Basic Markdown → plain text: drop fences, headings markup, bold/italic.
  return md
    .replace(/^```[\s\S]*?```$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^>\s+/gm, "");
}

async function loadProjectAndChapters(projectId: string): Promise<{
  project: ProjectRecord;
  chapters: LoadedChapter[];
}> {
  const ctx = getAppContext();
  const project = getProject(ctx.db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const records = listChapters(ctx.db, projectId);
  const chapters: LoadedChapter[] = [];
  for (const record of records) {
    const md = readChapterFile(project.path, record.filePath);
    const body = stripCodeFences(md);
    chapters.push({
      record,
      body,
      text: mdToPlainText(body),
    });
  }
  return { project, chapters };
}

// =====================================================================
// TXT
// =====================================================================

export async function exportProjectTxt(
  projectId: string,
  outputPath: string,
): Promise<{ byteCount: number; chapterCount: number }> {
  const { project, chapters } = await loadProjectAndChapters(projectId);
  const parts: string[] = [];
  parts.push(project.name);
  parts.push("");
  for (const c of chapters) {
    parts.push("", c.record.title, "", c.text.trim(), "");
  }
  const content = parts.join("\n");
  const buf = Buffer.from(content, "utf8");
  await fs.writeFile(outputPath, buf);
  return { byteCount: buf.length, chapterCount: chapters.length };
}

// =====================================================================
// Markdown (single concatenated file)
// =====================================================================

export async function exportProjectMd(
  projectId: string,
  outputPath: string,
): Promise<{ byteCount: number; chapterCount: number }> {
  const { project, chapters } = await loadProjectAndChapters(projectId);
  const parts: string[] = [];
  parts.push(`# ${project.name}`);
  for (const c of chapters) {
    parts.push("", "", `## ${c.record.title}`, "", c.body.trim());
  }
  const content = parts.join("\n");
  const buf = Buffer.from(content, "utf8");
  await fs.writeFile(outputPath, buf);
  return { byteCount: buf.length, chapterCount: chapters.length };
}

// =====================================================================
// HTML (single file with embedded CSS, CJK font stack, anchored TOC)
// =====================================================================

const HTML_CSS = `
body { font-family: "Noto Serif CJK SC", "Source Han Serif SC", "PingFang SC", "Microsoft YaHei", "宋体", serif; max-width: 720px; margin: 2em auto; padding: 0 1em; line-height: 1.8; color: #1f2937; }
h1 { font-size: 1.8em; margin-top: 1.5em; }
h2 { font-size: 1.4em; margin-top: 2.2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
nav { background: #f9fafb; border: 1px solid #e5e7eb; padding: 1em; margin: 1em 0 2em; border-radius: 6px; }
nav ol { padding-left: 1.5em; }
nav a { color: #4f46e5; text-decoration: none; }
nav a:hover { text-decoration: underline; }
p { text-indent: 2em; margin: 0.6em 0; }
@media print { nav { page-break-after: always; } h2 { page-break-before: always; } }
`;

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function exportProjectHtml(
  projectId: string,
  outputPath: string,
): Promise<{ byteCount: number; chapterCount: number }> {
  const { project, chapters } = await loadProjectAndChapters(projectId);
  const tocItems = chapters
    .map(
      (c, i) =>
        `<li><a href="#ch-${String(i + 1).padStart(3, "0")}">${escapeXml(c.record.title)}</a></li>`,
    )
    .join("\n");
  const sections = chapters
    .map((c, i) => {
      const id = `ch-${String(i + 1).padStart(3, "0")}`;
      return `<section id="${id}"><h2>${escapeXml(c.record.title)}</h2>\n${paragraphsToHtml(c.text)}</section>`;
    })
    .join("\n\n");
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(project.name)}</title>
<style>${HTML_CSS}</style>
</head>
<body>
<h1>${escapeXml(project.name)}</h1>
<nav><ol>${tocItems}</ol></nav>
${sections}
</body>
</html>`;
  const buf = Buffer.from(html, "utf8");
  await fs.writeFile(outputPath, buf);
  return { byteCount: buf.length, chapterCount: chapters.length };
}

// =====================================================================
// DOCX (minimal Office Open XML, ZIP of 4 XML files)
// =====================================================================

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCX_DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:pPr><w:ind w:firstLine="480"/><w:spacing w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

function docxParagraph(style: string, text: string): string {
  // Split on \n inside one paragraph -> use <w:br/>
  const runs = text
    .split("\n")
    .map((line) => `<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`)
    .join("<w:r><w:br/></w:r>");
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs}</w:p>`;
}

function buildDocxDocumentXml(project: ProjectRecord, chapters: LoadedChapter[]): string {
  const body: string[] = [];
  body.push(docxParagraph("Title", project.name));
  for (const c of chapters) {
    body.push(docxParagraph("Heading1", c.record.title));
    const paragraphs = c.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const p of paragraphs) {
      body.push(docxParagraph("BodyText", p));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join("")}</w:body>
</w:document>`;
}

export async function exportProjectDocx(
  projectId: string,
  outputPath: string,
): Promise<{ byteCount: number; chapterCount: number }> {
  const { project, chapters } = await loadProjectAndChapters(projectId);
  const zip = new ZipWriter();
  await zip.addFile("[Content_Types].xml", DOCX_CONTENT_TYPES);
  await zip.addFile("_rels/.rels", DOCX_RELS);
  await zip.addFile("word/_rels/document.xml.rels", DOCX_DOC_RELS);
  await zip.addFile("word/styles.xml", DOCX_STYLES);
  await zip.addFile("word/document.xml", buildDocxDocumentXml(project, chapters));
  const buf = zip.finalize();
  await fs.writeFile(outputPath, buf);
  return { byteCount: buf.length, chapterCount: chapters.length };
}

// =====================================================================
// EPUB 3 (minimal: container + OPF + nav + ncx + per-chapter XHTML)
// =====================================================================

const EPUB_STYLES = `/* C6: e-reader CSS with CJK optimizations */
body { font-family: "Noto Serif CJK SC", "Source Han Serif SC", serif; line-height: 1.8; margin: 1em; }
h1 { font-size: 1.6em; margin-top: 1.5em; margin-bottom: 0.8em; text-align: center; }
h2 { font-size: 1.3em; margin-top: 1.2em; margin-bottom: 0.5em; }
p { text-indent: 2em; margin: 0.6em 0; orphans: 2; widows: 2; }
img { max-width: 100%; height: auto; }`;

const EPUB_CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function buildOpf(
  project: ProjectRecord,
  chapters: LoadedChapter[],
  identifier: string,
  hasCover: boolean,
): string {
  const manifest = chapters
    .map(
      (_c, i) =>
        `<item id="ch${String(i + 1).padStart(3, "0")}" href="chapter_${String(i + 1).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n");
  const spine = chapters
    .map((_c, i) => `<itemref idref="ch${String(i + 1).padStart(3, "0")}"/>`)
    .join("\n");
  // C6: Dublin Core metadata from project fields
  const dcCreator = project.genre ? `<dc:creator>${escapeXml("InkForge 作者")}</dc:creator>` : "";
  const dcSubject = project.tags?.length ? `<dc:subject>${escapeXml(project.tags.join(", "))}</dc:subject>` : "";
  const dcDesc = project.synopsis ? `<dc:description>${escapeXml(project.synopsis.slice(0, 500))}</dc:description>` : "";
  const coverManifest = hasCover
    ? `<item id="cover-img" href="cover-image" media-type="image/jpeg" properties="cover-image"/>\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${identifier}</dc:identifier>
<dc:title>${escapeXml(project.name)}</dc:title>
${dcCreator}
${dcSubject}
${dcDesc}
<dc:language>zh-CN</dc:language>
<dc:date>${new Date().toISOString().split("T")[0]}</dc:date>
<meta property="dcterms:modified">${new Date().toISOString().split(".")[0] + "Z"}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="styles.css" media-type="text/css"/>
${coverManifest}${manifest}
</manifest>
<spine toc="ncx">
<itemref idref="nav"/>
${spine}
</spine>
</package>`;
}

function buildNav(chapters: LoadedChapter[]): string {
  const items = chapters
    .map(
      (c, i) =>
        `<li><a href="chapter_${String(i + 1).padStart(3, "0")}.xhtml">${escapeXml(c.record.title)}</a></li>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
<nav epub:type="toc"><h1>目录</h1><ol>${items}</ol></nav>
</body>
</html>`;
}

function buildNcx(project: ProjectRecord, chapters: LoadedChapter[], identifier: string): string {
  const points = chapters
    .map(
      (c, i) =>
        `<navPoint id="ch${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.record.title)}</text></navLabel><content src="chapter_${String(i + 1).padStart(3, "0")}.xhtml"/></navPoint>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:${identifier}"/></head>
<docTitle><text>${escapeXml(project.name)}</text></docTitle>
<navMap>${points}</navMap>
</ncx>`;
}

function buildChapterXhtml(c: LoadedChapter): string {
  const paragraphs = c.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(c.record.title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>
<h1>${escapeXml(c.record.title)}</h1>
${paragraphs}
</body>
</html>`;
}

export async function exportProjectEpub(
  projectId: string,
  outputPath: string,
): Promise<{ byteCount: number; chapterCount: number }> {
  const { project, chapters } = await loadProjectAndChapters(projectId);
  const identifier = randomUUID();

  // C6: 尝试读取封面图嵌入 EPUB
  let coverBuf: Buffer | null = null;
  let coverMime: string | null = null;
  try {
    const ctx = getAppContext();
    const cover = getBookCover(ctx.db, projectId);
    if (cover) {
      const raw = readCoverFile(project.path, cover.filePath);
      if (raw) {
        coverBuf = raw;
        coverMime = cover.mime ?? coverMimeType(cover.filePath) ?? "image/jpeg";
      }
    }
  } catch {
    // 无封面或读取失败→跳过，不影响导出
  }

  const zip = new ZipWriter();
  // mimetype MUST be first and STORED per EPUB spec.
  await zip.addFile("mimetype", "application/epub+zip", 0);
  await zip.addFile("META-INF/container.xml", EPUB_CONTAINER);
  await zip.addFile("OEBPS/styles.css", EPUB_STYLES);
  await zip.addFile("OEBPS/content.opf", buildOpf(project, chapters, identifier, !!coverBuf));
  if (coverBuf && coverMime) {
    await zip.addFile("OEBPS/cover-image", coverBuf);
  }
  await zip.addFile("OEBPS/nav.xhtml", buildNav(chapters));
  await zip.addFile("OEBPS/toc.ncx", buildNcx(project, chapters, identifier));
  for (let i = 0; i < chapters.length; i += 1) {
    await zip.addFile(
      `OEBPS/chapter_${String(i + 1).padStart(3, "0")}.xhtml`,
      buildChapterXhtml(chapters[i]),
    );
  }
  const buf = zip.finalize();
  await fs.writeFile(outputPath, buf);
  return { byteCount: buf.length, chapterCount: chapters.length };
}
