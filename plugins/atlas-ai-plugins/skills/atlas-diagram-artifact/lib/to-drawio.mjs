import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ICON_SIZE = 60;
const CARD_WIDTH = 300;
const CARD_GAP = 20;
const CARD_TOP_GAP = 60;

// draw.io's own palette, which is what the team's hand-made diagrams use:
// colour identifies the component, the Azure icon identifies the resource.
const NODE_STYLES = {
  frontend: { fill: '#dae8fc', stroke: '#6c8ebf' },
  backend: { fill: '#d5e8d4', stroke: '#82b366' },
  database: { fill: '#e6e6e6', stroke: '#666666' },
  cloud: { fill: '#fff2cc', stroke: '#d6b656' },
  security: { fill: '#f8cecc', stroke: '#b85450' },
  messagebus: { fill: '#e1d5e7', stroke: '#9673a6' },
  external: { fill: '#ffe6cc', stroke: '#d79b00' },
  start: { fill: '#d5e8d4', stroke: '#82b366' },
  success: { fill: '#d5e8d4', stroke: '#82b366' },
  failure: { fill: '#f8cecc', stroke: '#b85450' },
  waiting: { fill: '#fff2cc', stroke: '#d6b656' },
  decision: { fill: '#ffe6cc', stroke: '#d79b00' },
  default: { fill: '#f5f5f5', stroke: '#9e9e9e' },
};

const EDGE_STYLES = {
  'a-default': { stroke: '#9a9a9a', width: 1, dashed: 0 },
  'a-emphasis': { stroke: '#6c8ebf', width: 2, dashed: 0 },
  'a-security': { stroke: '#b85450', width: 1, dashed: 0 },
  'a-dashed': { stroke: '#9a9a9a', width: 1, dashed: 1 },
};

// Container frames, in the team's own idiom: dashed outline, no fill, bold
// title centred on the top edge. Azure blue for the cloud we deploy into, red
// for a security boundary, grey for a plain grouping such as a system we do
// not own.
const FRAME_STYLES = {
  region: { stroke: '#0078D4', font: '#0078D4' },
  'security-group': { stroke: '#b85450', font: '#b85450' },
  zone: { stroke: '#666666', font: '#666666' },
};

/**
 * Loads the product-icon rules. Each rule maps a pattern in a node's own wording
 * to a draw.io stencil, so a node that says "Cosmos DB" carries the Cosmos icon
 * instead of a generic box. Missing or unreadable rules simply disable icons.
 */
function loadIcons() {
  try {
    const file = path.join(skillRoot, 'drawio', 'icons.json');
    const rules = JSON.parse(fs.readFileSync(file, 'utf8'));
    return rules.icons.map((rule) => ({ ...rule, regex: new RegExp(rule.match, 'i') }));
  } catch {
    return [];
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(value) {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&bull;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function attributesOf(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) attributes[match[1]] = match[2];
  return attributes;
}

function fail(message) {
  const error = new Error(message);
  error.code = 'DRAWIO_CONVERSION_FAILED';
  throw error;
}

/**
 * Builds a node caption: name in bold, its qualifier in italics, and the tag —
 * a subscription filter, a port, a note — on a third, quieter line.
 */
function caption(primary, secondary, tag) {
  const parts = [];
  if (primary) parts.push(`&lt;b&gt;${escapeXml(primary)}&lt;/b&gt;`);
  if (secondary) parts.push(`&lt;i&gt;${escapeXml(secondary)}&lt;/i&gt;`);
  if (tag) parts.push(`&lt;font color=&quot;#7a7a7a&quot;&gt;${escapeXml(tag)}&lt;/font&gt;`);
  return parts.join('&lt;br/&gt;');
}

function vertex(id, value, style, geometry) {
  return `        <mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1">\n`
    + `          <mxGeometry x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" as="geometry"/>\n`
    + '        </mxCell>';
}

/**
 * Reads the conclusion cards out of the delivered page. They live in the HTML
 * around the diagram, not in the SVG, and carry the facts a reader needs next to
 * the drawing — so the export keeps them as canvas notes.
 * @param {string} source
 */
function extractCards(source) {
  const cards = [];
  for (const block of source.matchAll(/<div class="card">([\s\S]*?)<\/ul>/g)) {
    const title = decodeEntities(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block[1])?.[1] || '');
    const items = [...block[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((item) => decodeEntities(item[1]));
    if (title || items.length) cards.push({ title, items });
  }
  return cards;
}

/**
 * Converts a delivered diagram document into editable draw.io (mxGraph) XML.
 * Geometry, kinds and orthogonal waypoints are read from the rendered SVG, so
 * every diagram type exports through the same path and the draw.io file matches
 * the published layout. Styling follows the team's hand-made diagrams: draw.io's
 * palette for the component, an Azure stencil for the resource, Helvetica, and
 * grey orthogonal connectors.
 * @param {string} source delivered standalone HTML, or a bare SVG document
 * @param {{ name?: string }} [options]
 */
export function toDrawioXml(source, options = {}) {
  const svgStart = source.indexOf('<svg');
  const svgEnd = source.indexOf('</svg>', svgStart);
  if (svgStart < 0 || svgEnd < 0) fail('no <svg> diagram found in the input');
  const svg = source.slice(svgStart, svgEnd);

  const documentTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source.slice(0, svgStart))?.[1]?.trim();
  const name = options.name || documentTitle || 'Diagram';

  const icons = loadIcons();
  const cells = [];
  let frames = 0;
  let nodes = 0;
  let edges = 0;
  let iconed = 0;
  let bottom = 0;
  let left = Number.POSITIVE_INFINITY;

  for (const match of svg.matchAll(/<rect\b[^>]*data-graph-role="structural-frame"[^>]*>/g)) {
    const frame = attributesOf(match[0]);
    const palette = FRAME_STYLES[frame['data-composition-frame-kind']] || FRAME_STYLES.region;
    const style = 'rounded=0;html=1;dashed=1;fillColor=none;verticalAlign=top;align=center;'
      + `fontFamily=Helvetica;fontStyle=1;fontSize=12;spacingTop=4;strokeColor=${palette.stroke};fontColor=${palette.font};`;
    cells.push(vertex(
      `frame-${escapeXml(frame['data-composition-frame-id'])}`,
      escapeXml(frame['data-composition-frame-label'] || ''),
      style,
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    ));
    frames += 1;
  }

  for (const match of svg.matchAll(/<g\b[^>]*data-node-id="[^"]*"[^>]*>/g)) {
    const node = attributesOf(match[0]);
    const rectTag = /<rect\b[^>]*>/.exec(svg.slice(match.index, match.index + 2000));
    if (!rectTag) continue;
    const rect = attributesOf(rectTag[0]);
    const palette = NODE_STYLES[node['data-node-kind']] || NODE_STYLES.default;

    // The label is where the technology is named. A sublabel counts only on an
    // infrastructure node: "API de Documentos / Cosmos + Blob" names its stores,
    // it is not one, and must not borrow their icon. A rule scoped "any" names a
    // runtime the node IS, so it may match a sublabel anywhere.
    const infrastructure = ['database', 'messagebus', 'cloud'].includes(node['data-node-kind']);
    const wording = [node['data-node-label'], infrastructure ? node['data-node-sublabel'] : '']
      .filter(Boolean)
      .join(' ');
    const everything = [node['data-node-label'], node['data-node-sublabel'], node['data-node-tag']]
      .filter(Boolean)
      .join(' ');
    const icon = icons.find((rule) => rule.regex.test(wording)
      || (rule.scope === 'any' && rule.regex.test(everything)));

    const id = `node-${escapeXml(node['data-node-id'])}`;
    const value = caption(node['data-node-label'], node['data-node-sublabel'], node['data-node-tag']);

    if (icon) {
      // The team's own diagrams draw a known resource as the Azure stencil with
      // its description underneath — no box around it.
      cells.push(vertex(
        id,
        value,
        'sketch=0;html=1;aspect=fixed;labelPosition=center;verticalLabelPosition=bottom;verticalAlign=top;'
        + `align=center;fontFamily=Helvetica;fontSize=11;shape=image;image=${escapeXml(icon.url)};`,
        {
          x: Number(rect.x) + (Number(rect.width) - ICON_SIZE) / 2,
          y: Number(rect.y) + (Number(rect.height) - ICON_SIZE) / 2,
          width: ICON_SIZE,
          height: ICON_SIZE,
        },
      ));
      iconed += 1;
    } else {
      cells.push(vertex(
        id,
        value,
        'rounded=1;whiteSpace=wrap;html=1;'
        + `fillColor=${palette.fill};strokeColor=${palette.stroke};`
        + 'fontColor=#000000;fontFamily=Helvetica;fontSize=11;verticalAlign=middle;',
        { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      ));
    }

    bottom = Math.max(bottom, Number(rect.y) + Number(rect.height));
    left = Math.min(left, Number(rect.x));
    nodes += 1;
  }

  const nodeIds = new Set(
    [...svg.matchAll(/<g\b[^>]*data-node-id="([^"]*)"[^>]*>/g)].map((match) => match[1]),
  );

  for (const match of svg.matchAll(/<path\b[^>]*data-composition-points="[^"]*"[^>]*>/g)) {
    const edge = attributesOf(match[0]);
    const points = edge['data-composition-points']
      .split(';')
      .filter(Boolean)
      .map((pair) => pair.split(',').map(Number));
    const waypoints = points.slice(1, -1);
    const variant = (edge.class || '').split(/\s+/).find((token) => EDGE_STYLES[token]) || 'a-default';
    const palette = EDGE_STYLES[variant];
    const style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=auto;orthogonalLoop=1;'
      + `strokeColor=${palette.stroke};strokeWidth=${palette.width};dashed=${palette.dashed};`
      + 'fontFamily=Helvetica;fontSize=10;fontColor=#000000;labelBackgroundColor=#ffffff;endArrow=blockThin;endFill=1;';
    const source_ = nodeIds.has(edge['data-edge-from']) ? ` source="node-${escapeXml(edge['data-edge-from'])}"` : '';
    const target = nodeIds.has(edge['data-edge-to']) ? ` target="node-${escapeXml(edge['data-edge-to'])}"` : '';
    const geometryPoints = waypoints.length
      ? `            <Array as="points">\n${waypoints
        .map((point) => `              <mxPoint x="${point[0]}" y="${point[1]}"/>`)
        .join('\n')}\n            </Array>\n`
      : '';
    const endpoints = source_ && target
      ? ''
      : `            <mxPoint x="${points[0][0]}" y="${points[0][1]}" as="sourcePoint"/>\n`
        + `            <mxPoint x="${points[points.length - 1][0]}" y="${points[points.length - 1][1]}" as="targetPoint"/>\n`;
    cells.push(
      `        <mxCell id="edge-${escapeXml(edge['data-edge-id'] || `${edge['data-edge-from']}-${edge['data-edge-to']}-${edges}`)}" value="${escapeXml(edge['data-edge-label'] || '')}" style="${style}" edge="1" parent="1"${source_}${target}>\n`
      + `          <mxGeometry relative="1" as="geometry">\n${geometryPoints}${endpoints}          </mxGeometry>\n`
      + '        </mxCell>',
    );
    edges += 1;
  }

  if (!nodes) fail('the diagram exposed no nodes; nothing to export');

  const cards = extractCards(source);
  const originX = Number.isFinite(left) ? left : 0;
  cards.forEach((card, index) => {
    const lines = card.items.map((item) => escapeXml(item));
    const height = 34 + lines.reduce((total, line) => total + 16 * Math.max(1, Math.ceil(line.length / 46)), 0);
    const body = lines.map((line) => `• ${line}`).join('&lt;br/&gt;');
    cells.push(vertex(
      `card-${index}`,
      `&lt;b&gt;${escapeXml(card.title)}&lt;/b&gt;&lt;br/&gt;${body}`,
      'text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;rounded=1;fontFamily=Helvetica;fontSize=10;'
      + 'fillColor=#ffffff;strokeColor=#9a9a9a;fontColor=#000000;spacingLeft=8;spacingTop=6;spacingRight=8;',
      {
        x: originX + index * (CARD_WIDTH + CARD_GAP),
        y: bottom + CARD_TOP_GAP,
        width: CARD_WIDTH,
        height,
      },
    ));
  });

  const xml = '<mxfile host="diagram-artifact" agent="diagram-artifact" type="device">\n'
    + `  <diagram id="diagram-artifact" name="${escapeXml(name)}">\n`
    + '    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">\n'
    + '      <root>\n'
    + '        <mxCell id="0"/>\n'
    + '        <mxCell id="1" parent="0"/>\n'
    + `${cells.join('\n')}\n`
    + '      </root>\n'
    + '    </mxGraphModel>\n'
    + '  </diagram>\n'
    + '</mxfile>\n';

  return { xml, name, counts: { frames, nodes, edges, iconed, cards: cards.length } };
}

/**
 * Converts a delivered diagram file and writes the draw.io export.
 * @param {string} inputPath
 * @param {string} outputPath
 */
export function convertFile(inputPath, outputPath) {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  const result = toDrawioXml(fs.readFileSync(resolvedInput, 'utf8'));
  fs.writeFileSync(resolvedOutput, result.xml, 'utf8');
  return {
    source: resolvedInput,
    drawioPath: resolvedOutput,
    name: result.name,
    ...result.counts,
    bytes: Buffer.byteLength(result.xml, 'utf8'),
  };
}
